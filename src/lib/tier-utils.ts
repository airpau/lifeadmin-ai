export type NormalizedTier = 'free' | 'essential' | 'pro';

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
 */
export function normalizeTier(tier: string | null | undefined): NormalizedTier {
  switch ((tier ?? '').toLowerCase()) {
    case 'pro':
      return 'pro';
    case 'essential':
    case 'plus': // legacy single-paid-tier — same Stripe price IDs as essential
      return 'essential';
    default:
      return 'free';
  }
}

export function tierDisplayName(tier: string | null | undefined): string {
  switch (normalizeTier(tier)) {
    case 'pro': return 'Pro';
    case 'essential': return 'Essential';
    default: return 'Free';
  }
}
