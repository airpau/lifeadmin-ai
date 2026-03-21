import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripeClient, PRICE_IDS } from '@/lib/stripe';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // 1. Verify Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('Stripe checkout: STRIPE_SECRET_KEY not set');
      return NextResponse.json(
        { error: 'Payment system not configured. Please contact support.' },
        { status: 500 }
      );
    }

    // 2. Verify authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError) {
      console.error('Stripe checkout: auth error:', authError.message);
      return NextResponse.json(
        { error: 'Authentication error. Please sign in again.' },
        { status: 401 }
      );
    }

    if (!user) {
      console.error('Stripe checkout: no user in session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`Stripe checkout: user=${user.id} email=${user.email}`);

    // 3. Parse request
    const body = await request.json();
    const { priceId, billingCycle } = body;

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID required' }, { status: 400 });
    }

    console.log(`Stripe checkout: priceId=${priceId} billingCycle=${billingCycle}`);

    const stripe = getStripeClient();

    // 4. Get or create Stripe customer
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, email')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Stripe checkout: profile fetch error:', profileError.message);
    }

    let customerId = profile?.stripe_customer_id;

    if (!customerId) {
      console.log('Stripe checkout: creating new Stripe customer');
      const customer = await stripe.customers.create({
        email: profile?.email || user.email!,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      customerId = customer.id;
      console.log(`Stripe checkout: created customer=${customerId}`);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);

      if (updateError) {
        console.error('Stripe checkout: failed to save customer ID:', updateError.message);
      }
    }

    // 5. Build URLs
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'https://paybacker.co.uk';

    // 6. Create checkout session
    console.log(`Stripe checkout: creating session customer=${customerId} price=${priceId}`);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/dashboard?success=true`,
      cancel_url: `${appUrl}/pricing?canceled=true`,
      metadata: {
        user_id: user.id,
        billing_cycle: billingCycle,
      },
      subscription_data: {
        trial_period_days: 7,
        metadata: {
          user_id: user.id,
        },
      },
    });

    console.log(`Stripe checkout: session created id=${session.id}`);
    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Stripe checkout error:', error?.type || 'unknown', error?.message || error);

    if (error?.type === 'StripeInvalidRequestError') {
      return NextResponse.json(
        { error: 'Invalid payment configuration. Please contact support.' },
        { status: 400 }
      );
    }
    if (error?.type === 'StripeAuthenticationError') {
      return NextResponse.json(
        { error: 'Payment system authentication failed. Please contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
