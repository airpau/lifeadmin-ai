import { NextRequest, NextResponse } from 'next/server';
import { findCancellationMethod } from '@/lib/cancellation-methods';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider');
  if (!provider) {
    return NextResponse.json({ error: 'provider param required' }, { status: 400 });
  }

  // First check the static database
  const staticInfo = findCancellationMethod(provider);
  if (staticInfo) {
    return NextResponse.json({ info: staticInfo });
  }

  // No static match: use AI to generate cancellation advice
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `You provide UK-specific cancellation instructions for subscription services. Return ONLY a JSON object with these keys:
- method: a clear 1-2 sentence description of how to cancel (e.g. "Cancel in the app under Settings > Account > Cancel subscription")
- tips: optional extra advice (e.g. notice periods, refund rights, common gotchas)
- email: the support/cancellation email address if you know it, otherwise null
- phone: the cancellation phone number if you know it, otherwise null
- url: the direct cancellation URL if you know it, otherwise null

Be specific and practical. If you are not sure about exact details, give the most common method and say "check your account settings" rather than guessing wrong.`,
      messages: [{
        role: 'user',
        content: `How do I cancel my ${provider} subscription in the UK?`,
      }],
    });

    const text = response.content[0];
    if (text.type !== 'text') {
      return NextResponse.json({ info: null });
    }

    let raw = text.text.trim();
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return NextResponse.json({
        info: {
          provider: provider.toLowerCase(),
          method: parsed.method || `Contact ${provider} to cancel your subscription.`,
          tips: parsed.tips || null,
          email: parsed.email || null,
          phone: parsed.phone || null,
          url: parsed.url || null,
        },
      });
    }
  } catch (err) {
    console.error(`[cancel-info] AI lookup failed for ${provider}:`, err);
  }

  // Final fallback
  return NextResponse.json({
    info: {
      provider: provider.toLowerCase(),
      method: `Check your ${provider} account settings for cancellation options, or contact their support team directly.`,
      tips: 'Under UK Consumer Contracts Regulations 2013, you have the right to cancel most online subscriptions within 14 days of signing up for a full refund.',
      email: null,
      phone: null,
      url: null,
    },
  });
}
