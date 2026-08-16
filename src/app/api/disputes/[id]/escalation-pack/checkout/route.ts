/**
 * POST /api/disputes/[id]/escalation-pack/checkout
 *
 * Starts a Stripe ONE-OFF payment (`mode: 'payment'`) for a £14.99
 * Ombudsman escalation pack against a specific dispute.
 *
 * Deliberately available to FREE and ESSENTIAL users. Pay-per-need
 * without subscribing is the product: someone mid-dispute who needs the
 * escalation drafted and tracked should not have to take out a
 * subscription to get it.
 *
 * Contract with the webhook
 * -------------------------
 * Both the session and the payment intent carry:
 *     metadata.product    = 'escalation_pack'
 *     metadata.user_id    = <supabase user id>
 *     metadata.dispute_id = <dispute id>
 *
 * `/api/webhooks/stripe` branches on `metadata.product` BEFORE it reaches
 * any tier-writing code, so this purchase can never move
 * `profiles.subscription_tier`. It grants a `dispute_entitlements` row and
 * nothing else.
 *
 * Note this route does NOT use the `confirmed: true` guard that
 * /api/stripe/checkout requires. That guard exists because the
 * subscription route can charge a saved card silently via
 * `proration_behavior=always_invoice`. This route only ever returns a
 * hosted Stripe Checkout URL — the user sees the price and clicks Pay on
 * Stripe's own page, so there is no silent-charge path to defend against.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ONE_OFF_PRICE_IDS, STRIPE_PRODUCT_TAG } from '@/lib/stripe';
import { getEffectiveTier } from '@/lib/plan-limits';
import { checkEscalationPackAccess } from '@/lib/escalation-pack/entitlements';
import { captureServer } from '@/lib/posthog-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STRIPE_BASE = 'https://api.stripe.com/v1';

async function stripePost(path: string, params: Record<string, string>) {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Payment system not configured.' }, { status: 500 });
  }

  const priceId = ONE_OFF_PRICE_IDS.escalation_pack;
  if (!priceId) {
    // Deliberately explicit: no hardcoded fallback price ID exists for
    // this product, so an unset env var must surface as a clear error
    // rather than a charge against the wrong price.
    console.error('[escalation-pack] STRIPE_ESCALATION_PACK_PRICE_ID is not set');
    return NextResponse.json(
      { error: 'Escalation packs are not available yet. Please contact support.' },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });

  // Confirm the dispute exists and belongs to this user (RLS enforces it).
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id, provider_name')
    .eq('id', id)
    .maybeSingle();

  if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });

  // Do not sell someone something they already have.
  const tier = await getEffectiveTier(user.id);
  const access = await checkEscalationPackAccess(supabase, user.id, id, tier);
  if (access.allowed) {
    return NextResponse.json(
      {
        error: access.via === 'tier'
          ? 'Escalation packs are already included with your plan.'
          : 'You already have an escalation pack available for this dispute.',
        alreadyEntitled: true,
        via: access.via,
      },
      { status: 400 },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email')
    .eq('id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripePost('/customers', {
      email: profile?.email || user.email || '',
      'metadata[supabase_user_id]': user.id,
    });
    if (customer.error) {
      console.error('[escalation-pack] customer create failed:', JSON.stringify(customer.error));
      return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 });
    }
    customerId = customer.id;
    await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';

  const session = await stripePost('/checkout/sessions', {
    customer: customerId!,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    // ONE-OFF. Not 'subscription' — this must never create a recurring
    // charge and must never appear in the subscription-tier resolution
    // path.
    mode: 'payment',
    success_url: `${appUrl}/dashboard/disputes?escalation_pack=success&dispute=${id}`,
    cancel_url: `${appUrl}/dashboard/disputes?escalation_pack=canceled&dispute=${id}`,
    'metadata[product]': STRIPE_PRODUCT_TAG.escalationPack,
    'metadata[user_id]': user.id,
    'metadata[dispute_id]': id,
    // Mirror the metadata onto the PaymentIntent so a refund event, which
    // carries the intent rather than the session, can still be routed.
    'payment_intent_data[metadata][product]': STRIPE_PRODUCT_TAG.escalationPack,
    'payment_intent_data[metadata][user_id]': user.id,
    'payment_intent_data[metadata][dispute_id]': id,
  });

  if (session.error || !session.url) {
    console.error('[escalation-pack] session create failed:', JSON.stringify(session.error ?? session));
    return NextResponse.json(
      { error: session.error?.message ?? 'Could not start checkout.' },
      { status: 400 },
    );
  }

  captureServer('escalation_pack_checkout_started', user.id, {
    dispute_id: id,
    tier,
    provider: (dispute as { provider_name?: string }).provider_name ?? null,
  });

  return NextResponse.json({ sessionId: session.id, url: session.url });
}
