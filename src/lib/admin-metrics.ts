/**
 * Admin metrics helpers — single source of truth for the
 * /dashboard/admin Overview tab and the upcoming Business Costs tab.
 *
 * History (28 Apr 2026):
 *  - Bank-connection counter was filtering `status = 'active'`, but the
 *    Yapily migration (20260402050000) bulk-flipped every existing
 *    TrueLayer row to `status = 'expired_legacy'`. Production users
 *    are still connected via TrueLayer (Yapily is gated on approval —
 *    see CLAUDE.md memory). The correct counter is "any non-deleted
 *    connection that isn't permanently revoked" across all providers.
 *  - MRR was using stale prices (£9.99 essential / £19.99 pro).
 *    Authoritative pricing is in CLAUDE.md and src/lib/stripe.ts:
 *      Essential: £4.99 / mo  or £44.99 / yr  (yearly ≈ £3.75/mo eqv)
 *      Pro:       £9.99 / mo  or £94.99 / yr  (yearly ≈ £7.92/mo eqv)
 *    `profiles.subscription_tier` does not record billing interval, so
 *    until that column exists we approximate MRR as
 *    count × monthly headline price. The error from yearly subs is at
 *    most a small under/overstatement per yearly subscriber, not the
 *    £100 gap previously reported (that was the wrong-prices bug).
 *  - B2C surface only. B2B subs live in `b2b_api_keys` (entirely
 *    separate table) so no filter is needed here to exclude them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const ESSENTIAL_MONTHLY_GBP = 4.99;
export const PRO_MONTHLY_GBP = 9.99;

export interface AdminDeal {
  id: string;
  provider: string;
  category: string;
  plan_name: string;
  affiliate_url: string;
  is_active: boolean;
  last_verified_at: string | null;
  price_monthly: number;
  price_changed_at: string | null;
}

export interface DealHealthSummary {
  active: number;
  broken: AdminDeal[];
  stale: AdminDeal[];
  healthy: AdminDeal[];
  lastVerifiedAt: string | null;
}

const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Count active bank connections across all providers (TrueLayer +
 * Yapily). A connection counts as active if it hasn't been hard-
 * deleted and isn't `revoked`. We deliberately keep `expired_legacy`
 * and `expired`/`token_expired` — those are still real connections
 * with real transaction history, just needing a re-auth.
 */
export async function getActiveBankConnectionCount(
  supabase: SupabaseClient,
): Promise<number> {
  const { count, error } = await supabase
    .from('bank_connections')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
    .neq('status', 'revoked');

  if (error) {
    console.error('[admin-metrics] bank connection count error', error);
    return 0;
  }
  return count ?? 0;
}

/**
 * Compute B2C MRR from `profiles.subscription_tier`. See file header
 * for the yearly-vs-monthly caveat.
 */
export async function computeMrrGbp(
  supabase: SupabaseClient,
): Promise<{
  mrr: number;
  arr: number;
  breakdown: { tier: string; count: number; monthly: number }[];
}> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tier');

  if (error) {
    console.error('[admin-metrics] mrr query error', error);
    return { mrr: 0, arr: 0, breakdown: [] };
  }

  let essential = 0;
  let pro = 0;
  for (const row of data || []) {
    if (row.subscription_tier === 'essential') essential++;
    else if (row.subscription_tier === 'pro') pro++;
  }

  // MRR formula: per-tier paying-customer count × monthly headline price.
  // (Yearly subscribers pay less per month — see file header. The fix is
  // a billing_interval column, tracked separately.)
  const essentialMrr = essential * ESSENTIAL_MONTHLY_GBP;
  const proMrr = pro * PRO_MONTHLY_GBP;
  const mrr = essentialMrr + proMrr;

  return {
    mrr: round2(mrr),
    arr: round2(mrr * 12),
    breakdown: [
      { tier: 'essential', count: essential, monthly: round2(essentialMrr) },
      { tier: 'pro', count: pro, monthly: round2(proMrr) },
    ],
  };
}

/**
 * Group affiliate deals into broken / stale / healthy buckets and
 * return the most recent verification timestamp.
 */
export async function getDealHealth(
  supabase: SupabaseClient,
): Promise<DealHealthSummary> {
  const { data, error } = await supabase
    .from('affiliate_deals')
    .select('id, provider, category, plan_name, affiliate_url, is_active, last_verified_at, price_monthly, price_changed_at')
    .order('provider', { ascending: true });

  if (error) {
    console.error('[admin-metrics] deal health query error', error);
    return { active: 0, broken: [], stale: [], healthy: [], lastVerifiedAt: null };
  }

  const now = Date.now();
  const broken: AdminDeal[] = [];
  const stale: AdminDeal[] = [];
  const healthy: AdminDeal[] = [];
  let lastVerifiedAt: string | null = null;

  for (const raw of data || []) {
    const d = raw as AdminDeal;
    if (d.last_verified_at && (!lastVerifiedAt || d.last_verified_at > lastVerifiedAt)) {
      lastVerifiedAt = d.last_verified_at;
    }
    if (!d.is_active) {
      broken.push(d);
      continue;
    }
    const verifiedMs = d.last_verified_at ? new Date(d.last_verified_at).getTime() : 0;
    if (!verifiedMs || now - verifiedMs > STALE_THRESHOLD_MS) {
      stale.push(d);
    } else {
      healthy.push(d);
    }
  }

  return {
    active: broken.length === 0 ? (data?.length ?? 0) : (data?.length ?? 0) - broken.length,
    broken,
    stale,
    healthy,
    lastVerifiedAt,
  };
}

function round2(n: number): number {
  return parseFloat(n.toFixed(2));
}
