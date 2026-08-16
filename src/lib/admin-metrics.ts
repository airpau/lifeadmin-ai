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
 *    Authoritative pricing is TIER_PRICE_GBP in src/lib/tier-rank.ts:
 *      Essential:   £4.99 / mo  or £44.99 / yr  (yearly ≈ £3.75/mo eqv)
 *      Pro:         £9.99 / mo  or £94.99 / yr  (yearly ≈ £7.92/mo eqv)
 *      Household:  £14.99 / mo  or £149.99 / yr
 *      Dispute Pro:£19.99 / mo  or £199.99 / yr
 *    `profiles.subscription_tier` does not record billing interval, so
 *    until that column exists we approximate MRR as
 *    count × monthly headline price. The error from yearly subs is at
 *    most a small under/overstatement per yearly subscriber, not the
 *    £100 gap previously reported (that was the wrong-prices bug).
 *  - B2C surface only. B2B subs live in `b2b_api_keys` (entirely
 *    separate table) so no filter is needed here to exclude them.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PAID_PLAN_TIERS, TIER_PRICE_GBP, isPlanTier, type PlanTier } from './tier-rank';

/**
 * Kept as named exports for any caller that imports them directly. The
 * authoritative figures live in TIER_PRICE_GBP (src/lib/tier-rank.ts) —
 * these just re-export the monthly headline so the two can never drift.
 */
export const ESSENTIAL_MONTHLY_GBP = TIER_PRICE_GBP.essential.monthly;
export const PRO_MONTHLY_GBP = TIER_PRICE_GBP.pro.monthly;

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

  // Counted per paid tier rather than with two hardcoded `essential`/`pro`
  // counters. Household (£14.99) and Dispute Pro (£19.99) subscribers were
  // previously counted into neither bucket, so their revenue was missing
  // from MRR entirely. They are NOT collapsed into Pro — they are priced
  // differently and need their own line in the breakdown.
  const counts: Record<PlanTier, number> = {
    free: 0,
    essential: 0,
    pro: 0,
    household: 0,
    dispute_pro: 0,
  };
  for (const row of data || []) {
    const t = row.subscription_tier;
    if (isPlanTier(t)) counts[t]++;
  }

  // MRR formula: per-tier paying-customer count × monthly headline price
  // from TIER_PRICE_GBP.
  // (Yearly subscribers pay less per month — see file header. The fix is
  // a billing_interval column, tracked separately.)
  const breakdown = PAID_PLAN_TIERS.map((tier) => {
    const count = counts[tier];
    return {
      tier: tier as string,
      count,
      monthly: round2(count * TIER_PRICE_GBP[tier].monthly),
    };
  });
  const mrr = breakdown.reduce((sum, b) => sum + b.monthly, 0);

  return {
    mrr: round2(mrr),
    arr: round2(mrr * 12),
    breakdown,
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
