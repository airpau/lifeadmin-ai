/**
 * GET /api/cron/refresh-cancellation-info
 *
 * Weekly cron with two legs:
 *
 *  1. Refresh — re-verifies the oldest rows in
 *     `provider_cancellation_info` (last_verified_at null or < 30d)
 *     via Perplexity. Promotes data_source to 'perplexity' and sets
 *     confidence based on how much the answer could confirm. Changes
 *     per row are captured in business_log for admin review.
 *
 *  2. Discover — scans every active subscription across all users for
 *     merchant names that aren't yet covered (neither canonical match
 *     nor alias match) and INSERTs new rows via Perplexity. Keeps the
 *     DB growing in lockstep with what users actually pay for, not
 *     just what we hand-seeded.
 *
 * Both legs cap at a small N per run to keep Perplexity spend bounded.
 *
 * Schedule: vercel.json — "0 3 * * 1" (Mondays 03:00 UTC).
 *
 * Rule compliance: per CLAUDE.md #3, ALL real-time web research goes
 * through Perplexity. No direct scraping, no alternative APIs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { isFinanceProvider } from '@/lib/subscriptions/active-count';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_PER_RUN = 10;
const MAX_DISCOVERY_PER_RUN = 5;
const STALE_DAYS = 30;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normalise(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/**
 * Does this merchant name already have a cancellation-info row? Mirrors
 * the fuzzy match logic in src/lib/cancellation-provider.ts so discovery
 * doesn't duplicate seed entries.
 */
function hasExistingCoverage(
  providerName: string,
  rows: Array<{ provider: string; aliases: string[] | null }>,
): boolean {
  const search = normalise(providerName);
  if (!search) return true;
  const firstWord = search.split(/\s+/)[0];
  for (const r of rows) {
    if (search.includes(r.provider) || r.provider.includes(firstWord)) return true;
    for (const alias of r.aliases ?? []) {
      const a = alias.toLowerCase();
      if (!a) continue;
      if (search.includes(a) || a.includes(firstWord)) return true;
    }
  }
  return false;
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
  // Two legitimate callers: Vercel cron (Bearer CRON_SECRET) and the
  // founder firing an ad-hoc run from /dashboard/admin/cancel-info.
  // authorizeAdminOrCron handles both paths uniformly.
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const admin = getAdmin();
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();

  // Refresh leg — null last_verified_at first (NULLS FIRST via the
  // idx_provider_cancellation_verified index on the 20260424070000
  // migration), then oldest real timestamps.
  const { data: candidates, error } = await admin
    .from('provider_cancellation_info')
    .select('id, provider, display_name, method, email, phone, url, tips, category, data_source, confidence, last_verified_at')
    .or(`last_verified_at.is.null,last_verified_at.lt.${staleCutoff}`)
    .order('last_verified_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{
    provider: string;
    status: 'updated' | 'unchanged' | 'failed';
    confidence?: string;
    changes?: Array<{ field: string; before: string | null; after: string | null }>;
    error?: string;
  }> = [];

  // Skip gracefully when nothing is stale — the discovery leg below
  // still runs, so a newly-added subscription doesn't wait a full
  // week for its first row.
  for (const row of candidates ?? []) {
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

  // ─── Discovery leg ───────────────────────────────────────────────
  // Scan every active subscription across all users for provider names
  // that aren't yet covered (neither canonical nor alias match) and
  // run up to MAX_DISCOVERY_PER_RUN through Perplexity. Keeps the DB
  // in step with what users actually pay for rather than only what we
  // hand-seeded.
  const discovered: Array<{
    provider: string;
    status: 'added' | 'failed';
    confidence?: string;
    error?: string;
  }> = [];

  try {
    const [{ data: subs }, { data: existing }] = await Promise.all([
      admin
        .from('subscriptions')
        .select('provider_name')
        .eq('status', 'active')
        .is('dismissed_at', null),
      admin
        .from('provider_cancellation_info')
        .select('provider, aliases'),
    ]);

    const rows = (existing ?? []) as Array<{ provider: string; aliases: string[] | null }>;
    const distinctNames = Array.from(
      new Set(
        (subs ?? [])
          .map((s) => (s.provider_name as string | null)?.trim())
          .filter((s): s is string => !!s && s.length >= 3),
      ),
    );

    // Skip loan/mortgage/credit-card names — they're debts the user
    // can't "cancel" in the consumer-rights sense, so spending a
    // Perplexity call on them is wasted quota and the result would
    // be a generic "contact your lender" message the UI already
    // handles with the fallback.
    const uncovered = distinctNames
      .filter((name) => !isFinanceProvider(name))
      .filter((name) => !hasExistingCoverage(name, rows));

    for (const name of uncovered.slice(0, MAX_DISCOVERY_PER_RUN)) {
      const answer = await askPerplexity(name);
      if (!answer || !answer.method) {
        discovered.push({ provider: name, status: 'failed', error: 'no parseable answer' });
        continue;
      }
      const confidence = scoreConfidence(answer);
      const { error: insErr } = await admin
        .from('provider_cancellation_info')
        .insert({
          provider: normalise(name),
          display_name: name,
          method: answer.method,
          email: answer.email ?? null,
          phone: answer.phone ?? null,
          url: answer.url ?? null,
          tips: answer.tips ?? null,
          category: answer.category ?? null,
          data_source: 'perplexity',
          confidence,
          last_verified_at: new Date().toISOString(),
        });
      if (insErr) {
        // 23505 = unique_violation — a parallel run added it; ignore.
        if ((insErr as { code?: string }).code !== '23505') {
          discovered.push({ provider: name, status: 'failed', error: insErr.message });
          continue;
        }
      }
      discovered.push({ provider: name, status: 'added', confidence });
    }
  } catch (err) {
    console.error('[refresh-cancel] discovery leg failed:', err);
  }

  // Audit log so admins can review week-over-week drift. business_log is
  // the pattern CLAUDE.md recommends for cross-cutting audit entries.
  try {
    await admin.from('business_log').insert({
      category: 'cancel_info_refresh',
      summary: `Refreshed ${results.filter((r) => r.status === 'updated').length} providers, discovered ${discovered.filter((d) => d.status === 'added').length} new (${results.filter((r) => r.status === 'failed').length + discovered.filter((d) => d.status === 'failed').length} failed)`,
      details: { refreshed: results, discovered },
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
    discovered: discovered.filter((d) => d.status === 'added').length,
    discovery_failed: discovered.filter((d) => d.status === 'failed').length,
    results,
    new_providers: discovered,
  });
}
