import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall } from '@/lib/claude-rate-limit';
import { checkUsageLimit, incrementUsage } from '@/lib/plan-limits';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FORM_TYPES: Record<string, { label: string; systemContext: string }> = {
  hmrc_tax_rebate: {
    label: 'HMRC Tax Rebate',
    systemContext: `Write a formal letter to HMRC requesting a tax rebate/refund.
Reference: Income Tax Act 2007, HMRC Self Assessment guidelines.
Include: taxpayer's right to reclaim overpaid tax, request for review of tax code.
HMRC address: Pay As You Earn and Self Assessment, HM Revenue and Customs, BX9 1AS.
Mention: the taxpayer can call HMRC on 0300 200 3300 if no response within 28 days.`,
  },
  hmrc_tax_code: {
    label: 'HMRC Tax Code Challenge',
    systemContext: `Write a formal letter to HMRC challenging an incorrect tax code.
Reference: Income Tax (Earnings and Pensions) Act 2003.
Explain: how the wrong tax code is causing over/underpayment.
Request: immediate review and correction of tax code, plus refund of any overpaid tax.
HMRC address: Pay As You Earn and Self Assessment, HM Revenue and Customs, BX9 1AS.`,
  },
  council_tax_band: {
    label: 'Council Tax Band Challenge',
    systemContext: `Write a formal letter to the Valuation Office Agency (VOA) challenging a council tax band.
Reference: Council Tax (Administration and Enforcement) Regulations 1992, Local Government Finance Act 1992.
Explain: council tax bands were set based on 1991 property values.
State: why the property is in the wrong band (comparable properties in lower band, property changes, etc.).
VOA address: Valuation Office Agency, council tax team — user should check their local VOA office.
Note: the challenge is free and the band can go up or down.`,
  },
  council_tax_reduction: {
    label: 'Council Tax Reduction/Exemption',
    systemContext: `Write a formal letter to the local council requesting council tax reduction or exemption.
Reference: Council Tax Reduction Schemes, Council Tax (Exempt Dwellings) Order 1992.
Common exemptions: single person discount (25%), full-time students, severely mentally impaired, empty properties.
Request: review of eligibility for discount/exemption and backdated refund if applicable.`,
  },
  dvla_vehicle: {
    label: 'DVLA Vehicle Issue',
    systemContext: `Write a formal letter to the DVLA regarding a vehicle taxation, registration, or licensing issue.
Reference: Vehicle Excise and Registration Act 1994, Road Vehicles (Registration and Licensing) Regulations 2002.
DVLA address: DVLA, Swansea, SA99 1BA.
Common issues: incorrect vehicle tax, SORN disputes, registration errors, refund requests.`,
  },
  dvla_driving_licence: {
    label: 'DVLA Driving Licence Issue',
    systemContext: `Write a formal letter to the DVLA regarding a driving licence issue.
Reference: Road Traffic Act 1988, Motor Vehicles (Driving Licences) Regulations 1999.
DVLA address: DVLA, Swansea, SA99 1BN.
Common issues: licence renewal delays, incorrect details, medical declaration queries, penalty points disputes.`,
  },
  nhs_complaint: {
    label: 'NHS Complaint',
    systemContext: `Write a formal complaint letter about NHS services.
Reference: NHS Constitution for England (right to complain and have complaint investigated).
The Local Authority Social Services and NHS Complaints (England) Regulations 2009.
Escalation: if not resolved within 6 months, escalate to the Parliamentary and Health Service Ombudsman (PHSO).
Be factual, include dates of treatment/appointments, and state the impact on the patient.`,
  },
  parking_appeal: {
    label: 'Parking Charge Appeal',
    systemContext: `Write a formal appeal letter against a private parking charge notice (PCN).
Reference: Protection of Freedoms Act 2012 (POFA), British Parking Association (BPA) Code of Practice.
Key defences: inadequate signage, grace period not given, driver was not the keeper, charge is disproportionate.
For private parking: appeal to the operator first, then to POPLA (Parking on Private Land Appeals) or IAS.
For council parking: appeal to the council, then to the Traffic Penalty Tribunal (England/Wales) or Parking and Bus Lane Tribunal (London).
Note: do NOT ignore the charge — it can escalate to debt recovery.`,
  },
  refund_request: {
    label: 'Formal Refund Request',
    systemContext: `Write a formal refund request letter.
Reference: Consumer Rights Act 2015 (goods/services), Consumer Contracts Regulations 2013 (online purchases).
Key rights: 30-day right to reject faulty goods, 14-day cooling-off for online purchases, right to refund for substandard services.
Be specific about: what was purchased, when, how much, why a refund is due, and the deadline for response (14 days).`,
  },
  debt_dispute: {
    label: 'Debt Dispute Response',
    systemContext: `Write a formal letter disputing a debt or responding to a debt recovery letter.
Reference: Consumer Credit Act 1974 (s.78 — right to request signed credit agreement), Limitation Act 1980 (s.5 — 6-year limitation period), Protection from Harassment Act 1997.
Key points:
- Creditor must prove the debt exists with a signed credit agreement
- If no agreement can be produced, the debt is unenforceable
- Debts over 6 years old (5 in Scotland) are statute-barred
- Debt collectors must not harass, threaten, or use deceptive practices
- The debtor can request the collector stop contacting them
- Report harassment to Trading Standards and the FCA
Tone: firm but professional. State clearly that the debt is disputed and demand proof.`,
  },
  flight_compensation: {
    label: 'Flight Delay Compensation',
    systemContext: `Write a formal letter claiming flight delay compensation.
Reference: UK261 (retained EU Regulation 261/2004) — applies to flights departing from UK airports or arriving at UK airports on UK/EU carriers.
Compensation amounts:
- Short-haul (under 1,500km): £220
- Medium-haul (1,500-3,500km): £350
- Long-haul (over 3,500km): £520
Conditions: delay must be 3+ hours on arrival, not caused by extraordinary circumstances.
Include: flight number, date, scheduled vs actual arrival time, booking reference.
Escalation: if airline refuses, escalate to CEDR (Centre for Effective Dispute Resolution) or the small claims court.`,
  },
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const usageCheck = await checkUsageLimit(user.id, 'complaint_generated');
    if (!usageCheck.allowed) {
      return NextResponse.json({
        error: 'Monthly limit reached',
        upgradeRequired: true,
        used: usageCheck.used,
        limit: usageCheck.limit,
        tier: usageCheck.tier,
      }, { status: 403 });
    }

    const body = await request.json();
    const { formType, details, desiredOutcome, amount, referenceNumber } = body;

    if (!formType || !details || !desiredOutcome) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const formConfig = FORM_TYPES[formType];
    if (!formConfig) {
      return NextResponse.json({ error: 'Invalid form type' }, { status: 400 });
    }

    const rateLimit = await checkClaudeRateLimit(user.id, usageCheck.tier);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }

    const prompt = `You are a UK consumer rights expert. Generate a formal letter for the following government/official matter.

TYPE: ${formConfig.label}

${formConfig.systemContext}

USER'S SITUATION:
${details}

DESIRED OUTCOME: ${desiredOutcome}
${amount ? `AMOUNT INVOLVED: £${amount}` : ''}
${referenceNumber ? `REFERENCE NUMBER: ${referenceNumber}` : ''}

Requirements:
- Formal UK letter format with date
- Cite the specific legislation that applies
- Professional tone — firm but respectful
- Set a clear deadline for response (28 days for government bodies)
- Include escalation path if no response
- Under 400 words
- Do not include placeholder brackets — write it ready to send

Return as JSON with keys:
- letter: the complete letter as a string
- legalReferences: array of specific legislation cited
- estimatedSuccess: integer 0-100
- nextSteps: array of 3-4 actions if no response
- escalationPath: string naming the relevant ombudsman/body`;

    logClaudeCall({
      userId: user.id,
      route: '/api/forms/generate',
      model: 'claude-sonnet-4-6',
      estimatedInputTokens: 1500,
      estimatedOutputTokens: 2000,
    });

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    await recordClaudeCall(user.id, usageCheck.tier);

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response');

    let raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not parse response');

    const result = JSON.parse(jsonMatch[0]);

    // Save to tasks
    const { data: task } = await supabase.from('tasks').insert({
      user_id: user.id,
      type: 'government_form',
      title: `${formConfig.label}: ${desiredOutcome.substring(0, 50)}`,
      description: details.substring(0, 200),
      status: 'completed',
    }).select('id').single();

    if (task) {
      const inputCost = (message.usage?.input_tokens || 0) * 0.000003;
      const outputCost = (message.usage?.output_tokens || 0) * 0.000015;

      await supabase.from('agent_runs').insert({
        task_id: task.id,
        user_id: user.id,
        agent_type: 'government_form_writer',
        model_name: 'claude-sonnet-4-6',
        status: 'completed',
        input_data: body,
        output_data: result,
        input_tokens: message.usage?.input_tokens || null,
        output_tokens: message.usage?.output_tokens || null,
        estimated_cost: parseFloat((inputCost + outputCost).toFixed(6)),
        completed_at: new Date().toISOString(),
      });
    }

    await incrementUsage(user.id, 'complaint_generated');

    // Award loyalty points
    import('@/lib/loyalty').then(({ awardPoints }) => {
      awardPoints(user.id, 'complaint_generated', { type: formType });
    }).catch(() => {});

    return NextResponse.json({ ...result, taskId: task?.id, formType: formConfig.label });
  } catch (error: any) {
    console.error('Form generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
