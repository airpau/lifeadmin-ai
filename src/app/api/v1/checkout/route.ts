/**
 * POST /api/v1/checkout — public, returns a Stripe Checkout URL.
 *
 * Body: { tier: 'growth' | 'enterprise', email: string, name?: string, company?: string }
 *
 * On payment success the Stripe webhook (`checkout.session.completed`)
 * mints a B2B API key tied to the new subscription and emails the
 * plaintext to the customer ONCE. We never store the plaintext.
 *
 * Free "starter" tier does not flow through here — it has its own
 * self-serve mint at /api/v1/free-pilot to avoid a Stripe round-trip
 * for £0 customers.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIER_PRICE_ENV: Record<string, string> = {
  growth: 'STRIPE_PRICE_API_GROWTH_MONTHLY',
  enterprise: 'STRIPE_PRICE_API_ENTERPRISE_MONTHLY',
};

export async function POST(request: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { tier, email, name, company } = body ?? {};
  const envKey = TIER_PRICE_ENV[tier];
  if (!envKey) {
    return NextResponse.json({ error: '`tier` must be growth or enterprise' }, { status: 400 });
  }
  const priceId = process.env[envKey];
  if (!priceId) {
    return NextResponse.json({ error: `${envKey} env var not set` }, { status: 500 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid `email` is required' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://paybacker.co.uk';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      success_url: `${baseUrl}/for-business/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/for-business#pricing`,
      metadata: {
        product: 'b2b_api',
        tier,
        contact_name: name ?? '',
        company: company ?? '',
      },
      subscription_data: {
        metadata: {
          product: 'b2b_api',
          tier,
          contact_name: name ?? '',
          company: company ?? '',
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (e: any) {
    console.error('[v1/checkout] stripe error:', e?.message);
    return NextResponse.json({ error: e?.message || 'Stripe error' }, { status: 500 });
  }
}
