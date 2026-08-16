import Stripe from 'stripe';

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

export const PRICE_IDS = {
  essential_monthly: process.env.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID || 'price_1TEsJe7qw7mEWYpyVIt4i2Iy',
  essential_yearly:  process.env.STRIPE_ESSENTIAL_YEARLY_PRICE_ID  || 'price_1TEsJf7qw7mEWYpysxw2lnL3',
  pro_monthly:       process.env.STRIPE_PRO_MONTHLY_PRICE_ID       || 'price_1TEsJf7qw7mEWYpy4alOarY6',
  pro_yearly:        process.env.STRIPE_PRO_YEARLY_PRICE_ID        || 'price_1TEsJf7qw7mEWYpyJmrhcy8b',
};

export type PaidTier = 'essential' | 'pro';

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
  if (priceId === PRICE_IDS.pro_monthly || priceId === PRICE_IDS.pro_yearly) return 'pro';
  if (priceId === PRICE_IDS.essential_monthly || priceId === PRICE_IDS.essential_yearly) return 'essential';
  return LEGACY_PRICE_ID_TO_TIER[priceId] ?? null;
}

/** Billing cycle for a known price ID, or null if unrecognised. */
export function priceIdToCycle(priceId: string | null | undefined): 'monthly' | 'yearly' | null {
  if (!priceId) return null;
  if (priceId === PRICE_IDS.pro_yearly || priceId === PRICE_IDS.essential_yearly) return 'yearly';
  if (priceId === PRICE_IDS.pro_monthly || priceId === PRICE_IDS.essential_monthly) return 'monthly';
  return null;
}

/** Ordering used to detect a would-be demotion. Higher wins. */
export const TIER_RANK: Record<string, number> = { free: 0, essential: 1, pro: 2 };

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
