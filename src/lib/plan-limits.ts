import { createClient } from '@supabase/supabase-js';
import { isAtLeast, type PlanTier } from '@/lib/tier-rank';
import { resolveHouseholdTier } from '@/lib/household';

// PlanTier now lives in the dependency-free @/lib/tier-rank so the Stripe
// helpers, client components and this module all agree on the same union
// and the same ordering. Re-exported here because ~40 files import it
// from '@/lib/plan-limits'.
export type { PlanTier } from '@/lib/tier-rank';

export interface PlanLimits {
  complaintsPerMonth: number | null; // null = unlimited
  scanRunsPerMonth: number | null;
  // null = unlimited. Enforced at the connect endpoints (yapily/google/microsoft).
  maxBanks: number | null;
  maxEmails: number | null;
  /**
   * How far back an inbox scan looks, in days.
   *
   * Every scanned message costs us an Anthropic call, so depth is the
   * single largest variable cost on the free tier. Free is capped at 90
   * days; paid tiers keep the full 2-year sweep the product has always
   * described (`FULL_EMAIL_SCAN_DAYS` in src/lib/email-scan-window.ts).
   *
   * Enforced server-side in every scan path via
   * `resolveEmailScanWindow(userId)`, which reads getEffectiveTier so an
   * active onboarding trial gets the paid window.
   */
  emailScanDays: number;
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
  /**
   * Ombudsman escalation packs included with the subscription.
   *
   * When false the user can still buy a pack as a one-off (£14.99 via
   * `/api/disputes/[id]/escalation-pack/checkout`) — that is deliberately
   * available on EVERY tier including Free, because pay-per-need is the
   * whole point of the product. When true, `hasEscalationPackAccess()`
   * short-circuits and no purchase is required.
   */
  ombudsmanPacksIncluded: boolean;
  /**
   * Position in the Dispute Agent work queue. LOWER runs first.
   *
   * The agent cron (`/api/cron/dispute-agent`) caps at 100 disputes per
   * run. When more than 100 are due, this decides who gets looked at in
   * this tick and who waits six hours. Same ordering is applied to the
   * bank-sync queue. This is the entire mechanism behind "priority
   * dispute handling" — there is no separate fast lane, and we should not
   * claim one.
   */
  disputeQueuePriority: number;
  /**
   * Seats a subscription of this tier grants, including the owner.
   * null = single-user tier (no household).
   */
  householdSeats: number | null;
  features: string[];
}

/**
 * TIER MATRIX — Free/Essential/Pro confirmed with founder 2026-04-22;
 * Household and Dispute Pro added 2026-08-16.
 *
 * NOTE (2026-08-20): the DB signup trigger still granted a 7-day trial,
 * contradicting rule 2 below — see the prepared (not yet applied) fix in
 * supabase/migrations/20260820120000_remove_auto_trial_from_signup_trigger.sql.
 *
 *                            Free   Essential  Pro    Household  DisputePro
 * Price / month              £0     £4.99      £9.99  £14.99     £19.99
 * Price / year               —      £44.99     £94.99 £149.99    £199.99
 * Seats                      1      1          1      4          1
 * Bank connections           2      3          ∞      ∞          ∞
 * Email connections          1      3          ∞      ∞          ∞
 * Inbox scan history         90d    2 years    2y     2y         2y
 * AI letters / month         3      ∞          ∞      ∞          ∞
 * Watchdog poll interval     manual 60m        30m    30m        15m
 * Dispute thread links       1      5          ∞      ∞          ∞
 * Renewal reminders          —      ✓          ✓      ✓          ✓
 * AI cancellation emails     —      ✓          ✓      ✓          ✓
 * Money Hub full categories  top 5  full       full   full       full
 * Money Hub budgets / goals  —      ✓          ✓      ✓          ✓
 * Money Hub top merchants    —      —          ✓      ✓          ✓
 * Price-increase alerts      in-app +email     +TG    +TG        +TG
 * Export (CSV / PDF)         —      —          ✓      ✓          ✓
 * Paybacker Assistant (MCP)  —      —          ✓      ✓          ✓
 * Pocket Agent (Telegram)    ✓      ✓          ✓      ✓          ✓
 * WhatsApp Pocket Agent      —      —          ✓      ✓          ✓
 * On-demand bank sync        —      —          ✓      ✓          ✓
 * Priority support ticket    —      —          ✓      ✓          ✓
 * Dispute queue priority     3      2          1      1          0
 * Ombudsman packs included   —      —          —      —          ✓
 *
 * NOTE: the pre-2026-08 version of this comment claimed "Dispute-reply
 * watchdog 30m auto (all tiers)" and "Dispute thread links ∞" for every
 * tier. Both were wrong — the object below has always been the truth.
 * Corrected rather than left to mislead the next reader.
 *
 * Rules for the system:
 * 1. Paid tiers are NEVER auto-demoted. `/api/stripe/sync` promotes only.
 *    Demotion is webhook-driven (customer.subscription.deleted).
 * 2. No 14-day free Pro trial — the silent downgrade it caused was
 *    producing worse UX than having no trial at all.
 * 3. getEffectiveTier trusts `profile.subscription_tier` as source of truth.
 *    Onboarding-trial override kept only where `trial_ends_at > now()`,
 *    and it can only ever PROMOTE (see the guard in getEffectiveTier).
 * 4. NEVER gate a Pro feature with `tier === 'pro'`. Use `isAtLeastPro`
 *    from @/lib/tier-rank, or read the flag off PLAN_LIMITS. Household and
 *    Dispute Pro users are entitled to everything Pro gets.
 */
