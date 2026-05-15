/**
 * GET /api/stripe/payment-method
 *
 * Returns the user's default payment method (card brand + last 4 digits +
 * expiry) so we can show "Pay with Visa ending 4242" on the in-app
 * upgrade confirmation screen — the same way Stripe Checkout shows the
 * card before the customer hits Confirm.
 *
 * Why this endpoint exists:
 *   On 2026-04-27 Paul reported that clicking "Upgrade" charged him
 *   £4.97 with no confirmation of the card or amount. The fix is a
 *   dedicated /upgrade confirmation page (not window.confirm), and
 *   that page needs to surface the card on file. This route powers
 *   that surfacing.
 *
 * Behaviour:
 *   - 401 if not signed in
 *   - { hasPaymentMethod: false } if the user has no Stripe customer
 *     yet, or their customer record has no default payment method
 *     attached. The /upgrade page falls back to "We'll redirect you to
 *     Stripe to enter card details" in that case.
 *   - { hasPaymentMethod: true, brand, last4, expMonth, expYear } when
 *     a default is available.
 *
 * The default is sourced from (in order):
 *   1. The active subscription's `default_payment_method`
 *   2. The customer's `invoice_settings.default_payment_method`
 *   3. The first card-type payment method attached to the customer
 *
 * That fallback chain matches Stripe's own "what card will be charged"
 * resolution order for invoice payments.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STRIPE_BASE = 'https://api.stripe.com/v1';

async function stripeGet(path: string) {
  const key = process.env.STRIPE_SECRET_KEY!;
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return res.json();
}

interface CardLike {
  id?: string;
  card?: {
    brand?: string;
    last4?: string;
    exp_month?: number;
    exp_year?: number;
  };
}

function shape(pm: CardLike | null) {
  if (!pm || !pm.card) return null;
  return {
    id: pm.id ?? null,
    brand: pm.card.brand ?? 'card',
    last4: pm.card.last4 ?? '••••',
    expMonth: pm.card.exp_month ?? null,
    expYear: pm.card.exp_year ?? null,
  };
}

export async function GET() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Payment system not configured.' }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ hasPaymentMethod: false });
  }

  // 1) Try the active subscription's default payment method first —
  //    that's what Stripe will actually charge for proration upgrades.
  const subs = await stripeGet(
    `/subscriptions?customer=${profile.stripe_customer_id}&status=active&limit=1&expand[]=data.default_payment_method`,
  );
  const sub = (subs.data || [])[0];
  const subPm: CardLike | null = sub?.default_payment_method && typeof sub.default_payment_method === 'object'
    ? sub.default_payment_method
    : null;

  if (subPm) {
    const shaped = shape(subPm);
    if (shaped) return NextResponse.json({ hasPaymentMethod: true, ...shaped });
  }

  // 2) Fall back to customer.invoice_settings.default_payment_method
  const customer = await stripeGet(
    `/customers/${profile.stripe_customer_id}?expand[]=invoice_settings.default_payment_method`,
  );
  const custDefault: CardLike | null =
    customer?.invoice_settings?.default_payment_method &&
    typeof customer.invoice_settings.default_payment_method === 'object'
      ? customer.invoice_settings.default_payment_method
      : null;

  if (custDefault) {
    const shaped = shape(custDefault);
    if (shaped) return NextResponse.json({ hasPaymentMethod: true, ...shaped });
  }

  // 3) Last resort — list attached cards and take the first one.
  const pms = await stripeGet(
    `/payment_methods?customer=${profile.stripe_customer_id}&type=card&limit=1`,
  );
  const first: CardLike | undefined = pms?.data?.[0];
  const shaped = shape(first ?? null);
  if (shaped) return NextResponse.json({ hasPaymentMethod: true, ...shaped });

  return NextResponse.json({ hasPaymentMethod: false });
}
