import { createClient } from '@supabase/supabase-js';

export type PlanTier = 'free' | 'essential' | 'pro';

export interface PlanLimits {
  complaintsPerMonth: number | null; // null = unlimited
  scanRunsPerMonth: number | null;
  /**
   * Max number of active dispute→email-thread links (Watchdog feature).
   * null = unlimited. A "link" is one row in dispute_watchdog_links with
   * sync_enabled=true.
   */
  disputeThreadLinks: number | null;
  /**
   * Minimum minutes between automatic background syncs of a linked thread.
   * Free tier has no background sync (manual only) — represented by null.
   */
  watchdogSyncIntervalMinutes: number | null;
  features: string[];
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    complaintsPerMonth: 3,
    scanRunsPerMonth: 1, // one-time bank scan, email scan, opportunity scan
    disputeThreadLinks: 1,
    watchdogSyncIntervalMinutes: null, // manual only
    features: ['complaints', 'basic_scanner', 'one_time_email_scan', 'one_time_opportunity_scan', 'watchdog_manual', 'pocket_agent'],
  },
  essential: {
    complaintsPerMonth: null,
    scanRunsPerMonth: 4, // monthly re-scans (bank daily auto, email/opportunity monthly)
    disputeThreadLinks: 5,
    watchdogSyncIntervalMinutes: 60,
    features: ['complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions', 'cancellation_emails', 'renewal_reminders', 'full_spending', 'watchdog_auto', 'pocket_agent'],
  },
  pro: {
    complaintsPerMonth: null,
    scanRunsPerMonth: null, // unlimited everything
    disputeThreadLinks: null,
    watchdogSyncIntervalMinutes: 30,
    features: ['complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions', 'cancellation_emails', 'renewal_reminders', 'full_spending', 'open_banking', 'unlimited_banks', 'transaction_analysis', 'priority_support', 'pocket_agent', 'watchdog_auto', 'watchdog_telegram_instant'],
  },
};

function getYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface UsageCheckResult {
  allowed: boolean;
  used: number;
  limit: number | null;
  tier: PlanTier;
  upgradeRequired: boolean;
}

export async function checkUsageLimit(
  userId: string,
  action: 'complaint_generated' | 'scan_run'
): Promise<UsageCheckResult> {
  const admin = getAdmin();

  // Fetch user's current tier and Stripe subscription info
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier as PlanTier) ?? 'free';

  // Verify paid tier has an active Stripe subscription or trial
  const isPaid = tier !== 'free';
  const hasActiveStripe = profile?.stripe_subscription_id &&
    ['active', 'trialing'].includes(profile?.subscription_status ?? '');

  // Onboarding trial (any tier): trial_ends_at in the future, not yet converted or expired
  const isOnboardingTrial = profile?.trial_ends_at &&
    new Date(profile.trial_ends_at) > new Date() &&
    !profile?.trial_converted_at &&
    !profile?.trial_expired_at;

  // Founding member trial: paid tier, trialing, no Stripe, valid trial_ends_at
  const isFoundingTrial = isPaid && !profile?.stripe_subscription_id &&
    profile?.subscription_status === 'trialing' &&
    profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();

  // Active onboarding trial always grants pro-level access regardless of stored tier
  if (!hasActiveStripe && isOnboardingTrial) {
    return { allowed: true, used: 0, limit: null, tier: 'pro', upgradeRequired: false };
  }

  const effectiveTier: PlanTier = (isPaid && !hasActiveStripe && !isFoundingTrial) ? 'free' : tier;
  if (isPaid && !hasActiveStripe && !isFoundingTrial) {
    console.warn(`[plan-limits] User ${userId} has tier=${tier} but no active Stripe subscription. Treating as free.`);
  }

  const limits = PLAN_LIMITS[effectiveTier];

  const limitKey = action === 'complaint_generated'
    ? 'complaintsPerMonth'
    : 'scanRunsPerMonth';
  const limit = limits[limitKey];

  // Unlimited — no check needed
  if (limit === null) {
    return { allowed: true, used: 0, limit: null, tier: effectiveTier, upgradeRequired: false };
  }

  // Fetch current month usage
  const yearMonth = getYearMonth();
  const { data: usage } = await admin
    .from('usage_logs')
    .select('count')
    .eq('user_id', userId)
    .eq('action', action)
    .eq('year_month', yearMonth)
    .single();

  const used = usage?.count ?? 0;
  const allowed = used < limit;

  return { allowed, used, limit, tier: effectiveTier, upgradeRequired: !allowed };
}

export async function incrementUsage(
  userId: string,
  action: 'complaint_generated' | 'scan_run'
): Promise<void> {
  const admin = getAdmin();
  const yearMonth = getYearMonth();

  // Upsert: insert row or increment count atomically
  await admin.rpc('increment_usage', {
    p_user_id: userId,
    p_action: action,
    p_year_month: yearMonth,
  });
}

// ---------------------------------------------------------------------------
// Watchdog (dispute ⇄ email thread sync) helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the user's effective plan tier, applying the same
 * Stripe/founding-member logic as checkUsageLimit().
 */
export async function getEffectiveTier(userId: string): Promise<PlanTier> {
  const admin = getAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at, founding_member')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier as PlanTier) ?? 'free';
  const isPaid = tier !== 'free';
  const hasActiveStripe = profile?.stripe_subscription_id &&
    ['active', 'trialing'].includes(profile?.subscription_status ?? '');

  // Onboarding trial grants pro access regardless of stored tier
  const isOnboardingTrial = profile?.trial_ends_at &&
    new Date(profile.trial_ends_at) > new Date() &&
    !profile?.trial_converted_at &&
    !profile?.trial_expired_at;

  if (!hasActiveStripe && isOnboardingTrial) return 'pro';

  const isFoundingTrial = isPaid && !profile?.stripe_subscription_id &&
    profile?.subscription_status === 'trialing' &&
    profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();

  // Founding members were granted Essential/Pro manually and by design have
  // no Stripe subscription. The profile tier is authoritative for them.
  // Mirrors the guard PR #151 added to /api/stripe/sync — without this, the
  // Watchdog cron (and every other caller of getEffectiveTier) degrades
  // founders to 'free' and skips their linked threads entirely, which is
  // exactly what was hiding Paul's OneStream reply for 18h.
  if (profile?.founding_member === true && isPaid) return tier;

  return (isPaid && !hasActiveStripe && !isFoundingTrial) ? 'free' : tier;
}

/**
 * Check whether the user can link a new dispute email thread (Watchdog).
 *
 * Unlike monthly-quota checks this is a *concurrent* limit based on the
 * current count of active rows in dispute_watchdog_links.
 */
export async function checkWatchdogLinkLimit(userId: string): Promise<UsageCheckResult> {
  const admin = getAdmin();
  const tier = await getEffectiveTier(userId);
  const limit = PLAN_LIMITS[tier].disputeThreadLinks;

  if (limit === null) {
    return { allowed: true, used: 0, limit: null, tier, upgradeRequired: false };
  }

  const { count } = await admin
    .from('dispute_watchdog_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('sync_enabled', true);

  const used = count ?? 0;
  const allowed = used < limit;
  return { allowed, used, limit, tier, upgradeRequired: !allowed };
}
