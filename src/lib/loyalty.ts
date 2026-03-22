import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Points awarded per action
export const POINT_VALUES: Record<string, { points: number; description: string }> = {
  complaint_generated: { points: 10, description: 'Generated a complaint letter' },
  cancellation_email: { points: 5, description: 'Generated a cancellation email' },
  subscription_cancelled: { points: 15, description: 'Cancelled a subscription' },
  bank_connected: { points: 25, description: 'Connected a bank account' },
  bank_synced: { points: 5, description: 'Synced bank transactions' },
  deal_clicked: { points: 2, description: 'Explored a deal' },
  deal_switched: { points: 50, description: 'Switched to a better deal' },
  referral_signup: { points: 100, description: 'Referred a friend who signed up' },
  referral_paid: { points: 200, description: 'Referred a friend who subscribed' },
  profile_completed: { points: 10, description: 'Completed your profile' },
  first_scan: { points: 20, description: 'Completed first bank scan' },
};

// Tier thresholds based on membership duration
export const LOYALTY_TIERS = {
  bronze: { minMonths: 0, multiplier: 1, label: 'Bronze', color: '#cd7f32', perks: ['Standard features', 'Email support'] },
  silver: { minMonths: 6, multiplier: 1.05, label: 'Silver', color: '#c0c0c0', perks: ['Priority support', 'Monthly savings summary email'] },
  gold: { minMonths: 12, multiplier: 1.1, label: 'Gold', color: '#ffd700', perks: ['1 free Pro month per year', 'Partner discounts', 'Quarterly savings webinar'] },
  platinum: { minMonths: 24, multiplier: 1.15, label: 'Platinum', color: '#e5e4e2', perks: ['Dedicated account manager', 'Annual review call', 'Beta access', 'Top-tier partner discounts'] },
};

// Redemption options
export const REDEMPTION_OPTIONS = [
  { id: 'discount_5', points: 500, label: '£5 off next month', description: 'Applied as a Stripe coupon to your next invoice', value: 5 },
  { id: 'discount_10', points: 900, label: '£10 off next month', description: 'Applied as a Stripe coupon to your next invoice', value: 10 },
  { id: 'free_month', points: 1500, label: 'Free month of Essential', description: 'One month of Essential plan for free', value: 9.99 },
];

/**
 * Calculate loyalty tier based on membership duration.
 */
export function calculateTier(createdAt: string): keyof typeof LOYALTY_TIERS {
  const months = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (months >= 24) return 'platinum';
  if (months >= 12) return 'gold';
  if (months >= 6) return 'silver';
  return 'bronze';
}

/**
 * Award points to a user for an action.
 * Idempotent: won't double-award for the same action within 1 minute.
 */
export async function awardPoints(
  userId: string,
  eventType: string,
  metadata?: Record<string, unknown>
): Promise<{ awarded: boolean; points: number; newBalance: number }> {
  const config = POINT_VALUES[eventType];
  if (!config) return { awarded: false, points: 0, newBalance: 0 };

  const supabase = getAdmin();

  // Dedup: check if same event awarded in last minute
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  const { data: recent } = await supabase
    .from('point_events')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .gte('created_at', oneMinuteAgo)
    .maybeSingle();

  if (recent) return { awarded: false, points: 0, newBalance: 0 };

  // Get user's tier multiplier
  const { data: profile } = await supabase
    .from('profiles')
    .select('created_at')
    .eq('id', userId)
    .single();

  const tier = profile ? calculateTier(profile.created_at) : 'bronze';
  const multiplier = LOYALTY_TIERS[tier].multiplier;
  const points = Math.round(config.points * multiplier);

  // Record the event
  await supabase.from('point_events').insert({
    user_id: userId,
    event_type: eventType,
    points,
    description: config.description,
    metadata: metadata || null,
  });

  // Upsert user points balance
  const { data: existing } = await supabase
    .from('user_points')
    .select('balance, lifetime_earned')
    .eq('user_id', userId)
    .maybeSingle();

  const newBalance = (existing?.balance || 0) + points;
  const newLifetime = (existing?.lifetime_earned || 0) + points;

  await supabase.from('user_points').upsert({
    user_id: userId,
    balance: newBalance,
    lifetime_earned: newLifetime,
    loyalty_tier: tier,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return { awarded: true, points, newBalance };
}

/**
 * Get a user's loyalty status.
 */
export async function getLoyaltyStatus(userId: string): Promise<{
  balance: number;
  lifetime: number;
  tier: keyof typeof LOYALTY_TIERS;
  tierInfo: typeof LOYALTY_TIERS[keyof typeof LOYALTY_TIERS];
  recentEvents: Array<{ event_type: string; points: number; description: string; created_at: string }>;
}> {
  const supabase = getAdmin();

  const [pointsRes, eventsRes, profileRes] = await Promise.all([
    supabase.from('user_points').select('balance, lifetime_earned, loyalty_tier').eq('user_id', userId).maybeSingle(),
    supabase.from('point_events').select('event_type, points, description, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('created_at').eq('id', userId).single(),
  ]);

  const tier = profileRes.data ? calculateTier(profileRes.data.created_at) : 'bronze';

  return {
    balance: pointsRes.data?.balance || 0,
    lifetime: pointsRes.data?.lifetime_earned || 0,
    tier,
    tierInfo: LOYALTY_TIERS[tier],
    recentEvents: eventsRes.data || [],
  };
}
