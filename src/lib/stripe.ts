import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
  typescript: true,
});

export const PRICE_IDS = {
  essential_monthly: process.env.STRIPE_PRICE_ESSENTIAL_MONTHLY || 'price_essential_monthly',
  essential_yearly: process.env.STRIPE_PRICE_ESSENTIAL_YEARLY || 'price_essential_yearly',
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly',
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || 'price_pro_yearly',
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