/**
 * Pro's feature-flag list. Household and Dispute Pro spread this rather
 * than restating it, so a new Pro feature can never accidentally fail to
 * reach the tiers that sit above Pro.
 */
const PRO_FEATURES: string[] = [
  'complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions',
  'cancellation_emails', 'renewal_reminders', 'full_spending', 'budgets_goals',
  'open_banking', 'unlimited_banks', 'transaction_analysis', 'priority_support',
  'pocket_agent', 'watchdog_auto', 'watchdog_telegram_instant', 'top_merchants',
  'export', 'mcp', 'price_alert_telegram', 'whatsapp_pocket_agent',
];

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    complaintsPerMonth: 3,
    scanRunsPerMonth: 1, // one-time bank scan, email scan, opportunity scan
    maxBanks: 2,
    maxEmails: 1,
    emailScanDays: 90,
    maxSpaces: 1,
    disputeThreadLinks: 1,
    watchdogSyncIntervalMinutes: null, // manual only
    whatsappPocketAgent: false,
    ombudsmanPacksIncluded: false,
    disputeQueuePriority: 3,
    householdSeats: null,
    features: ['complaints', 'basic_scanner', 'one_time_email_scan', 'one_time_opportunity_scan', 'watchdog_manual'],
  },
  essential: {
    complaintsPerMonth: null,
    scanRunsPerMonth: 4, // monthly re-scans (bank daily auto, email/opportunity monthly)
    maxBanks: 3,
    maxEmails: 3,
    emailScanDays: 730,
    maxSpaces: 1,
    disputeThreadLinks: 5,
    watchdogSyncIntervalMinutes: 60,
    whatsappPocketAgent: false,
    ombudsmanPacksIncluded: false,
    disputeQueuePriority: 2,
    householdSeats: null,
    features: ['complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions', 'cancellation_emails', 'renewal_reminders', 'full_spending', 'budgets_goals', 'watchdog_auto'],
  },
  pro: {
    complaintsPerMonth: null,
    scanRunsPerMonth: null, // unlimited everything
    maxBanks: null,
    maxEmails: null,
    emailScanDays: 730,
    maxSpaces: null,
    disputeThreadLinks: null,
    watchdogSyncIntervalMinutes: 30,
    whatsappPocketAgent: true,
    ombudsmanPacksIncluded: false,
    disputeQueuePriority: 1,
    householdSeats: null,
    features: PRO_FEATURES,
  },

  /**
   * Household — £14.99/mo, £149.99/yr. Up to 4 members.
   *
   * Entitlement-identical to Pro on purpose. A household is four normal,
   * fully data-isolated Paybacker accounts whose ENTITLEMENT is derived
   * from one subscription; it is not a shared workspace and there is no
   * cross-member visibility of any kind. See src/lib/household.ts.
   */
  household: {
    complaintsPerMonth: null,
    scanRunsPerMonth: null,
    maxBanks: null,
    maxEmails: null,
    emailScanDays: 730,
    maxSpaces: null,
    disputeThreadLinks: null,
    watchdogSyncIntervalMinutes: 30,
    whatsappPocketAgent: true,
    ombudsmanPacksIncluded: false,
    disputeQueuePriority: 1,
    householdSeats: 4,
    features: [...PRO_FEATURES, 'household_seats'],
  },

  /**
   * Dispute Pro — £19.99/mo, £199.99/yr.
   *
   * For someone actively recovering money, where the willingness to pay
   * anchors to the recovery (£100-£520 a case) rather than to a budgeting
   * app. Every differentiator below is enforced by real code — see the
   * per-field comments. Nothing aspirational is listed.
   */
  dispute_pro: {
    complaintsPerMonth: null,
    scanRunsPerMonth: null,
    maxBanks: null,
    maxEmails: null,
    emailScanDays: 730,
    maxSpaces: null,
    disputeThreadLinks: null,
    // 15-minute Watchdog polling vs 30 on Pro. Enforced directly by
    // /api/cron/dispute-reply-sync, which reads this field.
    watchdogSyncIntervalMinutes: 15,
    whatsappPocketAgent: true,
    // Unlimited Ombudsman escalation packs at no extra cost. One pack a
    // month covers the price difference vs Pro.
    ombudsmanPacksIncluded: true,
    // Front of the Dispute Agent queue and the bank-sync queue.
    disputeQueuePriority: 0,
    householdSeats: null,
    features: [...PRO_FEATURES, 'ombudsman_escalation_packs', 'dispute_queue_priority', 'watchdog_15min'],
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

  // Trial grants Pro — but only ever as a PROMOTION. The pre-2026-08
  // version wrote `onboardingTrialActive ? 'pro' : storedTier`, which
  // would have demoted a Dispute Pro subscriber to Pro for the duration
  // of an overlapping onboarding trial. Otherwise trust the stored tier
  // verbatim — demotion is webhook-driven (see /api/stripe/webhooks).
  const trialTier: PlanTier = onboardingTrialActive && !isAtLeast(storedTier, 'pro')
    ? 'pro'
    : storedTier;

  // Household members carry subscription_tier='free' on their own profile
  // (the Stripe ids stay on the owner's row — see src/lib/household.ts for
  // why we do not denormalise them). Derive their entitlement here.
  const effectiveTier: PlanTier = trialTier === 'free'
    ? await resolveHouseholdTier(admin, userId)
    : trialTier;

  const limits = PLAN_LIMITS[effectiveTier] ?? PLAN_LIMITS.free;

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
 * Two overrides, both PROMOTE-ONLY:
 *   1. An active onboarding trial lifts the user to 'pro' for the trial
 *      window. It can never lower a tier that already ranks at or above
 *      Pro (that would have demoted a Dispute Pro subscriber mid-trial).
 *   2. An accepted seat on someone else's Household plan lifts a Free
 *      user to 'household'. Only consulted when the stored tier is
 *      'free', so the common path still costs exactly one query.
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

  const trialTier: PlanTier = onboardingTrialActive && !isAtLeast(storedTier, 'pro')
    ? 'pro'
    : storedTier;

  if (trialTier !== 'free') return trialTier;

  return resolveHouseholdTier(admin, userId);
}

