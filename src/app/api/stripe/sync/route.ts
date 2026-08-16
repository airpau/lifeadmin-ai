import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { priceIdToTier } from '@/lib/stripe';
import { tierRank } from '@/lib/tier-rank';

export const runtime = 'nodejs';

const STRIPE_BASE = 'https://api.stripe.com/v1';

// Tier resolution moved to the canonical `priceIdToTier` in @/lib/stripe
// (2026-08). This route and /api/webhooks/stripe each used to carry their
// own hardcoded price→tier map that defaulted an unknown price ID to
// 'essential'. A single stale env var would therefore have written every
// Pro subscriber down to Essential on their next dashboard mount. Unknown
// price IDs now resolve to null and the tier write is skipped entirely.

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
      return NextResponse.json({
        synced: true,
        tier: profile?.subscription_tier || 'free',
        reason: 'No Stripe customer — stored tier is authoritative',
      });
    }

    // Fetch active/trialing subs
    const [activeSubs, trialingSubs] = await Promise.all([
      stripeGet(`/subscriptions?customer=${profile.stripe_customer_id}&status=active&limit=5`),
      stripeGet(`/subscriptions?customer=${profile.stripe_customer_id}&status=trialing&limit=5`),
    ]);

    const allSubs = [...(activeSubs.data || []), ...(trialingSubs.data || [])];

    // IMPORTANT: this route is PROMOTE-ONLY. We never downgrade a user
    // here — that was the root cause of the April 2026 founder
    // downgrade incident. Demotion is now webhook-driven only:
    // customer.subscription.deleted / .updated with status=canceled
    // in /api/stripe/webhooks explicitly writes subscription_tier='free'.
    //
    // If the user has no active Stripe sub but the profile still says
    // essential/pro, we leave it alone. Either:
    //   (a) their webhook just hasn't landed yet (race condition — retry);
    //   (b) they were granted a tier manually (admin grant, comped);
    //   (c) they're on an onboarding trial (trial_ends_at still in future).
    // None of these justify a silent tier wipe on every dashboard mount.
    if (allSubs.length === 0) {
      return NextResponse.json({
        synced: true,
        tier: profile.subscription_tier || 'free',
        reason: 'No active Stripe sub — stored tier preserved (promote-only policy)',
      });
    }

    // Get full subscription details directly
    const sub = await stripeGet(`/subscriptions/${allSubs[0].id}`);

    const currentPriceId = sub.items?.data?.[0]?.price?.id || '';
    const currentTier = priceIdToTier(currentPriceId);

    const storedTier = (profile.subscription_tier as string) || 'free';

    // Decide whether the tier is safe to write. Two reasons to skip:
    //
    //   1. Unrecognised price ID → never guess. The old code defaulted to
    //      'essential', which would demote a Pro subscriber.
    //   2. Resolved tier ranks LOWER than the stored tier → that's a
    //      demotion, and per CLAUDE.md demotion is webhook-driven only.
    //
    // In both cases we still refresh status + subscription id, and we
    // still return pendingChange so the profile page can show a
    // scheduled downgrade / cancellation banner.
    let skipTierWrite: string | null = null;
    if (!currentTier) {
      skipTierWrite = 'Unrecognised Stripe price ID — stored tier preserved';
      console.error('Stripe sync: unrecognised price ID — tier write skipped', {
        userId: user.id,
        priceId: currentPriceId,
        subscriptionId: sub.id,
      });
    } else if (tierRank(currentTier) < tierRank(storedTier)) {
      // `tierRank` returns -1 for an unrecognised tier, not 0. That
      // matters here: the old `?? 0` made an unknown stored tier
      // indistinguishable from Free, so a legitimate promotion could be
      // compared against a bogus rank. -1 means an unknown STORED tier
      // can never block a real write, while an unknown RESOLVED tier is
      // already caught by the `!currentTier` branch above.
      skipTierWrite = 'Stored tier is higher — demotion is webhook-driven only';
      console.warn('Stripe sync: resolved tier is lower than stored tier — write skipped', {
        userId: user.id,
        storedTier,
        resolvedTier: currentTier,
        subscriptionId: sub.id,
      });
    }

    const tierToReport = skipTierWrite ? storedTier : currentTier!;

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
          const nextTier = priceIdToTier(nextPriceId);
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
      const pendingTier = priceIdToTier(pendingPriceId);
      if (pendingTier && pendingTier !== currentTier) {
        const date = formatDate(sub.current_period_end || sub.cancel_at);
        if (date) pendingChange = { type: 'downgrade', tier: pendingTier, date };
      }
    }

    console.log(`Sync: tier=${currentTier} pendingChange=${JSON.stringify(pendingChange)}`);

    // Update profile. Surface any error (was silently swallowed before — the
    // 'plus'/'essential' check-constraint bug went undetected for weeks
    // because this update failed every time without anyone noticing).
    const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { error: updateError } = await admin.from('profiles').update({
      ...(skipTierWrite ? {} : { subscription_tier: currentTier }),
      subscription_status: sub.status,
      stripe_subscription_id: sub.id,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id);

    if (updateError) {
      console.error('Stripe sync: profile UPDATE FAILED:', updateError.message, {
        userId: user.id,
        attemptedTier: tierToReport,
        stripeSubId: sub.id,
      });
      return NextResponse.json(
        { error: `Profile update failed: ${updateError.message}`, attemptedTier: tierToReport },
        { status: 500 },
      );
    }

    // Build period end date safely
    const periodEndTimestamp = sub.current_period_end || sub.cancel_at;
    const currentPeriodEnd = periodEndTimestamp
      ? new Date(periodEndTimestamp * 1000).toISOString()
      : null;

    return NextResponse.json({
      synced: true,
      tier: tierToReport,
      status: sub.status,
      pendingChange,
      currentPeriodEnd,
      subscriptionId: sub.id,
      ...(skipTierWrite ? { tierWriteSkipped: skipTierWrite } : {}),
    });
  } catch (err: any) {
    console.error('Stripe sync error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
