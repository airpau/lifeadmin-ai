import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall, getUserTier } from '@/lib/claude-rate-limit';
import { AI_LETTER_DISCLAIMER } from '@/lib/legal-disclaimer';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CANCEL_MODEL = 'claude-haiku-4-5-20251001';

// Category-specific legal context
const CATEGORY_LEGAL_CONTEXT: Record<string, string> = {
  council_tax: `This is a council tax payment to a local authority. Do NOT reference Consumer Contracts Regulations 2013 — council tax is a statutory obligation, not a consumer subscription. Instead:
- If challenging the amount: reference Council Tax (Administration and Enforcement) Regulations 1992
- If requesting a review of the band: reference the Valuation Office Agency process
- If seeking exemption/discount: reference Council Tax (Exempt Dwellings) Order 1992 or Council Tax Reduction Schemes
- If the property is empty: reference empty property exemptions
Write the letter as a formal request to the council, not a cancellation email.`,

  mortgage: `This is a mortgage payment. Do NOT reference Consumer Contracts Regulations 2013. Mortgages are regulated financial products. Instead:
- Reference the Financial Conduct Authority (FCA) Mortgage Conduct of Business rules (MCOB)
- If seeking early repayment: reference the right to make early repayments under the mortgage contract and ask for an Early Repayment Charge (ERC) statement
- If disputing charges: reference the FCA's Treating Customers Fairly (TCF) principles
- Suggest contacting the Financial Ombudsman Service if the complaint is not resolved within 8 weeks`,

  loan: `This is a loan or credit agreement. Instead of Consumer Contracts Regulations 2013, reference:
- Consumer Credit Act 1974 — right to early settlement under Section 94
- Request a settlement figure and any early repayment charges
- FCA Consumer Duty requirements for fair treatment
- If the loan has unfair terms: reference Unfair Contract Terms Act 1977`,

  insurance: `This is an insurance policy. Reference:
- Consumer Insurance (Disclosure and Representations) Act 2012
- FCA Insurance: Conduct of Business Sourcebook (ICOBS)
- Right to cancel within 14-day cooling-off period (if applicable)
- Request confirmation of any refund due for the unexpired portion
- If renewal was automatic and unnotified: reference FCA rules requiring clear renewal notifications`,

  utility: `This is a utility bill (energy/water). Reference:
- For energy: Ofgem Standards of Conduct, Ofgem Supplier Guaranteed Standards
- For water: Water Industry Act 1991, Ofwat Consumer Protection regulations
- Request a final meter reading and final bill
- Ask for any credit balance to be refunded within 10 working days (Ofgem requirement for energy)
- Reference right to switch supplier without penalty (energy)`,

  broadband: `This is a broadband/telecoms contract. Reference:
- Communications Act 2003
- Ofcom General Conditions of Entitlement
- If in contract: ask about early termination charges and whether any Ofcom mid-contract price rise rules apply
- If out of contract: confirm right to cancel with 30 days notice
- Reference right to exit penalty-free if speeds are below Ofcom minimum guaranteed speed`,

  mobile: `This is a mobile phone contract. Reference:
- Communications Act 2003
- Ofcom General Conditions
- If in contract: request early termination charge details
- If out of contract: confirm right to cancel with 30 days notice and request PAC code or STAC code
- Reference Ofcom switching rules`,

  streaming: `This is a streaming/digital subscription. Reference:
- Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013
- Right to cancel digital content subscriptions
- Request confirmation of cancellation and final billing date
- Ask for any pro-rata refund if cancelling mid-billing period`,

  fitness: `This is a gym/fitness membership. Reference:
- Consumer Rights Act 2015 — services must be performed with reasonable care and skill
- If there is a minimum term: acknowledge it but request details of any early termination options
- If the gym has changed terms/facilities: reference right to cancel due to material change
- If cancelled during illness/injury: reference potential right to freeze or cancel under consumer protection law`,

  gambling: `This is a gambling/betting account. Reference:
- Gambling Act 2005
- UK Gambling Commission's Social Responsibility Code
- Request immediate account closure and self-exclusion if desired
- Request any remaining balance to be returned
- The operator must comply with self-exclusion requests`,

  software: `This is a software/SaaS subscription. Reference:
- Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013
- Consumer Rights Act 2015 for digital content
- Request cancellation and confirmation of final billing date
- Ask about data export/deletion rights under GDPR`,
};

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { subscriptionId, providerName, amount, billingCycle, accountEmail, category, cancelMethod, cancelEmail, cancelPhone, feedback, previousEmail } = body;

    if (!providerName) {
      return NextResponse.json({ error: 'Missing providerName' }, { status: 400 });
    }

    // Check Claude rate limit
    const tier = await getUserTier(user.id);
    const rateLimit = await checkClaudeRateLimit(user.id, tier);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    // Get category-specific legal context
    const legalContext = CATEGORY_LEGAL_CONTEXT[category || ''] || CATEGORY_LEGAL_CONTEXT.streaming;

    const feedbackSection = feedback && previousEmail
      ? `\n\nThe user has reviewed a previous version and wants changes:\nPrevious email: ${previousEmail}\nUser's feedback: ${feedback}\n\nPlease regenerate incorporating their feedback.`
      : '';

    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const prompt = `You are a UK consumer rights expert writing a formal letter on behalf of a consumer.

Today's date (use this as the letter date): ${today}
Provider: ${providerName}
Category: ${category || 'unknown'}
Cost: £${amount}/${billingCycle === 'yearly' ? 'year' : billingCycle === 'quarterly' ? 'quarter' : 'month'}
${accountEmail ? `Account email: ${accountEmail}` : ''}
${cancelEmail ? `Known cancellation email: ${cancelEmail}` : ''}
${cancelPhone ? `Known cancellation phone: ${cancelPhone}` : ''}
${cancelMethod ? `Known cancellation method: ${cancelMethod}` : ''}

LEGAL CONTEXT FOR THIS TYPE OF PAYMENT:
${legalContext}

Requirements:
- Write a professional, formal letter (not a casual email)
- Use the correct legal references for this specific type of payment/subscription
- Do NOT use Consumer Contracts Regulations 2013 unless the category is specifically a consumer subscription (streaming, software, etc.)
- Request written confirmation
- Ask for confirmation of final billing date and any refund due
- Keep it under 250 words
- Do not include placeholder brackets — write it ready to send
- Include the sender's closing as "Yours faithfully" for formal letters${feedbackSection}

Return as JSON with keys: subject (string), body (string)`;

    logClaudeCall({
      userId: user.id,
      route: '/api/subscriptions/cancellation-email',
      model: CANCEL_MODEL,
      estimatedInputTokens: 500,
      estimatedOutputTokens: 500,
    });

    const message = await anthropic.messages.create({
      model: CANCEL_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    await recordClaudeCall(user.id, tier);

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response from Claude');

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse response');

    const result = JSON.parse(jsonMatch[0]);

    // Append legal disclaimer to generated cancellation letter
    if (result.body) {
      result.body = result.body + AI_LETTER_DISCLAIMER;
    }

    // Note: We do NOT update subscription status here. Generating a cancellation
    // letter does not mean the user has cancelled yet. Status should only change
    // when cancellation is confirmed by the provider.

    // Save to tasks + agent_runs for history
    const { data: task } = await supabase
      .from('tasks')
      .insert({
        user_id: user.id,
        type: 'cancellation_email',
        title: `Cancellation: ${providerName}`,
        description: `Cancellation email for ${providerName} (${category || 'unknown'})`,
        provider_name: providerName,
        disputed_amount: amount ? parseFloat(amount) : null,
        status: 'completed',
      })
      .select('id')
      .single();

    if (task) {
      // Haiku: input=$0.80/1M, output=$4/1M
      const inputCost = (message.usage?.input_tokens || 0) * 0.0000008;
      const outputCost = (message.usage?.output_tokens || 0) * 0.000004;

      await supabase.from('agent_runs').insert({
        task_id: task.id,
        user_id: user.id,
        agent_type: 'cancellation_writer',
        model_name: CANCEL_MODEL,
        status: 'completed',
        input_data: { providerName, amount, billingCycle, category, accountEmail },
        output_data: { subject: result.subject, body: result.body },
        input_tokens: message.usage?.input_tokens || null,
        output_tokens: message.usage?.output_tokens || null,
        estimated_cost: parseFloat((inputCost + outputCost).toFixed(6)),
        completed_at: new Date().toISOString(),
      });
    }

    // Award loyalty points
    import('@/lib/loyalty').then(({ awardPoints }) => {
      awardPoints(user.id, 'cancellation_email', { provider: providerName });
    }).catch(() => {});

    return NextResponse.json({
      subject: result.subject,
      body: result.body,
      taskId: task?.id,
    });
  } catch (error: any) {
    console.error('Cancellation email error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
