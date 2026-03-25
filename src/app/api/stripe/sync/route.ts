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
  'price_1TDPoH8FbRNalJNU4KeEPNs7': 'essential',
  'price_1TDPoI8FbRNalJNUSVBFOpyA': 'essential',
  'price_1TDPoI8FbRNalJNUDAepvxYt': 'pro',
  'price_1TDPoI8FbRNalJNUEVzsBMvB': 'pro',
  'price_1TEdJN8FbRNalJNUQxTQpM8Y': 'essential',
  'price_1TEdJN8FbRNalJNUymPQdKvT': 'essential',
  'price_1TEdJN8FbRNalJNU0o6F4WZZ': 'pro',
  'price_1TEdJO8FbRNalJNUEb0U09ln': 'pro',
  // Live founding member prices
  'price_1TEsJe7qw7mEWYpyVIt4i2Iy': 'essential',
  'price_1TEsJf7qw7mEWYpysxw2lnL3': 'essential',
  'price_1TEsJf7qw7mEWYpy4alOarY6': 'pro',
  'price_1TEsJf7qw7mEWYpyJmrhcy8b': 'pro',
};

function formatDate(timestamp: number | null | undefined): string | null {
  if (!timestamp) return null;
  try {
    return new Date(timestamp * 1000).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return null;
  }
}

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

    // Fetch active/trialing subs
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

    // Get full subscription details directly
    const sub = await stripeGet(`/subscriptions/${allSubs[0].id}`);

    const currentPriceId = sub.items?.data?.[0]?.price?.id || '';
    const currentTier = PRICE_ID_TO_TIER[currentPriceId] || 'essential';

    console.log(`Sync: sub=${sub.id} status=${sub.status} cancel_at_period_end=${sub.cancel_at_period_end} cancel_at=${sub.cancel_at} current_period_end=${sub.current_period_end}`);

    // Detect pending changes
    let pendingChange: { type: string; tier?: string; date: string } | null = null;

    if (sub.cancel_at_period_end && sub.current_period_end) {
      const date = formatDate(sub.current_period_end);
      if (date) pendingChange = { type: 'cancel', date };
    } else if (sub.cancel_at) {
      const date = formatDate(sub.cancel_at);
      if (date) pendingChange = { type: 'cancel', date };
    }

    // Check for scheduled plan change
    if (!pendingChange && sub.schedule) {
      try {
        const schedule = await stripeGet(`/subscription_schedules/${sub.schedule}`);
        if (schedule.phases && schedule.phases.length > 1) {
          const nextPhase = schedule.phases[1];
          const nextPriceId = nextPhase.items?.[0]?.price;
          const nextTier = PRICE_ID_TO_TIER[nextPriceId] || null;
          if (nextTier && nextTier !== currentTier) {
            const date = formatDate(nextPhase.start_date);
            if (date) pendingChange = { type: 'downgrade', tier: nextTier, date };
          }
        }
      } catch {
        // Schedule fetch failed — not critical
      }
    }

    // Check for pending_update
    if (!pendingChange && sub.pending_update) {
      const pendingPriceId = sub.pending_update.subscription_items?.[0]?.price;
      const pendingTier = pendingPriceId ? PRICE_ID_TO_TIER[pendingPriceId] : null;
      if (pendingTier && pendingTier !== currentTier) {
        const date = formatDate(sub.current_period_end || sub.cancel_at);
        if (date) pendingChange = { type: 'downgrade', tier: pendingTier, date };
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

    // Build period end date safely
    const periodEndTimestamp = sub.current_period_end || sub.cancel_at;
    const currentPeriodEnd = periodEndTimestamp
      ? new Date(periodEndTimestamp * 1000).toISOString()
      : null;

    return NextResponse.json({
      synced: true,
      tier: currentTier,
      status: sub.status,
      pendingChange,
      currentPeriodEnd,
      subscriptionId: sub.id,
    });
  } catch (err: any) {
    console.error('Stripe sync error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
