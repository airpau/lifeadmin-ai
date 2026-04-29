import { createClient } from '@supabase/supabase-js';

export type PlanTier = 'free' | 'essential' | 'pro';

export interface UserPlan {
  tier: PlanTier;
  status: string;
  isActive: boolean;
  isTrial: boolean;
  trialDaysLeft: number | null;
}

function getAdmin() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

/**
 * Single source of truth for a user's effective plan.
 * Handles: Stripe subscribers, founding member trials, and free users.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const admin = getAdmin();

  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, founding_member')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier as PlanTier) ?? 'free';
  const status = profile?.subscription_status ?? 'free';
  const hasStripe = !!profile?.stripe_subscription_id;

  // Stripe subscriber — use their tier directly
  if (hasStripe && ['active', 'trialing'].includes(status)) {
    return { tier, status, isActive: true, isTrial: status === 'trialing', trialDaysLeft: null };
  }

  // Founding member trial (no Stripe, but tier=pro/essential + trialing)
  if (tier !== 'free' && status === 'trialing' && !hasStripe) {
    const trialEnd = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
    const now = new Date();

    if (trialEnd && trialEnd > now) {
      // Active trial
      const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { tier, status: 'trialing', isActive: true, isTrial: true, trialDaysLeft: daysLeft };
    }

    // Trial expired — treat as free
    return { tier: 'free', status: 'expired', isActive: false, isTrial: false, trialDaysLeft: 0 };
  }

  // Manually granted active status (lifetime or admin granted)
  if (tier !== 'free' && status === 'active' && !hasStripe) {
    return { tier, status, isActive: true, isTrial: false, trialDaysLeft: null };
  }

  // Paid tier but no active Stripe, not manually active, and not trialing — downgrade
  if (tier !== 'free' && !hasStripe) {
    return { tier: 'free', status, isActive: false, isTrial: false, trialDaysLeft: null };
  }

  return { tier, status, isActive: tier !== 'free', isTrial: false, trialDaysLeft: null };
}
