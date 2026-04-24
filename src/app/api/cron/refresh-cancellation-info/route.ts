/**
 * GET /api/cron/refresh-cancellation-info
 *
 * Weekly cron that re-verifies the oldest rows in
 * `provider_cancellation_info` using Perplexity (UK-grounded web
 * research). Promotes rows from data_source='seed' | 'ai' to
 * 'perplexity' with confidence='high' when the answer parses cleanly
 * + at least one concrete contact field (email / phone / url) is
 * present.
 *
 * Processing rules:
 *  - Up to MAX_PER_RUN rows per invocation to cap Perplexity spend
 *  - Pick rows where last_verified_at IS NULL or < 30 days ago,
 *    oldest first
 *  - Changes to contact fields are captured in a log so admins can
 *    review if anything shifts dramatically
 *
 * Schedule: registered in vercel.json — "0 3 * * 1" (Mondays 03:00 UTC)
 *
 * Rule compliance: per CLAUDE.md #3, ALL real-time web research goes
 * through Perplexity. No direct scraping, no alternative APIs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PER_RUN = 10;
const STALE_DAYS = 30;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface PerplexityAnswer {
  method?: string | null;
  email?: string | null;
  phone?: string | null;
  url?: string | null;
  tips?: string | null;
  category?: string | null;
  sources?: string[];
}

async function askPerplexity(providerName: string): Promise<PerplexityAnswer | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn('[refresh-cancel] PERPLEXITY_API_KEY not set');
    return null;
  }

  const system = `You are a UK consumer-rights assistant. When asked about how to cancel a UK subscription, return ONLY a single JSON object. No prose outside the JSON.

Schema:
{
  "method": "1-2 sentence description of how to cancel (e.g. 'Cancel online via account settings')",
  "email": "cancellation or support email, or null",
  "phone": "UK cancellation phone number, or null",
  "url": "direct cancellation URL (account page, not the homepage), or null",
  "tips": "notice periods, common gotchas, or null",
  "category": "one of streaming|broadband|mobile|energy|water|insurance|fitness|software|finance|food|transport|statutory|other",
  "sources": ["URL you based this on"]
}

Only include fields you can verify from current sources (prefer the provider's own website). Use null for anything you can't confirm.`;

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `How do I cancel my ${providerName} subscription in the UK?` },
        ],
        max_tokens: 700,
      }),
    });
    if (!res.ok) {
      console.error('[refresh-cancel] Perplexity error:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return null;

    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as PerplexityAnswer;
  } catch (err) {
    console.error('[refresh-cancel] Perplexity threw:', err);
    return null;
  }
}

function scoreConfidence(answer: PerplexityAnswer): 'high' | 'medium' | 'low' {
  const hasMethod = !!answer.method && answer.method.trim().length > 10;
  const hasContact = !!(answer.email || answer.phone || answer.url);
  const hasSources = Array.isArray(answer.sources) && answer.sources.length > 0;
  if (hasMethod && hasContact && hasSources) return 'high';
  if (hasMethod && hasContact) return 'medium';
  return 'low';
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();

  // Oldest-first ordering — null verification dates come before any real
  // timestamp thanks to NULLS FIRST on the index created in the
  // 20260424070000 migration.
  const { data: candidates, error } = await admin
    .from('provider_cancellation_info')
    .select('id, provider, display_name, method, email, phone, url, tips, category, data_source, confidence, last_verified_at')
    .or(`last_verified_at.is.null,last_verified_at.lt.${staleCutoff}`)
    .order('last_verified_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, reason: 'Nothing stale enough to refresh' });
  }

  const results: Array<{
    provider: string;
    status: 'updated' | 'unchanged' | 'failed';
    confidence?: string;
    changes?: Array<{ field: string; before: string | null; after: string | null }>;
    error?: string;
  }> = [];

  for (const row of candidates) {
    const displayName = row.display_name || row.provider;
    const answer = await askPerplexity(displayName);

    if (!answer || !answer.method) {
      results.push({ provider: row.provider, status: 'failed', error: 'no parseable answer' });
      continue;
    }

    // Diff the fields Perplexity confidently answered — keep the existing
    // value when Perplexity says null, so we don't regress on missing
    // fields the seed already knew.
    const next = {
      method: answer.method ?? row.method,
      email: answer.email ?? row.email,
      phone: answer.phone ?? row.phone,
      url: answer.url ?? row.url,
      tips: answer.tips ?? row.tips,
      category: answer.category ?? row.category,
    };
    const changes: Array<{ field: string; before: string | null; after: string | null }> = [];
    for (const field of ['method', 'email', 'phone', 'url', 'tips', 'category'] as const) {
      const before = (row as Record<string, string | null>)[field] ?? null;
      const after = (next as Record<string, string | null>)[field] ?? null;
      if (before !== after) changes.push({ field, before, after });
    }

    const confidence = scoreConfidence(answer);

    const { error: upErr } = await admin
      .from('provider_cancellation_info')
      .update({
        ...next,
        data_source: 'perplexity',
        confidence,
        last_verified_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (upErr) {
      results.push({ provider: row.provider, status: 'failed', error: upErr.message });
      continue;
    }

    results.push({
      provider: row.provider,
      status: changes.length > 0 ? 'updated' : 'unchanged',
      confidence,
      changes: changes.length > 0 ? changes : undefined,
    });
  }

  // Audit log so admins can review week-over-week drift. business_log is
  // the pattern CLAUDE.md recommends for cross-cutting audit entries.
  try {
    await admin.from('business_log').insert({
      category: 'cancel_info_refresh',
      summary: `Refreshed ${results.filter((r) => r.status === 'updated').length} providers (${results.filter((r) => r.status === 'failed').length} failed)`,
      details: { results },
    });
  } catch {
    // non-fatal — logging shouldn't fail the cron
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    updated: results.filter((r) => r.status === 'updated').length,
    unchanged: results.filter((r) => r.status === 'unchanged').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  });
}
