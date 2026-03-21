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

    // Get the full subscription details directly (list may omit some fields)
    const subId = allSubs[0].id;
    const sub = await stripeGet(`/subscriptions/${subId}`);

    const currentPriceId = sub.items?.data?.[0]?.price?.id || '';
    const currentTier = PRICE_ID_TO_TIER[currentPriceId] || 'essential';

    console.log(`Sync: sub=${sub.id} status=${sub.status} cancel_at_period_end=${sub.cancel_at_period_end} cancel_at=${sub.cancel_at} current_period_end=${sub.current_period_end}`);

    // Check for pending changes
    let pendingChange: { type: string; tier?: string; date: string } | null = null;

    if (sub.cancel_at_period_end) {
      pendingChange = {
        type: 'cancel',
        date: new Date(sub.current_period_end * 1000).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        }),
      };
    } else if (sub.cancel_at) {
      pendingChange = {
        type: 'cancel',
        date: new Date(sub.cancel_at * 1000).toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
        }),
      };
    }

    // Check for scheduled plan change
    if (sub.schedule) {
      const schedule = await stripeGet(`/subscription_schedules/${sub.schedule}`);
      if (schedule.phases && schedule.phases.length > 1) {
        const nextPhase = schedule.phases[1];
        const nextPriceId = nextPhase.items?.[0]?.price;
        const nextTier = PRICE_ID_TO_TIER[nextPriceId] || null;
        if (nextTier && nextTier !== currentTier) {
          pendingChange = {
            type: 'downgrade',
            tier: nextTier,
            date: new Date(nextPhase.start_date * 1000).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric',
            }),
          };
        }
      }
    }

    // Check for pending_update
    if (sub.pending_update) {
      const pendingPriceId = sub.pending_update.subscription_items?.[0]?.price;
      const pendingTier = pendingPriceId ? PRICE_ID_TO_TIER[pendingPriceId] : null;
      if (pendingTier && pendingTier !== currentTier) {
        pendingChange = {
          type: 'downgrade',
          tier: pendingTier,
          date: new Date(sub.current_period_end * 1000).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'long', year: 'numeric',
          }),
        };
      }
    }

    console.log(`Sync: tier=${currentTier} pendingChange=${JSON.stringify(pendingChange)}`);

    // Update profile
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await admin.from('profiles').update({
      subscription_tier: currentTier,
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : sub.cancel_at
        ? new Date(sub.cancel_at * 1000).toISOString()
        : null;

    return NextResponse.json({
      synced: true,
      tier: currentTier,
      status: sub.status,
      pendingChange,
      currentPeriodEnd: periodEnd,
    });
  } catch (err: any) {
    console.error('Stripe sync error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
