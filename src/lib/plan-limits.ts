import { createClient } from '@supabase/supabase-js';

export type PlanTier = 'free' | 'essential' | 'pro';

export interface PlanLimits {
  complaintsPerMonth: number | null; // null = unlimited
  scanRunsPerMonth: number | null;
  features: string[];
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    complaintsPerMonth: 3,
    scanRunsPerMonth: 1, // one-time bank scan, email scan, opportunity scan
    features: ['complaints', 'basic_scanner', 'one_time_email_scan', 'one_time_opportunity_scan'],
  },
  essential: {
    complaintsPerMonth: null,
    scanRunsPerMonth: 4, // monthly re-scans (bank daily auto, email/opportunity monthly)
    features: ['complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions', 'cancellation_emails', 'renewal_reminders', 'full_spending'],
  },
  pro: {
    complaintsPerMonth: null,
    scanRunsPerMonth: null, // unlimited everything
    features: ['complaints', 'scanner', 'email_scanner', 'opportunity_scanner', 'subscriptions', 'cancellation_emails', 'renewal_reminders', 'full_spending', 'open_banking', 'unlimited_banks', 'transaction_analysis', 'priority_support', 'pocket_agent'],
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
    .select('subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier as PlanTier) ?? 'free';

  // Verify paid tier has an active Stripe subscription or founding member trial
  const isPaid = tier !== 'free';
  const hasActiveStripe = profile?.stripe_subscription_id &&
    ['active', 'trialing'].includes(profile?.subscription_status ?? '');

  // Founding member trial: tier != free, status = trialing, no Stripe, valid trial_ends_at
  const isFoundingTrial = isPaid && !profile?.stripe_subscription_id &&
    profile?.subscription_status === 'trialing' &&
    profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();

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
