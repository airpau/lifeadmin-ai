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
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripePost('/customers', {
        email: profile?.email || user.email!,
        'metadata[supabase_user_id]': user.id,
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';

    const session = await stripePost('/checkout/sessions', {
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      mode: 'subscription',
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      'metadata[user_id]': user.id,
      'metadata[billing_cycle]': billingCycle || 'monthly',
      'subscription_data[trial_period_days]': '7',
      'subscription_data[metadata][user_id]': user.id,
    });

    if (session.error) {
      console.error('Stripe session error:', session.error);
      return NextResponse.json({ error: session.error.message }, { status: 400 });
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error.message);
    return NextResponse.json({ error: error.message || 'Failed to create checkout session' }, { status: 500 });
  }
}
