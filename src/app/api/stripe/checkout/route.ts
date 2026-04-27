import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PRICE_IDS } from '@/lib/stripe';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STRIPE_BASE = 'https://api.stripe.com/v1';

async function stripePost(path: string, params: Record<string, string>) {
  const key = process.env.STRIPE_SECRET_KEY!;
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  return res.json();
}

async function stripeGet(path: string) {
  const key = process.env.STRIPE_SECRET_KEY!;
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  return res.json();
}

async function stripeDelete(path: string) {
  const key = process.env.STRIPE_SECRET_KEY!;
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${key}` },
  });
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Payment system not configured.' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Please sign in to subscribe.' }, { status: 401 });
    }

    const body = await request.json();
    const { priceId, billingCycle } = body;

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID required' }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id, email')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripePost('/customers', {
        email: profile?.email || user.email!,
        'metadata[supabase_user_id]': user.id,
      });
      if (customer.error) {
        console.error('Stripe customer create error:', JSON.stringify(customer.error));
        return NextResponse.json({ error: 'Failed to create customer.' }, { status: 500 });
      }
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    // Check for existing active subscriptions
    const existingSubs = await stripeGet(
      `/subscriptions?customer=${customerId}&status=active&limit=10`
    );
    const trialingSubs = await stripeGet(
      `/subscriptions?customer=${customerId}&status=trialing&limit=10`
    );
    const allActiveSubs = [
      ...(existingSubs.data || []),
      ...(trialingSubs.data || []),
    ];

    console.log(`Checkout: customer=${customerId} existing_subs=${allActiveSubs.length}`);

    // If already on the exact same price, reject
    if (allActiveSubs.length > 0) {
      const currentSub = allActiveSubs[0];
      const currentItemId: string | undefined = currentSub.items.data[0]?.id;
      const currentPriceId: string | undefined = currentSub.items.data[0]?.price.id;

      if (currentPriceId === priceId) {
        return NextResponse.json({
          error: 'You are already on this plan.',
          alreadySubscribed: true,
        }, { status: 400 });
      }

      // UPGRADE / DOWNGRADE / CYCLE-CHANGE FLOW
      //
      // The user has an existing active subscription on a different price
      // (e.g. Essential monthly → Pro monthly, or Essential monthly → Pro
      // yearly). We MUST NOT create a fresh checkout session here — that
      // would leave them with two parallel subscriptions and double-bill
      // them. Instead we update the existing subscription with
      // `proration_behavior=always_invoice`, which:
      //
      //   1. Credits unused time on the old price back to the customer
      //   2. Charges the prorated upcharge for the new price immediately
      //   3. Sets the next billing cycle to the new price
      //
      // For "upgraded the same day" cases (Paul's scenario: paid £4.99
      // for Essential today, upgrades to Pro today) the user pays
      // ~£5.00 and lands on Pro immediately. They are not double-billed
      // and don't lose the Essential days they already paid for.
      //
      // payment_behavior='error_if_incomplete' so we surface card-decline
      // failures to the user immediately rather than leaving them on a
      // half-upgraded subscription.
      if (currentItemId) {
        const updated = await stripePost(`/subscriptions/${currentSub.id}`, {
          'items[0][id]': currentItemId,
          'items[0][price]': priceId,
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
          'metadata[user_id]': user.id,
          'metadata[billing_cycle]': billingCycle || 'monthly',
          'metadata[upgrade_from_price]': currentPriceId ?? '',
        });

        if (updated.error) {
          console.error('Stripe upgrade error:', JSON.stringify(updated.error));
          return NextResponse.json(
            { error: updated.error.message ?? 'Upgrade failed' },
            { status: 400 },
          );
        }

        // Stripe auto-creates and pays an invoice for the proration.
        // We optimistically update the local profile tier so the
        // dashboard reflects the new plan immediately — the
        // /api/stripe/sync route will reconcile on next call anyway.
        //
        // BUG FIX 2026-04-27: previously this used `priceId.includes('pro')`
        // which never matches because Stripe price IDs look like
        // "price_1TEsJf7qw7mEWYpy4alOarY6" — there's no literal "pro" in
        // them. The fallback env-var compare hit non-existent keys
        // (NEXT_PUBLIC_STRIPE_PRICE_PRO_*) so newTier always resolved to
        // 'essential' even when upgrading to Pro. Net effect: Stripe
        // charged the prorated upgrade correctly but our profile row
        // stayed on 'essential'. Compare against PRICE_IDS from
        // @/lib/stripe instead — that's the authoritative source.
        const isProPrice =
          priceId === PRICE_IDS.pro_monthly || priceId === PRICE_IDS.pro_yearly;
        const isEssentialPrice =
          priceId === PRICE_IDS.essential_monthly || priceId === PRICE_IDS.essential_yearly;
        const newTier: 'pro' | 'essential' | 'free' = isProPrice
          ? 'pro'
          : isEssentialPrice
            ? 'essential'
            : 'free';

        await supabase
          .from('profiles')
          .update({
            subscription_tier: newTier,
            subscription_status: updated.status ?? 'active',
            stripe_subscription_id: currentSub.id,
          })
          .eq('id', user.id);

        return NextResponse.json({
          upgraded: true,
          subscriptionId: currentSub.id,
          status: updated.status,
          tier: newTier,
          // Frontend can route the user back to the dashboard with a
          // success banner. No Stripe Checkout redirect needed because
          // we used the existing payment method on file.
          redirectUrl: '/dashboard?upgrade=success',
        });
      }
    }

    // No existing sub — create a fresh Stripe checkout session.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';

    // Read Awin awc cookie for attribution tracking
    const awcCookie = request.cookies.get('awc')?.value || '';

    const session = await stripePost('/checkout/sessions', {
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      'metadata[user_id]': user.id,
      'metadata[billing_cycle]': billingCycle || 'monthly',
      'metadata[awc]': awcCookie,
      'subscription_data[metadata][user_id]': user.id,
    });

    if (session.error) {
      console.error('Stripe session error:', JSON.stringify(session.error));
      return NextResponse.json({ error: session.error.message }, { status: 400 });
    }

    if (!session.url) {
      console.error('Stripe session missing URL:', JSON.stringify(session));
      return NextResponse.json({ error: 'Checkout session created but no URL returned' }, { status: 500 });
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error.message);
    return NextResponse.json({ error: error.message || 'Failed to create checkout session' }, { status: 500 });
  }
}
