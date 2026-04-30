/**
 * GET /api/subscriptions/cancel-info?provider=<name>
 *
 * Returns how to cancel a given subscription: method, email, phone, URL,
 * tips. Source-of-truth is the `provider_cancellation_info` Supabase
 * table (seeded from the hand-maintained list + extended by AI lookups
 * for unknown providers + refreshed weekly by the Perplexity cron —
 * Phase 2).
 *
 * Strategy:
 *   1. Look up the provider in the DB (covers ~50 UK providers).
 *   2. If no match, ask Claude Haiku for a best-guess answer.
 *   3. Persist the AI response back to the DB with confidence='low'
 *      so subsequent lookups for the same merchant hit the DB.
 *   4. If Claude is unavailable / times out, fall back to a generic
 *      "check your account settings" message — we always return a
 *      non-null `info` block so the UI can render something useful.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import {
  getCancellationInfo,
  upsertCancellationInfo,
} from '@/lib/cancellation-provider';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function freshnessLabel(lastVerifiedAt: string | null): string | null {
  if (!lastVerifiedAt) return null;
  const days = Math.floor(
    (Date.now() - new Date(lastVerifiedAt).getTime()) / 86_400_000,
  );
  if (days <= 1) return 'Verified today';
  if (days < 30) return `Verified ${days} days ago`;
  if (days < 90) return `Verified ~${Math.round(days / 7)} weeks ago`;
  return 'Verification stale — we\'re refreshing this';
}

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider');
  if (!provider) {
    return NextResponse.json({ error: 'provider param required' }, { status: 400 });
  }

  const admin = getAdmin();

  // 1. DB lookup (covers seeded + previously-persisted AI rows).
  const dbMatch = await getCancellationInfo(admin, provider);
  if (dbMatch) {
    return NextResponse.json({
      info: {
        provider: dbMatch.provider,
        display_name: dbMatch.display_name ?? dbMatch.provider,
        method: dbMatch.method,
        email: dbMatch.email ?? null,
        phone: dbMatch.phone ?? null,
        url: dbMatch.url ?? null,
        tips: dbMatch.tips ?? null,
        category: dbMatch.category ?? null,
        confidence: dbMatch.confidence,
        auto_cancel_support: dbMatch.auto_cancel_support,
        freshness: freshnessLabel(dbMatch.last_verified_at),
        data_source: dbMatch.data_source,
      },
    });
  }

  // 2. AI fallback for unknown providers.
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
- category: one of streaming/broadband/mobile/energy/water/insurance/fitness/software/finance/food/transport/statutory/other

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
    if (!jsonMatch) return NextResponse.json({ info: null });

    const parsed = JSON.parse(jsonMatch[0]);
    const fields = {
      method: parsed.method || `Contact ${provider} to cancel your subscription.`,
      tips: parsed.tips || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      url: parsed.url || null,
      category: parsed.category || null,
    };

    // 3. Persist so we don't re-spend a Claude call for this merchant
    // next time. confidence='low' flags it for the refresh cron.
    await upsertCancellationInfo(admin, provider, fields).catch((err) => {
      console.error('[cancel-info] persist failed (non-fatal):', err?.message);
    });

    return NextResponse.json({
      info: {
        provider: provider.toLowerCase(),
        display_name: provider,
        method: fields.method,
        tips: fields.tips,
        email: fields.email,
        phone: fields.phone,
        url: fields.url,
        category: fields.category,
        confidence: 'low',
        auto_cancel_support: 'none',
        freshness: null,
        data_source: 'ai',
      },
    });
  } catch (err) {
    console.error(`[cancel-info] AI lookup failed for ${provider}:`, err);
  }

  // 4. Final fallback — still useful guidance, no source commitment.
  return NextResponse.json({
    info: {
      provider: provider.toLowerCase(),
      display_name: provider,
      method: `Check your ${provider} account settings for cancellation options, or contact their support team directly.`,
      tips: 'Under UK Consumer Contracts Regulations 2013, you have the right to cancel most online subscriptions within 14 days of signing up for a full refund.',
      email: null,
      phone: null,
      url: null,
      category: null,
      confidence: 'low',
      auto_cancel_support: 'none',
      freshness: null,
      data_source: 'ai',
    },
  });
}
