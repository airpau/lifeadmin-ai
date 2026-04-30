import { createClient } from '@supabase/supabase-js';

export type PlanTier = 'free' | 'essential' | 'pro';

export interface UserPlan {
  tier: PlanTier;
  status: string;
  isActive: boolean;
  isTrial: boolean;
  isPastDue: boolean;
  trialDaysLeft: number | null;
}

function getAdmin() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

// Statuses that Stripe (or our webhook) write when the subscription has
// actually ended. Anything outside this set — including `past_due`,
// `incomplete`, `unpaid` — is a retry state, not a termination, and
// must NOT demote the stored tier. Per CLAUDE.md: demotion is
// webhook-driven only (customer.subscription.deleted → 'canceled').
const TERMINATED_STATUSES = new Set(['canceled', 'cancelled', 'expired', 'incomplete_expired']);

/**
 * Single source of truth for a user's effective plan tier.
 *
 * Rule (matches CLAUDE.md + getEffectiveTier in plan-limits.ts): the
 * stored `profile.subscription_tier` is authoritative. We only demote
 * when the status column is in TERMINATED_STATUSES (written by the
 * Stripe webhook). Transitional states like past_due keep the user on
 * their paid tier; they just get an `isPastDue` flag so the UI can
 * surface a "payment retrying" banner instead of silently downgrading.
 *
 * Onboarding trials upgrade the user to Pro for the trial window even
 * if the stored tier is Free.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const admin = getAdmin();

  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at, founding_member')
    .eq('id', userId)
    .single();

  const storedTier = (profile?.subscription_tier as PlanTier) ?? 'free';
  const status = profile?.subscription_status ?? 'free';
  const isPastDue = status === 'past_due' || status === 'unpaid' || status === 'incomplete';

  // Onboarding trial override — grant Pro while the trial window is open.
  const trialEnd = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const now = new Date();
  const onboardingTrialActive = !!trialEnd
    && trialEnd > now
    && !profile?.trial_converted_at
    && !profile?.trial_expired_at;

  if (onboardingTrialActive) {
    const daysLeft = Math.ceil((trialEnd!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { tier: 'pro', status: 'trialing', isActive: true, isTrial: true, isPastDue: false, trialDaysLeft: daysLeft };
  }

  // Explicit termination → demote. This is the only path that can flip a
  // paid user to Free; everything else trusts the stored tier.
  if (TERMINATED_STATUSES.has(status)) {
    return { tier: 'free', status, isActive: false, isTrial: false, isPastDue: false, trialDaysLeft: null };
  }

  const isTrial = status === 'trialing';
  return {
    tier: storedTier,
    status,
    isActive: storedTier !== 'free',
    isTrial,
    isPastDue,
    trialDaysLeft: null,
  };
}
