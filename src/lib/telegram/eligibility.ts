/**
 * Pocket Agent (Telegram user-bot) eligibility check.
 *
 * Centralised so every cron uses the same rule. Previously each
 * telegram-* cron inlined its own filter, and they all collapsed
 * `subscription_status` to `['active','trialing']`. That excluded
 * `past_due` and `unpaid` accounts during Stripe's retry window —
 * which is exactly when the user is most likely to disengage and
 * needs to keep seeing value-driven alerts.
 *
 * Per CLAUDE.md "Paid tiers are never auto-demoted. Demotion is
 * webhook-driven (`customer.subscription.deleted`)." So while a
 * subscription is in retry, the user is still on Pro and entitled
 * to Pro features — including the Pocket Agent alert stream.
 *
 * Once we ship the 7-day grace + auto-demote, expired-grace users
 * will already have `subscription_tier='free'` so this gate will
 * naturally exclude them. No second filter needed here.
 */

export type EligibilityProfile = {
  subscription_tier?: string | null;
  subscription_status?: string | null;
  stripe_subscription_id?: string | null;
  trial_ends_at?: string | null;
  trial_converted_at?: string | null;
  trial_expired_at?: string | null;
};

// Statuses where Stripe is still trying to bill — user keeps tier.
const RETRY_STATUSES = new Set(['active', 'trialing', 'past_due', 'unpaid', 'incomplete']);

// Terminal statuses that mean the subscription is done. Tier should
// already be 'free' for these (set by the customer.subscription.deleted
// webhook) but we double-check.
const TERMINAL_STATUSES = new Set(['canceled', 'cancelled', 'expired', 'incomplete_expired']);

function isOnboardingTrial(p: EligibilityProfile): boolean {
  if (!p.trial_ends_at) return false;
  if (p.trial_converted_at || p.trial_expired_at) return false;
  return new Date(p.trial_ends_at).getTime() > Date.now();
}

/**
 * True if the user should receive Pocket Agent alerts right now.
 *
 * Rules:
 * 1. Tier must be paid (pro or essential). Free tier never gets
 *    proactive alerts (per the pricing matrix in CLAUDE.md).
 * 2. Status must be in the retry/active window OR the user must be
 *    in an active onboarding trial.
 * 3. Terminal statuses always exclude (defence in depth — the
 *    webhook should already have set tier=free).
 */
export function isPocketAgentEligible(p: EligibilityProfile): boolean {
  const tier = p.subscription_tier ?? 'free';
  if (tier === 'free') return false;

  const status = p.subscription_status ?? '';
  if (TERMINAL_STATUSES.has(status)) return false;

  // No stripe sub — only valid path is an active onboarding trial.
  if (!p.stripe_subscription_id) {
    return isOnboardingTrial(p);
  }

  return RETRY_STATUSES.has(status);
}

/**
 * Pro-only variant. Some alert streams (instant price-increase pushes,
 * dispute Watchdog alerts) are gated to Pro only per the pricing matrix.
 */
export function isProPocketAgentEligible(p: EligibilityProfile): boolean {
  if ((p.subscription_tier ?? 'free') !== 'pro') return false;
  return isPocketAgentEligible(p);
}
