import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { checkClaudeRateLimit, recordClaudeCall, logClaudeCall, getUserTier } from '@/lib/claude-rate-limit';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CANCEL_MODEL = 'claude-haiku-3-20240307';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { subscriptionId, providerName, amount, billingCycle, accountEmail } = body;

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

    const prompt = `Write a concise, professional cancellation email for a subscription to ${providerName}.

Subscription details:
- Provider: ${providerName}
- Cost: £${amount}/${billingCycle === 'yearly' ? 'year' : 'month'}
${accountEmail ? `- Account email: ${accountEmail}` : ''}

Requirements:
- Subject line and email body
- Polite but firm tone
- Request written confirmation of cancellation
- Ask for confirmation of the final billing date
- Reference UK Consumer Contracts Regulations 2013 right to cancel
- Keep it under 200 words
- Do not include placeholder brackets — write it ready to send

Return as JSON with keys: subject (string), body (string)`;

    logClaudeCall({
      userId: user.id,
      route: '/api/subscriptions/cancellation-email',
      model: CANCEL_MODEL,
      estimatedInputTokens: 300,
      estimatedOutputTokens: 400,
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

    // Mark subscription as pending cancellation
    if (subscriptionId) {
      await supabase
        .from('subscriptions')
        .update({
          status: 'pending_cancellation',
          cancel_requested_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)
        .eq('user_id', user.id);
    }

    return NextResponse.json({
      subject: result.subject,
      body: result.body,
    });
  } catch (error: any) {
    console.error('Cancellation email error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
