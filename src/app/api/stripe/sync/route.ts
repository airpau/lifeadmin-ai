import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const STRIPE_BASE = 'https://api.stripe.com/v1';

const PRICE_ID_TO_TIER: Record<string, string> = {
  'price_1TDVvS7qw7mEWYpyN80zzAXM': 'essential',
  'price_1TDVvS7qw7mEWYpynfpI5x9M': 'essential',
  'price_1TDVvT7qw7mEWYpySmjZJTpG': 'pro',
  'price_1TDVvT7qw7mEWYpyrLHr6L45': 'pro',
};

// Called by the dashboard after Stripe checkout redirect
// Checks Stripe for the user's actual subscription and syncs to DB
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, subscription_tier')
      .eq('id', user.id)
      .single();

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ synced: false, reason: 'No Stripe customer' });
    }

    // Fetch active/trialing subs from Stripe
    const key = process.env.STRIPE_SECRET_KEY!;
    const [activeSubs, trialingSubs] = await Promise.all([
      fetch(`${STRIPE_BASE}/subscriptions?customer=${profile.stripe_customer_id}&status=active&limit=5`, {
        headers: { 'Authorization': `Bearer ${key}` },
      }).then(r => r.json()),
      fetch(`${STRIPE_BASE}/subscriptions?customer=${profile.stripe_customer_id}&status=trialing&limit=5`, {
        headers: { 'Authorization': `Bearer ${key}` },
      }).then(r => r.json()),
    ]);

    const allSubs = [...(activeSubs.data || []), ...(trialingSubs.data || [])];

    if (allSubs.length === 0) {
      // No active sub — ensure profile is free
      if (profile.subscription_tier !== 'free') {
        const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        await admin.from('profiles').update({
          subscription_tier: 'free',
          subscription_status: null,
          stripe_subscription_id: null,
          updated_at: new Date().toISOString(),
        }).eq('id', user.id);
      }
      return NextResponse.json({ synced: true, tier: 'free' });
    }

    // Use the newest subscription
    const sub = allSubs[0];
    const priceId = sub.items.data[0]?.price.id || '';
    const tier = PRICE_ID_TO_TIER[priceId] || 'essential';

    // Update profile using service role (bypasses RLS)
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await admin.from('profiles').update({
      subscription_tier: tier,
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    return NextResponse.json({ synced: true, tier, status: sub.status });
  } catch (err: any) {
    console.error('Stripe sync error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
