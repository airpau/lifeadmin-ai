import { createClient } from '@supabase/supabase-js';

export type PlanTier = 'free' | 'essential' | 'pro';

export interface PlanLimits {
  complaintsPerMonth: number | null; // null = unlimited
  scanRunsPerMonth: number | null;
  // null = unlimited. Enforced at the connect endpoints (truelayer/yapily/google/microsoft).
  maxBanks: number | null;
  maxEmails: number | null;
  // Custom Account Spaces. Default "Everything" Space is always free; this
  // caps user-created Spaces. Pro-only feature — free/essential get 1.
  maxSpaces: number | null;
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
  /**
   * WhatsApp Pocket Agent — outbound + interactive WhatsApp via Twilio/Meta.
   *
   * Pro-only because every outbound template costs us £0.003-0.06 in Meta
   * fees, while Telegram (still available on every tier) is free for us.
   * Confirmed with Paul 2026-04-27.
   *
   * Trial Pro users (active onboarding trial) inherit this via getEffectiveTier.
   */
  whatsappPocketAgent: boolean;
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
    maxBanks: 2,
    maxEmails: 1,
    maxSpaces: 1,
    disputeThreadLinks: 1,
    watchdogSyncIntervalMinutes: null, // manual only
    whatsappPocketAgent: false,
    features: ['complaints', 'basic_scanner', 'one_time_email_scan', 'one_time_opportunity_scan', 'watchdog_manual'],
  },
  essential: {
    complaintsPerMonth: null,
    scanRunsPerMonth: 4, // monthly re-scans (bank daily auto, email/opportunity monthly)
    maxBanks: 3,
    maxEmails: 3,
    maxSpaces: 1,
    disputeThreadLinks: 5,
    watchdogSyncIntervalMinutes: 60,
    whatsappPocketAgent: false,
    features: ['complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions', 'cancellation_emails', 'renewal_reminders', 'full_spending', 'budgets_goals', 'watchdog_auto'],
  },
  pro: {
    complaintsPerMonth: null,
    scanRunsPerMonth: null, // unlimited everything
    maxBanks: null,
    maxEmails: null,
    maxSpaces: null,
    disputeThreadLinks: null,
    watchdogSyncIntervalMinutes: 30,
    whatsappPocketAgent: true,
    features: ['complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions', 'cancellation_emails', 'renewal_reminders', 'full_spending', 'budgets_goals', 'open_banking', 'unlimited_banks', 'transaction_analysis', 'priority_support', 'pocket_agent', 'watchdog_auto', 'watchdog_telegram_instant', 'top_merchants', 'export', 'mcp', 'price_alert_telegram', 'whatsapp_pocket_agent'],
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
 * Resolve the user's effective plan tier.
 *
 * Per CLAUDE.md (TIER MATRIX rule 1): paid tiers are NEVER auto-demoted.
 * Demotion is webhook-driven — `customer.subscription.deleted` clears
 * `subscription_tier` to 'free'. Until that webhook fires, the stored
 * tier is the source of truth, matching how `checkUsageLimit()` treats it.
 *
 * The previous version silently downgraded any paid user without an
 * active Stripe subscription_id back to 'free', which produced the
 * contradictory dashboard state where the sidebar (reading
 * profile.subscription_tier directly) showed "Pro Plan" while every
 * banner / quota check via getEffectiveTier() showed "free tier
 * allows X". Now both paths agree.
 *
 * Single override: an active onboarding trial flips the user to 'pro'
 * for the trial window — same logic as checkUsageLimit().
 */
export async function getEffectiveTier(userId: string): Promise<PlanTier> {
  const admin = getAdmin();
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

  return onboardingTrialActive ? 'pro' : storedTier;
}

/**
 * Whether this user can use the WhatsApp Pocket Agent right now.
 *
 * Reads `getEffectiveTier` (Stripe + onboarding-trial aware) and returns
 * true when the resulting tier has `whatsappPocketAgent: true`. Used by:
 *   - /api/whatsapp/opt-in       (block link-up for non-Pro)
 *   - /api/whatsapp/webhook      (auto-reply non-Pro inbound with upgrade)
 *   - /api/cron/whatsapp-alerts  (filter outbound recipients)
 */
export async function canUseWhatsApp(userId: string): Promise<boolean> {
  const tier = await getEffectiveTier(userId);
  return PLAN_LIMITS[tier].whatsappPocketAgent === true;
}

/**
 * Whether this user can use the WhatsApp Pocket Agent right now.
 *
 * Reads `getEffectiveTier` (Stripe + onboarding-trial aware) and returns
 * true when the resulting tier has `whatsappPocketAgent: true`. Used by:
 *   - /api/whatsapp/opt-in       (block link-up for non-Pro)
 *   - /api/whatsapp/webhook      (auto-reply non-Pro inbound with upgrade)
 *   - /api/cron/whatsapp-alerts  (filter outbound recipients)
 */
export async function canUseWhatsApp(userId: string): Promise<boolean> {
  const tier = await getEffectiveTier(userId);
  return PLAN_LIMITS[tier].whatsappPocketAgent === true;
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
