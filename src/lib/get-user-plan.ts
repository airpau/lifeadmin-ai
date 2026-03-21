import { createClient } from '@supabase/supabase-js';

export type PlanTier = 'free' | 'essential' | 'pro';

export interface UserPlan {
  tier: PlanTier;
  status: string;
  isActive: boolean; // true only if paid AND active/trialing
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Single source of truth for a user's effective plan.
 * Applies the same Stripe verification logic as plan-limits:
 * if the DB tier is paid but there's no active Stripe subscription,
 * the effective tier is downgraded to 'free'.
 */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const admin = getAdmin();

  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status, stripe_subscription_id')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier as PlanTier) ?? 'free';
  const status = profile?.subscription_status ?? 'free';

  const isPaid = tier !== 'free';
  const hasActiveStripe = profile?.stripe_subscription_id &&
    ['active', 'trialing'].includes(status);

  if (isPaid && !hasActiveStripe) {
    console.warn(`[get-user-plan] User ${userId} has tier=${tier} but no active Stripe subscription. Treating as free.`);
    return { tier: 'free', status, isActive: false };
  }

  const isActive = isPaid && !!hasActiveStripe;

  return { tier, status, isActive };
}
