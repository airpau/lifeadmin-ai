/**
 * DB-backed cancellation-info lookup.
 *
 * Replaces the hand-maintained static list in cancellation-methods.ts with
 * a Supabase-backed source. The static file is kept as a safety net (used
 * by complaint-generate's sync code path and as a fallback if the query
 * errors), but the DB is now authoritative for the subscriptions UI.
 *
 * Key changes vs the static file:
 *  - aliases column catches bank-description variants ("PATREON*" vs
 *    "patreon"; "Disney+" vs "disneyplus")
 *  - last_verified_at + confidence so the Phase-2 refresh cron can
 *    prioritise stale rows
 *  - AI-generated rows get persisted back with data_source='ai' and
 *    confidence='low' so we're not spending Claude calls on the same
 *    merchant every time a user clicks on it
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CancellationRecord {
  provider: string;
  display_name?: string | null;
  method: string;
  email?: string | null;
  phone?: string | null;
  url?: string | null;
  tips?: string | null;
  category?: string | null;
  region: string;
  data_source: 'seed' | 'ai' | 'admin' | 'perplexity';
  confidence: 'high' | 'medium' | 'low';
  auto_cancel_support: 'none' | 'email' | 'api';
  last_verified_at: string | null;
  aliases?: string[];
}

function normalise(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

/**
 * Look up cancellation info for a provider name (merchant string from the
 * bank or a user-edited subscription label). Returns null when no match
 * is found — callers decide whether to fall back to AI generation.
 */
export async function getCancellationInfo(
  supabase: SupabaseClient,
  providerName: string,
): Promise<CancellationRecord | null> {
  const search = normalise(providerName);
  if (!search) return null;

  // Over-fetch slightly — 50-200 rows is cheap — and rank in-memory so we
  // can apply the same multi-strategy match as the old static file.
  const { data, error } = await supabase
    .from('provider_cancellation_info')
    .select('*');
  if (error || !data) return null;

  const rows = data as CancellationRecord[];
  const firstWord = search.split(/\s+/)[0];

  // Strategy 1: canonical provider name is a substring of the merchant
  // string, OR vice versa. Covers the "Test Valley Borough Council"
  // → "test valley" class of matches.
  for (const r of rows) {
    if (search.includes(r.provider) || r.provider.includes(firstWord)) {
      return r;
    }
  }

  // Strategy 2: any alias matches the merchant string (substring either way).
  for (const r of rows) {
    for (const alias of r.aliases ?? []) {
      const a = alias.toLowerCase();
      if (!a) continue;
      if (search.includes(a) || a.includes(firstWord)) return r;
    }
  }

  return null;
}

/**
 * Persist an AI-generated cancellation record so the next lookup for the
 * same merchant hits the DB and doesn't re-spend a Claude call. The row
 * is stored with `confidence='low'` and `data_source='ai'` so the
 * refresh cron treats it as a candidate for verification rather than
 * ground truth.
 */
export async function upsertCancellationInfo(
  supabase: SupabaseClient,
  providerName: string,
  fields: {
    method: string;
    email?: string | null;
    phone?: string | null;
    url?: string | null;
    tips?: string | null;
    category?: string | null;
  },
): Promise<void> {
  const canonical = normalise(providerName);
  if (!canonical) return;

  await supabase
    .from('provider_cancellation_info')
    .upsert(
      {
        provider: canonical,
        display_name: providerName.trim(),
        method: fields.method,
        email: fields.email ?? null,
        phone: fields.phone ?? null,
        url: fields.url ?? null,
        tips: fields.tips ?? null,
        category: fields.category ?? null,
        data_source: 'ai',
        confidence: 'low',
        last_verified_at: null,
      },
      { onConflict: 'provider' },
    );
}
