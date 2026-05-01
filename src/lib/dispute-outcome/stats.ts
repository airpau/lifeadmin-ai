/**
 * Read-side helpers for the dispute intelligence flywheel.
 * Used by:
 *   - the admin dashboard (`/dashboard/admin/dispute-intelligence`)
 *   - the public moat page (`/dispute-success-rates`)
 *   - the engine feedback loop (`generateComplaintLetter` callers)
 *   - the B2B `DisputeResponse.historical_success_rate` field
 *
 * All consumers query the latest snapshot per scope_kind / scope_key.
 */

import { createClient } from '@supabase/supabase-js';

export interface ScopeStats {
  scope_kind: string;
  scope_key: string;
  total_count: number;
  won_count: number;
  partial_count: number;
  lost_count: number;
  pending_count: number;
  avg_resolution_days: number | null;
  avg_recovered_gbp: number | null;
  total_recovered_gbp: number | null;
  win_rate: number | null;
  computed_at: string;
}

export interface MerchantLegalRefStat extends ScopeStats {
  merchant: string;
  legal_ref: string;
}

const MIN_SAMPLE = 5;

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Latest snapshot of a scope (one row, the freshest computed_at). */
export async function getLatestScopeStat(
  scopeKind: string,
  scopeKey: string,
): Promise<ScopeStats | null> {
  const sb = admin();
  const { data, error } = await sb
    .from('dispute_intelligence_stats')
    .select('*')
    .eq('scope_kind', scopeKind)
    .eq('scope_key', scopeKey)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ScopeStats;
}

/**
 * Top legal references against a merchant by historical win rate, with
 * a minimum sample size. Returns at most `limit` rows.
 *
 * Used by the engine feedback loop — we pass the top 3 to the LLM as
 * "historical data".
 */
export async function getTopLegalRefsForMerchant(
  merchantNormalised: string,
  limit = 3,
  minSample = MIN_SAMPLE,
): Promise<MerchantLegalRefStat[]> {
  const sb = admin();
  // Latest snapshot per (scope_kind='merchant_x_legal_ref', scope_key starts with merchant::)
  const prefix = `${merchantNormalised}::`;
  const { data, error } = await sb
    .from('dispute_intelligence_stats')
    .select('*')
    .eq('scope_kind', 'merchant_x_legal_ref')
    .like('scope_key', `${prefix}%`)
    .order('computed_at', { ascending: false })
    .limit(500);
  if (error || !data) return [];
  // Reduce to latest-per-scope_key
  const latest = new Map<string, ScopeStats>();
  for (const row of data as ScopeStats[]) {
    if (!latest.has(row.scope_key)) latest.set(row.scope_key, row);
  }
  const results: MerchantLegalRefStat[] = [];
  for (const row of latest.values()) {
    if (row.total_count < minSample) continue;
    const [merchant, legal_ref] = row.scope_key.split('::');
    results.push({ ...row, merchant, legal_ref });
  }
  results.sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0));
  return results.slice(0, limit);
}

/** Per-merchant overall stat (no legal-ref split). */
export async function getMerchantStat(merchantNormalised: string): Promise<ScopeStats | null> {
  return getLatestScopeStat('merchant', merchantNormalised);
}
