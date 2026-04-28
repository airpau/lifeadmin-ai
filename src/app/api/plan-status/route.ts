/**
 * GET /api/plan-status
 *
 * Returns the user's current tier, the matrix of what their tier
 * allows, and where they currently stand on each axis. Powers the
 * over-limit banner + Pro-feature locks across the dashboard.
 *
 * Note: this is read-only diagnostic data. It does not enforce
 * limits — that happens at the connect/create endpoints. A user
 * who is "over limit" keeps using their existing banks/spaces/etc.
 * unaffected.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveTier, PLAN_LIMITS } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function over(usage: number, limit: number | null): boolean {
  if (limit === null) return false;
  return usage > limit;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = await getEffectiveTier(user.id);
  const limits = PLAN_LIMITS[tier];

  const [banksRes, emailsRes, spacesRes] = await Promise.all([
    supabase
      .from('bank_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('email_connections')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active'),
    supabase
      .from('account_spaces')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);

  const banks = banksRes.count ?? 0;
  const emails = emailsRes.count ?? 0;
  const spaces = spacesRes.count ?? 0;

  // Surface any active grace-period event so the banner can show a
  // countdown instead of just "you're over".
  const { data: grace } = await supabase
    .from('plan_downgrade_events')
    .select('id, from_tier, to_tier, grace_ends_at, downgraded_at')
    .eq('user_id', user.id)
    .is('resolved_at', null)
    .order('downgraded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Payment grace window (separate from the plan_downgrade_events
  // overage window above). This one fires when invoice.payment_failed
  // sets a 7-day deadline before the user's tier auto-demotes to free.
  const { data: paymentProfile } = await supabase
    .from('profiles')
    .select('subscription_tier, subscription_status, past_due_grace_ends_at')
    .eq('id', user.id)
    .maybeSingle();

  const status = {
    tier,
    limits: {
      maxBanks: limits.maxBanks,
      maxEmails: limits.maxEmails,
      maxSpaces: limits.maxSpaces,
    },
    usage: {
      banks,
      emails,
      spaces,
    },
    overLimit: {
      banks: over(banks, limits.maxBanks),
      emails: over(emails, limits.maxEmails),
      spaces: over(spaces, limits.maxSpaces),
    },
    features: {
      topMerchants: limits.features.includes('top_merchants'),
      export: limits.features.includes('export'),
      mcp: limits.features.includes('mcp'),
      priceAlertTelegram: limits.features.includes('price_alert_telegram'),
      fullSpending: limits.features.includes('full_spending'),
      budgetsGoals: limits.features.includes('budgets_goals'),
    },
    gracePeriod: grace
      ? {
          fromTier: grace.from_tier,
          toTier: grace.to_tier,
          downgradedAt: grace.downgraded_at,
          graceEndsAt: grace.grace_ends_at,
          daysRemaining: Math.max(0, Math.ceil((new Date(grace.grace_ends_at).getTime() - Date.now()) / 86400_000)),
        }
      : null,
    // Read straight from profiles so the banner doesn't need to wait
    // for the plan_downgrade_events row that's only inserted at
    // demotion time.
    past_due_grace_ends_at: paymentProfile?.past_due_grace_ends_at ?? null,
    subscription_tier: paymentProfile?.subscription_tier ?? null,
    subscription_status: paymentProfile?.subscription_status ?? null,
  };

  return NextResponse.json(status);
}
