import Stripe from 'stripe';
import type { PlanTier } from '@/lib/tier-rank';

export function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia' as any,
    typescript: true,
  });
}

// Only initialize if STRIPE_SECRET_KEY is available (not during build)
export const stripe = process.env.STRIPE_SECRET_KEY 
  ? getStripeClient()
  : null as any;

/**
 * Stripe price IDs, env-overridable.
 *
 * Essential/Pro keep their hardcoded fallbacks because live subscribers
 * are billed on them and an unset env var must not break an existing
 * customer. Household has NO fallback on purpose — an unset env var
 * resolves to '' and `priceIdToTier` returns null for it, which every
 * call site treats as "skip the tier write". Failing closed beats
 * inventing a price ID.
 *
 * ---------------------------------------------------------------------
 * WHY HOUSEHOLD READS THE `STRIPE_DISPUTE_PRO_*` ENV VARS (2026-08-21)
 * ---------------------------------------------------------------------
 * Household was repriced from £14.99/£149.99 to £19.99/£199.99 when the
 * short-lived Dispute Pro tier was withdrawn and merged into it. The
 * £19.99/£199.99 Stripe Prices already existed — they were minted for
 * Dispute Pro — so Household points at them rather than us creating a
 * second pair of identically-priced Stripe objects. The env var names are
 * historical; the Prices they hold are the correct Household prices.
 *
 * Renaming the env vars in Vercel is safe to do later: add
 * `STRIPE_HOUSEHOLD_MONTHLY_PRICE_ID_V2` (or similar) and swap the line
 * below. Do NOT reuse `STRIPE_HOUSEHOLD_MONTHLY_PRICE_ID` — in production
 * that still holds the retired £14.99 Price, and it is deliberately kept
 * resolvable below so any subscriber billed on it keeps their tier.
 */
export const PRICE_IDS = {
  essential_monthly:  process.env.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID  || 'price_1TEsJe7qw7mEWYpyVIt4i2Iy',
  essential_yearly:   process.env.STRIPE_ESSENTIAL_YEARLY_PRICE_ID   || 'price_1TEsJf7qw7mEWYpysxw2lnL3',
  pro_monthly:        process.env.STRIPE_PRO_MONTHLY_PRICE_ID        || 'price_1TEsJf7qw7mEWYpy4alOarY6',
  pro_yearly:         process.env.STRIPE_PRO_YEARLY_PRICE_ID         || 'price_1TEsJf7qw7mEWYpyJmrhcy8b',
  // £19.99 / £199.99 — see the block above for why these env var names.
  household_monthly:  process.env.STRIPE_DISPUTE_PRO_MONTHLY_PRICE_ID || '',
  household_yearly:   process.env.STRIPE_DISPUTE_PRO_YEARLY_PRICE_ID  || '',
};

/**
 * Retired £14.99 / £149.99 Household Prices.
 *
 * Nothing new is sold on these, but they must stay resolvable to
 * 'household' forever: if anyone is billed on one, `priceIdToTier` has to
 * keep returning their tier or the next webhook would skip their tier
 * write. Same rule as LEGACY_PRICE_ID_TO_TIER below — never remove.
 */
const RETIRED_HOUSEHOLD_MONTHLY = process.env.STRIPE_HOUSEHOLD_MONTHLY_PRICE_ID || '';
const RETIRED_HOUSEHOLD_YEARLY  = process.env.STRIPE_HOUSEHOLD_YEARLY_PRICE_ID  || '';

/**
 * One-off (non-subscription) price IDs.
 *
 * Kept in a SEPARATE map from PRICE_IDS so it is structurally impossible
 * for `priceIdToTier` to resolve a one-off purchase to a subscription
 * tier. Buying an escalation pack must never move anyone's
 * `subscription_tier` — it grants a row in `dispute_entitlements` and
 * nothing else.
 */
export const ONE_OFF_PRICE_IDS = {
  escalation_pack: process.env.STRIPE_ESCALATION_PACK_PRICE_ID || '',
};

export function isEscalationPackPrice(priceId: string | null | undefined): boolean {
  if (!priceId || !ONE_OFF_PRICE_IDS.escalation_pack) return false;
  return priceId === ONE_OFF_PRICE_IDS.escalation_pack;
}

/**
 * Stripe `metadata.product` tags. The webhook routes on these before it
 * looks at anything else.
 *
 *   'b2b_api'         → B2B key minting (src/lib/b2b/stripe-webhook.ts)
 *   'escalation_pack' → one-off entitlement, NO tier write
 *   'household'       → subscription + household_plans row
 *   (absent)          → default consumer subscription flow
 */
export const STRIPE_PRODUCT_TAG = {
  b2bApi: 'b2b_api',
  escalationPack: 'escalation_pack',
  household: 'household',
} as const;

export type PaidTier = Exclude<PlanTier, 'free'>;

/**
 * Historical price IDs that real subscribers are still billed on.
 *
 * These are archived in Stripe but live subscriptions still reference
 * them, so they MUST stay resolvable — otherwise `priceIdToTier` would
 * return null for an existing Pro subscriber and we'd skip their tier
 * write on every webhook. Never remove a row from this map.
 */
