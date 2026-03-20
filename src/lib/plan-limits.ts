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
    scanRunsPerMonth: 1,
    features: ['complaints', 'basic_scanner'],
  },
  essential: {
    complaintsPerMonth: null,
    scanRunsPerMonth: null,
    features: ['complaints', 'scanner', 'email_scanner', 'subscriptions'],
  },
  pro: {
    complaintsPerMonth: null,
    scanRunsPerMonth: null,
    features: ['complaints', 'scanner', 'email_scanner', 'subscriptions', 'open_banking'],
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

  // Fetch user's current tier
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();

  const tier = (profile?.subscription_tier as PlanTier) ?? 'free';
  const limits = PLAN_LIMITS[tier];

  const limitKey = action === 'complaint_generated'
    ? 'complaintsPerMonth'
    : 'scanRunsPerMonth';
  const limit = limits[limitKey];

  // Unlimited — no check needed
  if (limit === null) {
    return { allowed: true, used: 0, limit: null, tier, upgradeRequired: false };
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

  return { allowed, used, limit, tier, upgradeRequired: !allowed };
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
