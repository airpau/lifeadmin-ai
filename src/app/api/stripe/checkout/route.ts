import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // Check for existing active subscriptions on this customer
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

    // If user has an active/trialing subscription, upgrade it instead of creating a new one
    if (allActiveSubs.length > 0) {
      // Use the most recent subscription
      const currentSub = allActiveSubs[0];
      const currentItemId = currentSub.items.data[0]?.id;
      const currentPriceId = currentSub.items.data[0]?.price.id;

      // If already on this price, no change needed
      if (currentPriceId === priceId) {
        return NextResponse.json({
          error: 'You are already on this plan.',
          alreadySubscribed: true,
        }, { status: 400 });
      }

      console.log(`Checkout: upgrading sub=${currentSub.id} from price=${currentPriceId} to price=${priceId}`);

      // Cancel any other duplicate subscriptions (keep only the one we're upgrading)
      for (let i = 1; i < allActiveSubs.length; i++) {
        console.log(`Checkout: cancelling duplicate sub=${allActiveSubs[i].id}`);
        await stripeDelete(`/subscriptions/${allActiveSubs[i].id}`);
      }

      // Update the subscription to the new price (prorate immediately)
      const updated = await stripePost(`/subscriptions/${currentSub.id}`, {
        'items[0][id]': currentItemId,
        'items[0][price]': priceId,
        proration_behavior: 'create_prorations',
      });

      if (updated.error) {
        console.error('Stripe upgrade error:', JSON.stringify(updated.error));
        return NextResponse.json({ error: updated.error.message }, { status: 400 });
      }

      console.log(`Checkout: upgraded to price=${priceId} sub=${updated.id}`);

      // The webhook will handle updating the profile tier, but also update directly
      // so the user sees the change immediately
      const PRICE_TO_TIER: Record<string, string> = {
        'price_1TDVvS7qw7mEWYpyN80zzAXM': 'essential',
        'price_1TDVvS7qw7mEWYpynfpI5x9M': 'essential',
        'price_1TDVvT7qw7mEWYpySmjZJTpG': 'pro',
        'price_1TDVvT7qw7mEWYpyrLHr6L45': 'pro',
      };

      const newTier = PRICE_TO_TIER[priceId] || 'essential';
      await supabase.from('profiles').update({
        subscription_tier: newTier,
        subscription_status: updated.status,
        stripe_subscription_id: updated.id,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);

      return NextResponse.json({
        upgraded: true,
        tier: newTier,
        url: `https://paybacker.co.uk/dashboard?upgraded=${newTier}`,
      });
    }

    // No existing subscription — create a new checkout session
    const appUrl = 'https://paybacker.co.uk';

    const session = await stripePost('/checkout/sessions', {
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      'metadata[user_id]': user.id,
      'metadata[billing_cycle]': billingCycle || 'monthly',
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
