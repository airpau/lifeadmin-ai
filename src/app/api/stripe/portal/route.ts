import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe first.' },
        { status: 400 }
      );
    }

    const returnUrl = 'https://paybacker.co.uk/dashboard/profile?billing=updated';

    // Build portal session params
    const params: Record<string, string> = {
      customer: profile.stripe_customer_id,
      return_url: returnUrl,
    };

    // If user has a subscription, add flow for subscription update
    // This makes the portal auto-redirect back after making changes
    if (profile.stripe_subscription_id) {
      params['flow_data[type]'] = 'subscription_update';
      params['flow_data[subscription_update][subscription]'] = profile.stripe_subscription_id;
      params['flow_data[after_completion][type]'] = 'redirect';
      params['flow_data[after_completion][redirect][return_url]'] = returnUrl;
    }

    console.log(`Portal: creating session for customer=${profile.stripe_customer_id}`);

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    });

    const session = await res.json();

    if (session.error) {
      console.error('Portal error:', JSON.stringify(session.error));
      // If flow fails (e.g. subscription already cancelled), try without flow
      const fallbackRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          customer: profile.stripe_customer_id,
          return_url: returnUrl,
        }).toString(),
      });
      const fallbackSession = await fallbackRes.json();
      if (fallbackSession.error) {
        return NextResponse.json({ error: fallbackSession.error.message }, { status: 400 });
      }
      return NextResponse.json({ url: fallbackSession.url });
    }

    console.log(`Portal: session created`);
    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('Portal error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
