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

async function stripeGet(path: string) {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  return res.json();
}

// Called by dashboard/profile to sync subscription state from Stripe
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
      return NextResponse.json({ synced: false, tier: 'free', reason: 'No Stripe customer' });
    }

    // Fetch active/trialing subs from Stripe
    const [activeSubs, trialingSubs] = await Promise.all([
      stripeGet(`/subscriptions?customer=${profile.stripe_customer_id}&status=active&limit=5`),
      stripeGet(`/subscriptions?customer=${profile.stripe_customer_id}&status=trialing&limit=5`),
    ]);

    const allSubs = [...(activeSubs.data || []), ...(trialingSubs.data || [])];

    if (allSubs.length === 0) {
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

    const sub = allSubs[0];
    const currentPriceId = sub.items.data[0]?.price.id || '';
    const currentTier = PRICE_ID_TO_TIER[currentPriceId] || 'essential';

    // Check for pending changes (scheduled downgrade/cancel)
    let pendingChange: { type: string; tier?: string; date: string } | null = null;

    // Check if subscription is set to cancel at period end OR at a specific date
    if (sub.cancel_at_period_end) {
      const cancelDate = new Date(sub.current_period_end * 1000).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      pendingChange = { type: 'cancel', date: cancelDate };
    } else if (sub.cancel_at) {
      const cancelDate = new Date(sub.cancel_at * 1000).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      pendingChange = { type: 'cancel', date: cancelDate };
    }

    // Check for a scheduled plan change via subscription schedule
    if (sub.schedule) {
      const schedule = await stripeGet(`/subscription_schedules/${sub.schedule}`);
      if (schedule.phases && schedule.phases.length > 1) {
        const nextPhase = schedule.phases[1];
        const nextPriceId = nextPhase.items?.[0]?.price;
        const nextTier = PRICE_ID_TO_TIER[nextPriceId] || null;
        if (nextTier && nextTier !== currentTier) {
          const changeDate = new Date(nextPhase.start_date * 1000).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          });
          pendingChange = { type: 'downgrade', tier: nextTier, date: changeDate };
        }
      }
    }

    // Check for pending update on the subscription itself (Stripe portal sets this)
    if (sub.pending_update) {
      const pendingPriceId = sub.pending_update.subscription_items?.[0]?.price;
      const pendingTier = pendingPriceId ? PRICE_ID_TO_TIER[pendingPriceId] : null;
      if (pendingTier && pendingTier !== currentTier) {
        const changeDate = new Date(sub.current_period_end * 1000).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        });
        pendingChange = { type: 'downgrade', tier: pendingTier, date: changeDate };
      }
    }

    // Update profile
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await admin.from('profiles').update({
      subscription_tier: currentTier,
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    return NextResponse.json({
      synced: true,
      tier: currentTier,
      status: sub.status,
      pendingChange,
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
    });
  } catch (err: any) {
    console.error('Stripe sync error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
