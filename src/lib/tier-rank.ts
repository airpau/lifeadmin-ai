/**
 * Canonical consumer tier ordering — dependency-free on purpose.
 *
 * Why this file exists
 * --------------------
 * Before August 2026 the app had FOUR independent copies of a
 * `{ free: 0, essential: 1, pro: 2 }` rank map — in `src/lib/stripe.ts`,
 * `src/lib/plan-downgrade.ts`, `src/app/api/webhooks/stripe/route.ts` and
 * inline in `src/lib/telegram/tool-handlers.ts`. Every one of them
 * hardcoded Pro as the ceiling and used `?? 0` for an unknown tier, which
 * means a tier ABOVE Pro would have ranked below Free. That is the exact
 * failure mode that silently demotes a paying subscriber.
 *
 * This module is the single source of truth. It deliberately imports
 * nothing so it can be pulled into client components, edge routes and the
 * Stripe helpers without dragging Supabase or the Stripe SDK along.
 *
 * Adding a tier
 * -------------
 * 1. Add it to `PlanTier`.
 * 2. Add it to `TIER_RANK` (a rank EQUAL to an existing tier is fine and
 *    means "same entitlement level, different packaging" — that is what
 *    `household` is relative to `pro`).
 * 3. Add it to `PLAN_LIMITS` in src/lib/plan-limits.ts and `TIER_CONFIG`
 *    in src/lib/bank-tier-config.ts. Both are `Record<PlanTier, …>` so
 *    the compiler will fail the build until you do.
 * 4. Add its Stripe price IDs to `PRICE_IDS` in src/lib/stripe.ts.
 * 5. Widen the DB check constraint on `profiles.subscription_tier`.
 */

export type PlanTier =
  | 'free'
  | 'essential'
  | 'pro'
  /** Household plan — up to 4 people, Pro entitlements each. */
  | 'household';

/**
 * Ordering used for upgrade/downgrade detection and "at least tier X"
 * gates. Higher wins.
 *
 * `household` deliberately shares Pro's rank: a household member gets
 * exactly the Pro entitlement set, so moving Pro → Household is neither an
 * upgrade nor a downgrade in capability terms and must not trip the
 * downgrade grace-period machinery. What Household sells is SEATS, not a
 * bigger feature set, and that is the only claim we make for it.
 */
export const TIER_RANK: Record<PlanTier, number> = {
  free: 0,
  essential: 1,
  pro: 2,
  household: 2,
};

/** Every known consumer tier, in ascending rank order. */
export const ALL_PLAN_TIERS: PlanTier[] = ['free', 'essential', 'pro', 'household'];

/** Every tier that is a paid subscription (i.e. not Free). */
export const PAID_PLAN_TIERS: PlanTier[] = ['essential', 'pro', 'household'];

/** True when `tier` is one of the known consumer tiers. */
export function isPlanTier(tier: string | null | undefined): tier is PlanTier {
  return !!tier && Object.prototype.hasOwnProperty.call(TIER_RANK, tier);
}

/**
 * Rank for an arbitrary string.
 *
 * Returns -1 for an unrecognised tier rather than 0. That matters: a
 * `?? 0` fallback makes an unknown tier indistinguishable from Free, so a
 * comparison like `rank(unknown) >= rank('free')` would pass. -1 fails
 * every `isAtLeast` check, which is the safe direction for a gate — and
 * for the promote-only guard in /api/stripe/sync it means an unknown
 * stored tier can never block a legitimate write.
 */
export function tierRank(tier: string | null | undefined): number {
  return isPlanTier(tier) ? TIER_RANK[tier] : -1;
}

/** True when `tier` ranks at or above `minimum`. */
export function isAtLeast(tier: string | null | undefined, minimum: PlanTier): boolean {
  const r = tierRank(tier);
  return r >= 0 && r >= TIER_RANK[minimum];
}

/**
 * The workhorse. Replaces every `tier === 'pro'` / `tier !== 'pro'` gate
 * in the codebase.
 *
 * A `household` user MUST pass every check a Pro user passes — they are
 * paying more (split up to four ways) and a literal equality check would
 * silently deny them WhatsApp, exports, MCP, unlimited banks, on-demand
 * sync and everything else Pro includes.
 */
export function isAtLeastPro(tier: string | null | undefined): boolean {
  return isAtLeast(tier, 'pro');
}

/** True for Essential and above — i.e. any paid tier. */
export function isAtLeastEssential(tier: string | null | undefined): boolean {
  return isAtLeast(tier, 'essential');
}

/** True when the user is on any paid tier. Equivalent to `!== 'free'` but unknown-safe. */
export function isPaidTier(tier: string | null | undefined): boolean {
  return isAtLeastEssential(tier);
}

/** True when `to` ranks strictly below `from`. */
export function isTierDowngrade(from: string | null | undefined, to: string | null | undefined): boolean {
  const f = tierRank(from);
  const t = tierRank(to);
  if (f < 0 || t < 0) return false;
  return t < f;
}

/** Human-readable name. Kept here so labels can't drift from the rank map. */
export const TIER_DISPLAY_NAME: Record<PlanTier, string> = {
  free: 'Free',
  essential: 'Essential',
  pro: 'Pro',
  household: 'Household',
};

/** Headline prices, for confirmation copy and analytics amounts. */
export const TIER_PRICE_GBP: Record<PlanTier, { monthly: number; yearly: number }> = {
  free: { monthly: 0, yearly: 0 },
  essential: { monthly: 4.99, yearly: 44.99 },
  pro: { monthly: 9.99, yearly: 94.99 },
  // Repriced 2026-08-21 from £14.99/£149.99. Household absorbed the
  // withdrawn Dispute Pro price points; seats are now the only
  // differentiator, which is the one that actually holds up.
  household: { monthly: 19.99, yearly: 199.99 },
};

/** Price of a single Ombudsman escalation pack, in GBP. */
export const ESCALATION_PACK_PRICE_GBP = 14.99;