/**
 * Does this user get Ombudsman escalation packs without paying per pack?
 *
 * True only for tiers with `ombudsmanPacksIncluded`. Everyone else —
 * including Free — buys a pack for £14.99 as a one-off. That is the
 * point of the product: pay-per-need without a subscription.
 */
export async function hasIncludedEscalationPacks(userId: string): Promise<boolean> {
  const tier = await getEffectiveTier(userId);
  return PLAN_LIMITS[tier]?.ombudsmanPacksIncluded === true;
}

/**
 * Whether this user can use the WhatsApp Pocket Agent right now.
 *
 * Reads `getEffectiveTier` (Stripe + onboarding-trial aware) and returns
 * true when the resulting tier has `whatsappPocketAgent: true`. Used by:
 *   - /api/whatsapp/opt-in       (block link-up for non-Pro)
 *   - /api/whatsapp/webhook      (auto-reply non-Pro inbound with upgrade)
 *   - /api/cron/whatsapp-alerts  (filter outbound recipients)
 *
 * (Two PRs landed this function back-to-back — once via the prior
 *  WhatsApp gating commit and again via #340. The duplicate broke the
 *  Turbopack build with "the name `canUseWhatsApp` is defined multiple
 *  times". This is the surviving definition.)
 */
export async function canUseWhatsApp(userId: string): Promise<boolean> {
  const tier = await getEffectiveTier(userId);
  return PLAN_LIMITS[tier].whatsappPocketAgent === true;
}

/**
 * Free-tier monthly scan gate.
 *
 * Free users may run an inbox scan at most once per 30 days (across all of
 * their connected inboxes). Returns `{ allowed: true }` for paid tiers.
 * On free-tier rate-limit, callers should return HTTP 429 with the
 * `nextAvailableISO` so the UI can display a countdown.
 */
export interface FreeScanGateResult {
  allowed: boolean;
  tier: PlanTier;
  lastScanISO?: string | null;
  nextAvailableISO?: string | null;
}

export async function checkFreeScanGate(userId: string): Promise<FreeScanGateResult> {
  const tier = await getEffectiveTier(userId);
  if (tier !== 'free') {
    return { allowed: true, tier };
  }
  const admin = getAdmin();
  const { data } = await admin
    .from('email_connections')
    .select('last_scanned_at')
    .eq('user_id', userId)
    .order('last_scanned_at', { ascending: false })
    .limit(1);
  const lastISO = data?.[0]?.last_scanned_at ?? null;
  if (!lastISO) {
    return { allowed: true, tier, lastScanISO: null };
  }
  const lastMs = new Date(lastISO).getTime();
  const ageMs = Date.now() - lastMs;
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  if (ageMs >= THIRTY_DAYS_MS) {
    return { allowed: true, tier, lastScanISO: lastISO };
  }
  return {
    allowed: false,
    tier,
    lastScanISO: lastISO,
    nextAvailableISO: new Date(lastMs + THIRTY_DAYS_MS).toISOString(),
  };
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
