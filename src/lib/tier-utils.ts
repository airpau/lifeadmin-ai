import { TIER_DISPLAY_NAME, isPlanTier, type PlanTier } from '@/lib/tier-rank';

export type NormalizedTier = PlanTier;

/**
 * Backstop normaliser for any tier string still flowing around the app
 * with the legacy 'plus' value. The actual DB state was migrated in
 * supabase/migrations/20260427150000_tier_constraint_essential.sql, but
 * any cached client state or row that slipped through still resolves
 * here.
 *
 * 'plus' was the original single paid tier in an early two-tier model
 * (free + plus). When the matrix expanded to three tiers (free /
 * essential / pro), the £4.99 price points kept the same Stripe price
 * IDs — and those IDs are explicitly mapped to 'essential' in
 * /api/webhooks/stripe (PRICE_ID_TO_TIER). So 'plus' = 'essential' in
 * value terms, even though an earlier version of this file said
 * "treat as pro" (which was inconsistent with PRICE_ID_TO_TIER and
 * caused these users to render Pro labels while quota-checks gave
 * them free-tier caps).
 *
 * 2026-08-16: this used to be a `switch` whose `default:` returned 'free'.
 * That was a silent-demotion trap — any tier added above Pro (household,
 * dispute_pro) would have been reported as Free by every consumer of this
 * function, including the churn-prevention and marketing-automation crons.
 * It now recognises every tier in the canonical PlanTier union and only
 * falls back to 'free' for genuinely unknown strings.
 */
export function normalizeTier(tier: string | null | undefined): NormalizedTier {
  const raw = (tier ?? '').toLowerCase();
  // legacy single-paid-tier — same Stripe price IDs as essential
  if (raw === 'plus') return 'essential';
  return isPlanTier(raw) ? raw : 'free';
}

export function tierDisplayName(tier: string | null | undefined): string {
  return TIER_DISPLAY_NAME[normalizeTier(tier)];
}
