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
  essential_monthly: process.env.STRIPE_ESSENTIAL_MONTHLY_PRICE_ID || 'price_1TDVvS7qw7mEWYpyN80zzAXM',
  essential_yearly:  process.env.STRIPE_ESSENTIAL_YEARLY_PRICE_ID  || 'price_1TDVvS7qw7mEWYpynfpI5x9M',
  pro_monthly:       process.env.STRIPE_PRO_MONTHLY_PRICE_ID       || 'price_1TDVvT7qw7mEWYpySmjZJTpG',
  pro_yearly:        process.env.STRIPE_PRO_YEARLY_PRICE_ID        || 'price_1TDVvT7qw7mEWYpyrLHr6L45',
};

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
      subscriptions: 10,
    },
  },
  essential: {
    name: 'Essential',
    priceMonthly: 9.99,
    priceYearly: 99,
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
    priceMonthly: 19.99,
    priceYearly: 199,
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
