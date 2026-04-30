/**
 * /api/stripe/upgrade-preview
 *
 * Asks Stripe what an upgrade would actually cost a logged-in user
 * RIGHT NOW, accounting for proration on their existing subscription.
 *
 * Used by the pricing page + the in-dashboard upgrade flow to show
 * "Upgrading today: £5.00 (£4.99 unused Essential credit applied)"
 * BEFORE the user clicks confirm. Without this, users on Essential
 * see the headline £9.99 Pro price and assume they'll be charged the
 * full amount on top of what they just paid for Essential — which is
 * exactly what put Paul off the upgrade and surfaced this issue.
 *
 * GET ?priceId=price_xxx
 *   - Returns { hasExistingSub, prorated_amount_pennies, prorated_amount_display,
 *               next_period_amount_pennies, next_period_amount_display,
 *               next_billing_date, currency }
 *
 *   - hasExistingSub=false → user has no active sub; quote the headline
 *     price at full and show the regular signup CTA.
 *
 *   - hasExistingSub=true → user has Essential (or whatever); the
 *     prorated_amount is what they'll be charged on confirm.
 */

import { NextRequest, NextResponse } from 'next/server';
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

function formatGBP(pennies: number): string {
  const sign = pennies < 0 ? '-' : '';
  const abs = Math.abs(pennies);
  return `${sign}£${(abs / 100).toFixed(2)}`;
}

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Payment system not configured.' }, { status: 500 });
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const priceId = req.nextUrl.searchParams.get('priceId');
  if (!priceId) {
    return NextResponse.json({ error: 'priceId required' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  // No customer record yet → no existing sub; user will go through
  // standard new-subscription Checkout. Just quote the headline price.
  if (!profile?.stripe_customer_id) {
    const price = await stripeGet(`/prices/${priceId}`);
    const amount: number = price.unit_amount ?? 0;
    return NextResponse.json({
      hasExistingSub: false,
      prorated_amount_pennies: amount,
      prorated_amount_display: formatGBP(amount),
      next_period_amount_pennies: amount,
      next_period_amount_display: formatGBP(amount),
      currency: price.currency ?? 'gbp',
    });
  }

  // Look up active sub. If none, also quote headline price.
  const subs = await stripeGet(
    `/subscriptions?customer=${profile.stripe_customer_id}&status=active&limit=1`,
  );
  const sub = (subs.data || [])[0];
  if (!sub) {
    const price = await stripeGet(`/prices/${priceId}`);
    const amount: number = price.unit_amount ?? 0;
    return NextResponse.json({
      hasExistingSub: false,
      prorated_amount_pennies: amount,
      prorated_amount_display: formatGBP(amount),
      next_period_amount_pennies: amount,
      next_period_amount_display: formatGBP(amount),
      currency: price.currency ?? 'gbp',
    });
  }

  // Active sub exists. Ask Stripe to PREVIEW what the next invoice
  // would look like if we updated the subscription to the requested
  // priceId right now. Stripe returns the proration line items + the
  // total — exactly what we need to show "Upgrading today costs £X".
  const itemId = sub.items.data[0]?.id;
  if (!itemId) {
    return NextResponse.json({ error: 'Subscription has no items' }, { status: 500 });
  }

  // /v1/invoices/upcoming with subscription_items override gives us
  // the proration preview. We pass `subscription_proration_behavior=
  // always_invoice` so the response matches what the upgrade flow
  // will actually charge.
  const params = new URLSearchParams({
    customer: profile.stripe_customer_id,
    subscription: sub.id,
    'subscription_items[0][id]': itemId,
    'subscription_items[0][price]': priceId,
    subscription_proration_behavior: 'always_invoice',
    subscription_proration_date: String(Math.floor(Date.now() / 1000)),
  });

  const preview = await stripeGet(`/invoices/upcoming?${params.toString()}`);
  if (preview.error) {
    console.error('upcoming-invoice preview failed:', JSON.stringify(preview.error));
    return NextResponse.json(
      { error: preview.error.message ?? 'Could not preview upgrade' },
      { status: 400 },
    );
  }

  // Stripe returns the invoice's `amount_due` (what the user will be
  // charged now) and `total` separately; for upgrade previews these
  // typically match. `lines` includes the prorated credit + new charge.
  const proratedNow: number = preview.amount_due ?? preview.total ?? 0;

  // The line item that represents the new full-period price gives us
  // what the user will be charged on the next renewal cycle.
  const newPriceLine = (preview.lines?.data ?? []).find(
    (l: { price?: { id?: string } }) => l.price?.id === priceId,
  );
  const nextPeriodAmount: number = newPriceLine?.amount ?? 0;

  return NextResponse.json({
    hasExistingSub: true,
    current_subscription_id: sub.id,
    current_price_id: sub.items.data[0]?.price.id,
    prorated_amount_pennies: proratedNow,
    prorated_amount_display: formatGBP(proratedNow),
    next_period_amount_pennies: nextPeriodAmount,
    next_period_amount_display: formatGBP(nextPeriodAmount),
    next_billing_date: preview.next_payment_attempt
      ? new Date(preview.next_payment_attempt * 1000).toISOString()
      : preview.period_end
        ? new Date(preview.period_end * 1000).toISOString()
        : null,
    currency: preview.currency ?? 'gbp',
  });
}
