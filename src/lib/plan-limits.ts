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

/**
 * TIER MATRIX — confirmed with founder 2026-04-22.
 *
 *                               Free    Essential   Pro
 * Bank connections              2       3           ∞
 * Email connections             1       3           ∞
 * AI letters / month            3       ∞           ∞
 * Dispute-reply watchdog        30m auto (all tiers)
 * Dispute thread links          ∞       ∞           ∞
 * Renewal reminders             —       ✓           ✓
 * AI cancellation emails        —       ✓           ✓
 * Money Hub full categories     top 5   full        full
 * Money Hub budgets / goals     —       ✓           ✓
 * Money Hub top merchants       —       —           ✓
 * Price-increase alerts         in-app  in-app+     in-app + email +
 *                                       email       Telegram instant
 * Export (CSV / PDF)            —       —           ✓
 * Paybacker Assistant (MCP)     —       —           ✓
 * Pocket Agent (Telegram)       ✓       ✓           ✓
 * Priority support              —       —           ✓
 *
 * Rules for the system:
 * 1. Paid tiers are NEVER auto-demoted. `/api/stripe/sync` promotes only.
 *    Demotion is webhook-driven (customer.subscription.deleted).
 * 2. No 14-day free Pro trial — the silent downgrade it caused was
 *    producing worse UX than having no trial at all.
 * 3. getEffectiveTier trusts `profile.subscription_tier` as source of truth.
 *    Onboarding-trial override kept only where `trial_ends_at > now()`.
 */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    complaintsPerMonth: 3,
    scanRunsPerMonth: 1, // one-time bank scan, email scan, opportunity scan
    disputeThreadLinks: 1,
    watchdogSyncIntervalMinutes: null, // manual only
    features: ['complaints', 'basic_scanner', 'one_time_email_scan', 'one_time_opportunity_scan', 'watchdog_manual'],
  },
  essential: {
    complaintsPerMonth: null,
    scanRunsPerMonth: 4, // monthly re-scans (bank daily auto, email/opportunity monthly)
    disputeThreadLinks: 5,
    watchdogSyncIntervalMinutes: 60,
    features: ['complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions', 'cancellation_emails', 'renewal_reminders', 'full_spending', 'watchdog_auto'],
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

  // Fetch user's current tier (and any active onboarding trial window).
  // getEffectiveTier handles the trial override so we use the same source
  // of truth here without duplicating logic.
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, trial_ends_at, trial_converted_at, trial_expired_at')
    .eq('id', userId)
    .single();

  const storedTier = (profile?.subscription_tier as PlanTier) ?? 'free';
  const onboardingTrialActive = !!profile?.trial_ends_at
    && new Date(profile.trial_ends_at) > new Date()
    && !profile?.trial_converted_at
    && !profile?.trial_expired_at;

  // Trial grants pro. Otherwise trust the stored tier verbatim —
  // demotion is webhook-driven (see /api/stripe/webhooks).
  const effectiveTier: PlanTier = onboardingTrialActive ? 'pro' : storedTier;

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
    .select('subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier as PlanTier) ?? 'free';
  const isPaid = tier !== 'free';
  const hasActiveStripe = profile?.stripe_subscription_id &&
    ['active', 'trialing'].includes(profile?.subscription_status ?? '');
  const isFoundingTrial = isPaid && !profile?.stripe_subscription_id &&
    profile?.subscription_status === 'trialing' &&
    profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();

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