const LEGACY_PRICE_ID_TO_TIER: Record<string, PaidTier> = {
  // Old test prices
  'price_1TDVvS7qw7mEWYpyN80zzAXM': 'essential',
  'price_1TDVvS7qw7mEWYpynfpI5x9M': 'essential',
  'price_1TDVvT7qw7mEWYpySmjZJTpG': 'pro',
  'price_1TDVvT7qw7mEWYpyrLHr6L45': 'pro',
  // Old live prices (archived)
  'price_1TDPoH8FbRNalJNU4KeEPNs7': 'essential',
  'price_1TDPoI8FbRNalJNUSVBFOpyA': 'essential',
  'price_1TDPoI8FbRNalJNUDAepvxYt': 'pro',
  'price_1TDPoI8FbRNalJNUEVzsBMvB': 'pro',
  // Founding member prices (test mode)
  'price_1TEdJN8FbRNalJNUQxTQpM8Y': 'essential',
  'price_1TEdJN8FbRNalJNUymPQdKvT': 'essential',
  'price_1TEdJN8FbRNalJNU0o6F4WZZ': 'pro',
  'price_1TEdJO8FbRNalJNUEb0U09ln': 'pro',
};

/**
 * Canonical price ID → tier resolver. Single source of truth for
 * /api/stripe/checkout, /api/stripe/sync and /api/webhooks/stripe.
 *
 * Built from PRICE_IDS (env-overridable) plus the legacy map above, so
 * a price-ID change in env is picked up everywhere at once.
 *
 * Returns null for an unrecognised price ID. Callers MUST treat null as
 * "do not write a tier" — the previous per-route maps each defaulted an
 * unknown price to 'essential', which meant one wrong env var would
 * silently demote every Pro subscriber to Essential.
 */
export function priceIdToTier(priceId: string | null | undefined): PaidTier | null {
  if (!priceId) return null;
  // Ordered most-specific first. Note every comparison is against a value
  // that may legitimately be '' when its env var is unset — the `!priceId`
  // guard above means '' can never reach here as the needle, so an unset
  // env var simply never matches rather than matching everything.
  if (priceId === PRICE_IDS.household_monthly || priceId === PRICE_IDS.household_yearly) return 'household';
  if (priceId === RETIRED_HOUSEHOLD_MONTHLY || priceId === RETIRED_HOUSEHOLD_YEARLY) return 'household';
  if (priceId === PRICE_IDS.pro_monthly || priceId === PRICE_IDS.pro_yearly) return 'pro';
  if (priceId === PRICE_IDS.essential_monthly || priceId === PRICE_IDS.essential_yearly) return 'essential';
  return LEGACY_PRICE_ID_TO_TIER[priceId] ?? null;
}

/** Billing cycle for a known price ID, or null if unrecognised. */
export function priceIdToCycle(priceId: string | null | undefined): 'monthly' | 'yearly' | null {
  if (!priceId) return null;
  if (
    priceId === PRICE_IDS.pro_yearly
    || priceId === PRICE_IDS.essential_yearly
    || priceId === PRICE_IDS.household_yearly
    || priceId === RETIRED_HOUSEHOLD_YEARLY
  ) return 'yearly';
  if (
    priceId === PRICE_IDS.pro_monthly
    || priceId === PRICE_IDS.essential_monthly
    || priceId === PRICE_IDS.household_monthly
    || priceId === RETIRED_HOUSEHOLD_MONTHLY
  ) return 'monthly';
  return null;
}

/** Price ID for a (tier, cycle) pair, or undefined when the env var is unset. */
export function priceIdFor(tier: PaidTier, cycle: 'monthly' | 'yearly'): string | undefined {
  const key = `${tier}_${cycle === 'yearly' ? 'yearly' : 'monthly'}` as keyof typeof PRICE_IDS;
  const id = PRICE_IDS[key];
  return id || undefined;
}

/**
 * Ordering used to detect a would-be demotion. Higher wins.
 *
 * Re-exported from the canonical @/lib/tier-rank rather than redeclared,
 * so a new tier can never rank correctly here and wrongly somewhere else.
 */
export { TIER_RANK, tierRank, isAtLeastPro, isAtLeast } from '@/lib/tier-rank';

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    features: [
      'Scan up to 5 bills per month',
      '1 AI complaint letter',
      'Basic subscription tracking',
      'Email support',
    ],
    limits: {
      scans: 5,
      complaints: 1,
      subscriptions: Infinity,
    },
  },
  essential: {
    name: 'Essential',
    priceMonthly: 4.99,
    priceYearly: 44.99,
    features: [
      'Unlimited bill scanning',
      'Unlimited AI complaint letters',
      'Unlimited subscription tracking',
      'Auto-cancellation emails',
      'Priority email support',
      '20% success fee on recovered money',
    ],
    limits: {
      scans: Infinity,
      complaints: Infinity,
      subscriptions: Infinity,
    },
  },
  pro: {
    name: 'Pro',
    priceMonthly: 9.99,
    priceYearly: 94.99,
    features: [
      'Everything in Essential',
      'Automatic complaint tracking',
      'Phone support',
      'Advanced analytics',
      'Custom integrations',
      '15% success fee on recovered money',
      'Dedicated account manager',
    ],
    limits: {
      scans: Infinity,
      complaints: Infinity,
      subscriptions: Infinity,
    },
  },
};
