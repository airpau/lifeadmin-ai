import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Points awarded per action
// trackable: true = we fire these automatically right now
// trackable: false = future feature, needs additional infrastructure
export const POINT_VALUES: Record<string, { points: number; description: string; trackable: boolean }> = {
  // AUTO-TRACKED - these fire when the user takes the action
  complaint_generated: { points: 10, description: 'Generated a complaint letter', trackable: true },
  cancellation_email: { points: 5, description: 'Generated a cancellation email', trackable: true },
  bank_connected: { points: 25, description: 'Connected a bank account', trackable: true },
  bank_synced: { points: 5, description: 'Synced bank transactions', trackable: true },
  deal_clicked: { points: 2, description: 'Explored a deal', trackable: true },
  first_scan: { points: 20, description: 'Completed first bank scan', trackable: true },

  // USER-CONFIRMED - user marks subscription as cancelled in tracker
  subscription_cancelled: { points: 15, description: 'Confirmed a cancellation', trackable: true },

  // BONUS FIRST-TIME EVENTS
  profile_completed: { points: 20, description: 'Completed your profile', trackable: true },
  letter_won: { points: 25, description: 'Complaint letter resulted in a win', trackable: true },
  email_connected: { points: 30, description: 'Connected your email inbox', trackable: true },
  opportunity_engaged: { points: 5, description: 'Engaged with opportunity scanner', trackable: true },
  money_hub_onboarded: { points: 15, description: 'Completed Money Hub onboarding', trackable: true },

  // STREAK BONUSES (awarded automatically by streak logic)
  streak_bonus_3: { points: 15, description: '3-month active streak bonus', trackable: true },
  streak_bonus_6: { points: 30, description: '6-month active streak bonus', trackable: true },
  streak_bonus_12: { points: 75, description: '12-month active streak bonus', trackable: true },

  // FUTURE - needs Awin postback endpoint (/api/deals/conversion)
  deal_switched: { points: 50, description: 'Switched to a better deal via Paybacker', trackable: false },

  // REFERRALS
  referral_signup: { points: 100, description: 'Referred a friend who signed up', trackable: true },
  referral_paid: { points: 200, description: 'Referred a friend who subscribed', trackable: true },
};

// Hybrid tier thresholds: requires BOTH time AND points
export const LOYALTY_TIERS = {
  bronze: { minMonths: 0, minPoints: 0, multiplier: 1, label: 'Bronze', color: '#cd7f32', perks: ['Standard features', 'Email support'] },
  silver: { minMonths: 3, minPoints: 500, multiplier: 1.05, label: 'Silver', color: '#c0c0c0', perks: ['Priority support', 'Monthly savings summary email'] },
  gold: { minMonths: 9, minPoints: 2000, multiplier: 1.1, label: 'Gold', color: '#ffd700', perks: ['1 free Pro month per year', 'Partner discounts', 'Gold badge'] },
  platinum: { minMonths: 18, minPoints: 5000, multiplier: 1.15, label: 'Platinum', color: '#e5e4e2', perks: ['Dedicated manager email', 'Annual review call', 'Beta access', 'Platinum badge'] },
};

// Redemption options
export const REDEMPTION_OPTIONS = [
  { id: 'discount_5', points: 500, label: '£5 off next invoice', description: 'Applied as a Stripe discount to your next invoice', value: 5, type: 'stripe_amount' as const },
  { id: 'discount_10', points: 900, label: '£10 off next invoice', description: 'Applied as a Stripe discount to your next invoice', value: 10, type: 'stripe_amount' as const },
  { id: 'free_month_essential', points: 1500, label: 'Free month of Essential', description: '100% off your next Essential invoice', value: 4.99, type: 'stripe_percent' as const },
  { id: 'free_month_pro', points: 3000, label: 'Free month of Pro', description: '100% off your next Pro invoice', value: 9.99, type: 'stripe_percent' as const },
  { id: 'charity_donation', points: 500, label: 'Donate £5 to Shelter', description: 'Paybacker donates £5 to Shelter on your behalf', value: 5, type: 'charity' as const },
];

// Badge definitions
export const BADGES: Array<{
  id: string;
  name: string;
  description: string;
  emoji: string;
  check: (ctx: BadgeContext) => boolean;
}> = [
  // Letter milestones
  { id: 'first_letter', name: 'Bill Fighter', description: 'Generate your first complaint letter', emoji: '🥊',
    check: (ctx) => ctx.eventType === 'complaint_generated' && ctx.eventCount.complaint_generated >= 1 },
  { id: 'five_letters', name: 'Serial Complainer', description: 'Generate 5 complaint letters', emoji: '⚡',
    check: (ctx) => ctx.eventType === 'complaint_generated' && ctx.eventCount.complaint_generated >= 5 },
  { id: 'twenty_letters', name: 'Consumer Champion', description: 'Generate 20 complaint letters', emoji: '🏆',
    check: (ctx) => ctx.eventType === 'complaint_generated' && ctx.eventCount.complaint_generated >= 20 },

  // Cancellation milestones
  { id: 'first_cancellation', name: 'Subscription Slayer', description: 'Cancel your first subscription', emoji: '✂️',
    check: (ctx) => ctx.eventType === 'cancellation_email' && ctx.eventCount.cancellation_email >= 1 },
  { id: 'ten_cancellations', name: 'Cut The Cord', description: 'Cancel 10 subscriptions', emoji: '🔥',
    check: (ctx) => ctx.eventType === 'cancellation_email' && ctx.eventCount.cancellation_email >= 10 },

  // Connection milestones
  { id: 'bank_connected', name: 'Money Detective', description: 'Connect your first bank account', emoji: '🔍',
    check: (ctx) => ctx.eventType === 'bank_connected' },
  { id: 'email_connected', name: 'Inbox Raider', description: 'Connect your email inbox', emoji: '📧',
    check: (ctx) => ctx.eventType === 'email_connected' },

  // Referral milestones
  { id: 'first_referral', name: 'Word Spreader', description: 'Refer your first friend', emoji: '📣',
    check: (ctx) => ctx.eventType === 'referral_signup' && ctx.eventCount.referral_signup >= 1 },
  { id: 'five_referrals', name: 'Paybacker Ambassador', description: 'Refer 5 friends', emoji: '🌟',
    check: (ctx) => ctx.eventType === 'referral_signup' && ctx.eventCount.referral_signup >= 5 },

  // Streak milestones
  { id: 'streak_3', name: 'On A Roll', description: '3-month active streak', emoji: '🎯',
    check: (ctx) => ctx.currentStreak >= 3 },
  { id: 'streak_6', name: 'Half Year Hero', description: '6-month active streak', emoji: '💪',
    check: (ctx) => ctx.currentStreak >= 6 },
  { id: 'streak_12', name: 'Paybacker Legend', description: '12-month active streak', emoji: '👑',
    check: (ctx) => ctx.currentStreak >= 12 },

  // Tier milestones
  { id: 'silver_tier', name: 'Silver Status', description: 'Reach Silver tier', emoji: '🥈',
    check: (ctx) => ['silver', 'gold', 'platinum'].includes(ctx.newTier) },
  { id: 'gold_tier', name: 'Gold Status', description: 'Reach Gold tier', emoji: '🥇',
    check: (ctx) => ['gold', 'platinum'].includes(ctx.newTier) },
  { id: 'platinum_tier', name: 'Platinum Elite', description: 'Reach Platinum tier', emoji: '💎',
    check: (ctx) => ctx.newTier === 'platinum' },

  // First win
  { id: 'first_claim', name: 'Money Back', description: 'Claim your first compensation', emoji: '💰',
    check: (ctx) => ctx.eventType === 'letter_won' },

  // Points milestones
  { id: 'points_500', name: 'High Earner', description: 'Earn 500 lifetime points', emoji: '📈',
    check: (ctx) => ctx.lifetimePoints >= 500 },
  { id: 'points_2000', name: 'Power User', description: 'Earn 2,000 lifetime points', emoji: '⭐',
    check: (ctx) => ctx.lifetimePoints >= 2000 },
  { id: 'points_5000', name: 'Elite Member', description: 'Earn 5,000 lifetime points', emoji: '🚀',
    check: (ctx) => ctx.lifetimePoints >= 5000 },
];

interface BadgeContext {
  eventType: string;
  eventCount: Record<string, number>;
  currentStreak: number;
  newTier: string;
  lifetimePoints: number;
}

/**
 * Calculate loyalty tier based on membership duration AND lifetime points (hybrid).
 */
export function calculateTier(createdAt: string, lifetimePoints: number = 0): keyof typeof LOYALTY_TIERS {
  const months = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
  if (months >= 18 && lifetimePoints >= 5000) return 'platinum';
  if (months >= 9 && lifetimePoints >= 2000) return 'gold';
  if (months >= 3 && lifetimePoints >= 500) return 'silver';
  return 'bronze';
}

/**
 * Get the current month as YYYY-MM string.
 */
function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Check if two YYYY-MM strings are consecutive months.
 */
function isConsecutiveMonth(prev: string, current: string): boolean {
  if (!prev) return false;
  const [py, pm] = prev.split('-').map(Number);
  const [cy, cm] = current.split('-').map(Number);
  // Next month
  if (cy === py && cm === pm + 1) return true;
  // January after December
  if (cy === py + 1 && cm === 1 && pm === 12) return true;
  return false;
}

/**
 * Process streak logic. Returns updated streak data and any bonus to award.
 */
function processStreak(
  lastActiveMonth: string | null,
  currentStreak: number,
  longestStreak: number,
  streakBonusClaimedMonth: string | null,
): {
  newStreak: number;
  newLongest: number;
  newLastActiveMonth: string;
  streakBonus: string | null; // event_type of bonus to award, or null
} {
  const currentMonth = getCurrentMonth();

  // Already active this month
  if (lastActiveMonth === currentMonth) {
    return {
      newStreak: currentStreak,
      newLongest: longestStreak,
      newLastActiveMonth: currentMonth,
      streakBonus: null,
    };
  }

  let newStreak: number;
  if (isConsecutiveMonth(lastActiveMonth || '', currentMonth)) {
    newStreak = currentStreak + 1;
  } else if (!lastActiveMonth) {
    newStreak = 1;
  } else {
    // Gap - reset
    newStreak = 1;
  }

  const newLongest = Math.max(longestStreak, newStreak);

  // Determine if a streak bonus should fire (one-time at each threshold)
  let streakBonus: string | null = null;
  if (streakBonusClaimedMonth !== currentMonth) {
    if (newStreak === 12) streakBonus = 'streak_bonus_12';
    else if (newStreak === 6) streakBonus = 'streak_bonus_6';
    else if (newStreak === 3) streakBonus = 'streak_bonus_3';
  }

  return {
    newStreak,
    newLongest,
    newLastActiveMonth: currentMonth,
    streakBonus,
  };
}

/**
 * Award badges that the user has newly qualified for.
 */
async function checkAndAwardBadges(
  userId: string,
  context: BadgeContext,
  supabase: ReturnType<typeof getAdmin>,
): Promise<string[]> {
  // Get existing badges
  const { data: existing } = await supabase
    .from('user_badges')
    .select('badge_id')
    .eq('user_id', userId);

  const existingIds = new Set((existing || []).map(b => b.badge_id));
  const newBadges: string[] = [];

  for (const badge of BADGES) {
    if (existingIds.has(badge.id)) continue;
    if (badge.check(context)) {
      const { error: badgeErr } = await supabase.from('user_badges').upsert({
        user_id: userId,
        badge_id: badge.id,
        badge_name: badge.name,
        badge_description: badge.description,
        badge_emoji: badge.emoji,
      }, { onConflict: 'user_id,badge_id', ignoreDuplicates: true });
      newBadges.push(badge.name);
    }
  }

  return newBadges;
}

/**
 * Send tier upgrade email via Resend with tier-specific content.
 * Also triggers Gold tier reward (free Pro month) when applicable.
 */
async function sendTierUpgradeEmail(userId: string, newTier: keyof typeof LOYALTY_TIERS): Promise<void> {
  try {
    const supabase = getAdmin();
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, first_name')
      .eq('id', userId)
      .single();

    if (!profile?.email) return;

    const tierInfo = LOYALTY_TIERS[newTier];
    const name = profile.first_name || profile.full_name?.split(' ')[0] || 'there';

    // Tier-specific subjects and extra content
    const tierEmails: Record<string, { subject: string; emoji: string; extra: string }> = {
      silver: {
        subject: 'Welcome to Silver - you have unlocked priority support',
        emoji: '🥈',
        extra: '<p style="color:#94a3b8;font-size:14px;margin-top:20px;">Keep earning points to reach <strong style="color:#ffd700;">Gold</strong> (2,000 lifetime points + 9 months). Gold members get a free Pro month every year.</p>',
      },
      gold: {
        subject: 'You have reached Gold - your free Pro month is ready',
        emoji: '🥇',
        extra: '<div style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:12px;padding:16px;margin:20px 0;"><p style="color:#f59e0b;font-weight:700;margin:0;">Your free Pro month has been applied automatically.</p><p style="color:#94a3b8;font-size:13px;margin:8px 0 0;">No action needed - it will appear on your next invoice. Keep going for <strong style="color:#e5e4e2;">Platinum</strong> (5,000 points + 18 months).</p></div>',
      },
      platinum: {
        subject: 'Welcome to Platinum - the highest tier at Paybacker',
        emoji: '💎',
        extra: '<div style="background:#e5e4e222;border:1px solid #e5e4e244;border-radius:12px;padding:16px;margin:20px 0;"><p style="color:#e5e4e2;font-weight:700;margin:0;">You are in the top tier. Thank you for your loyalty.</p><p style="color:#94a3b8;font-size:13px;margin:8px 0 0;">A member of our team will be in touch to introduce your dedicated account manager and schedule your annual review.</p></div>',
      },
    };

    const emailConfig = tierEmails[newTier] || { subject: `You have reached ${tierInfo.label} status`, emoji: '🏆', extra: '' };

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'hello@paybacker.co.uk',
      to: profile.email,
      subject: emailConfig.subject,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#0f172a;padding:20px 32px;border-bottom:1px solid #1e293b;">
    <span style="font-size:22px;font-weight:800;color:#fff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </div>
  <div style="background:linear-gradient(180deg,#0f172a 0%,#1a1f35 100%);padding:32px;text-align:center;">
    <div style="font-size:48px;margin-bottom:12px;">${emailConfig.emoji}</div>
    <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">Congratulations, ${name}!</h1>
    <p style="color:${tierInfo.color};font-size:18px;font-weight:700;margin:0 0 16px;">You have reached ${tierInfo.label} status</p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">Your new perks:</p>
    <div style="text-align:left;max-width:300px;margin:16px auto;">
      ${tierInfo.perks.map(p => `<div style="color:#e2e8f0;font-size:14px;margin-bottom:8px;">- ${p}</div>`).join('')}
    </div>
    <p style="color:#94a3b8;font-size:14px;">You now earn points at ${tierInfo.multiplier}x rate.</p>
    ${emailConfig.extra}
    <a href="https://paybacker.co.uk/dashboard/rewards" style="display:inline-block;margin-top:20px;background:#f59e0b;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Your Rewards</a>
  </div>
  <div style="background:#0f172a;padding:20px 32px;border-top:1px solid #1e293b;">
    <div style="color:#475569;font-size:11px;">Paybacker LTD - paybacker.co.uk</div>
  </div>
</div></body></html>`,
    });

    // Gold tier: apply free Pro month via Stripe
    if (newTier === 'gold') {
      applyGoldTierReward(userId).catch(() => {});
    }
  } catch (e) {
    console.error('[loyalty] Tier upgrade email failed:', e);
  }
}

/**
 * Check if user's points have expired (no points earned in 365 days).
 * Returns true if points were expired.
 */
export async function checkPointsExpiry(userId: string): Promise<boolean> {
  const supabase = getAdmin();

  const { data: userPoints } = await supabase
    .from('user_points')
    .select('balance, last_points_earned_at, expiry_warning_sent')
    .eq('user_id', userId)
    .maybeSingle();

  if (!userPoints || !userPoints.last_points_earned_at || userPoints.balance <= 0) return false;

  const lastEarned = new Date(userPoints.last_points_earned_at).getTime();
  const daysSinceLastPoints = (Date.now() - lastEarned) / (1000 * 60 * 60 * 24);

  // 30-day warning
  if (daysSinceLastPoints >= 335 && daysSinceLastPoints < 365 && !userPoints.expiry_warning_sent) {
    // Send warning email
    try {
      const { data: profile } = await supabase.from('profiles').select('email, first_name').eq('id', userId).single();
      if (profile?.email) {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: process.env.FROM_EMAIL || 'hello@paybacker.co.uk',
          to: profile.email,
          subject: 'Your Paybacker points are about to expire',
          html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#0f172a;padding:20px 32px;border-bottom:1px solid #1e293b;">
    <span style="font-size:22px;font-weight:800;color:#fff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </div>
  <div style="background:linear-gradient(180deg,#0f172a 0%,#1a1f35 100%);padding:32px;">
    <h1 style="color:#fff;font-size:22px;margin:0 0 12px;">Your points expire in 30 days</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.7;">Hi ${profile.first_name || 'there'}, you have <strong style="color:#f59e0b;">${userPoints.balance} points</strong> that will expire if you do not earn any new points in the next 30 days.</p>
    <p style="color:#94a3b8;font-size:14px;">Earn points by generating a complaint letter, connecting your bank, or exploring deals.</p>
    <a href="https://paybacker.co.uk/dashboard/rewards" style="display:inline-block;margin-top:16px;background:#f59e0b;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">Keep Your Points</a>
  </div>
  <div style="background:#0f172a;padding:20px 32px;border-top:1px solid #1e293b;">
    <div style="color:#475569;font-size:11px;">Paybacker LTD - paybacker.co.uk</div>
  </div>
</div></body></html>`,
        });
      }
    } catch {}

    await supabase.from('user_points').update({ expiry_warning_sent: true }).eq('user_id', userId);
    return false;
  }

  // Expire points after 365 days
  if (daysSinceLastPoints >= 365) {
    await supabase.from('user_points').update({
      balance: 0,
      expiry_warning_sent: false,
    }).eq('user_id', userId);
    return true;
  }

  return false;
}

/**
 * Award points to a user for an action.
 * Idempotent: won't double-award for the same action within 1 minute.
 *
 * Extended with: hybrid tier calculation, streak tracking, badge awards,
 * tier upgrade emails, and streak bonuses.
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

  // Get user's profile and current points
  const [profileRes, pointsRes] = await Promise.all([
    supabase.from('profiles').select('created_at').eq('id', userId).single(),
    supabase.from('user_points').select('balance, lifetime_earned, loyalty_tier, current_streak, longest_streak, last_active_month, streak_bonus_claimed_month').eq('user_id', userId).maybeSingle(),
  ]);

  const currentLifetime = pointsRes.data?.lifetime_earned || 0;
  const currentBalance = pointsRes.data?.balance || 0;
  const previousTier = (pointsRes.data?.loyalty_tier || 'bronze') as keyof typeof LOYALTY_TIERS;

  // Calculate tier using hybrid system (time + points)
  const tier = profileRes.data ? calculateTier(profileRes.data.created_at, currentLifetime) : 'bronze';
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

  // Process streak
  const streakResult = processStreak(
    pointsRes.data?.last_active_month || null,
    pointsRes.data?.current_streak || 0,
    pointsRes.data?.longest_streak || 0,
    pointsRes.data?.streak_bonus_claimed_month || null,
  );

  const newLifetime = currentLifetime + points;
  const newBalance = currentBalance + points;

  // Recalculate tier with new lifetime points
  const newTier = profileRes.data ? calculateTier(profileRes.data.created_at, newLifetime) : 'bronze';

  // Upsert user points balance with streak data
  await supabase.from('user_points').upsert({
    user_id: userId,
    balance: newBalance,
    lifetime_earned: newLifetime,
    loyalty_tier: newTier,
    current_streak: streakResult.newStreak,
    longest_streak: streakResult.newLongest,
    last_active_month: streakResult.newLastActiveMonth,
    streak_bonus_claimed_month: streakResult.streakBonus ? getCurrentMonth() : (pointsRes.data?.streak_bonus_claimed_month || null),
    last_points_earned_at: new Date().toISOString(),
    expiry_warning_sent: false, // Reset warning since they just earned points
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  // Check for tier upgrade
  if (newTier !== previousTier) {
    const tierOrder = ['bronze', 'silver', 'gold', 'platinum'];
    if (tierOrder.indexOf(newTier) > tierOrder.indexOf(previousTier)) {
      // Tier upgraded - send email (non-blocking)
      sendTierUpgradeEmail(userId, newTier).catch(() => {});
    }
  }

  // Get event counts for badge checking
  const { data: eventCounts } = await supabase
    .from('point_events')
    .select('event_type')
    .eq('user_id', userId);

  const countMap: Record<string, number> = {};
  for (const e of eventCounts || []) {
    countMap[e.event_type] = (countMap[e.event_type] || 0) + 1;
  }

  // Check and award badges
  await checkAndAwardBadges(userId, {
    eventType,
    eventCount: countMap,
    currentStreak: streakResult.newStreak,
    newTier,
    lifetimePoints: newLifetime,
  }, supabase);

  // Award streak bonus if applicable (recursive but with different event type so no infinite loop)
  if (streakResult.streakBonus && !eventType.startsWith('streak_bonus')) {
    await awardPoints(userId, streakResult.streakBonus, { triggered_by: eventType });
  }

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
  currentStreak: number;
  longestStreak: number;
  badges: Array<{ badge_id: string; badge_name: string; badge_description: string; badge_emoji: string; earned_at: string }>;
  recentEvents: Array<{ event_type: string; points: number; description: string; created_at: string }>;
}> {
  const supabase = getAdmin();

  const [pointsRes, eventsRes, profileRes, badgesRes] = await Promise.all([
    supabase.from('user_points').select('balance, lifetime_earned, loyalty_tier, current_streak, longest_streak').eq('user_id', userId).maybeSingle(),
    supabase.from('point_events').select('event_type, points, description, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('created_at').eq('id', userId).single(),
    supabase.from('user_badges').select('badge_id, badge_name, badge_description, badge_emoji, earned_at').eq('user_id', userId).order('earned_at', { ascending: false }),
  ]);

  const lifetimePoints = pointsRes.data?.lifetime_earned || 0;
  const tier = profileRes.data ? calculateTier(profileRes.data.created_at, lifetimePoints) : 'bronze';

  return {
    balance: pointsRes.data?.balance || 0,
    lifetime: pointsRes.data?.lifetime_earned || 0,
    tier,
    tierInfo: LOYALTY_TIERS[tier],
    currentStreak: pointsRes.data?.current_streak || 0,
    longestStreak: pointsRes.data?.longest_streak || 0,
    badges: badgesRes.data || [],
    recentEvents: eventsRes.data || [],
  };
}

/**
 * Redeem points for a reward.
 * Creates Stripe coupons for discount/free month options.
 * Uses the existing Stripe client from src/lib/stripe.ts.
 */
export async function redeemPoints(
  userId: string,
  redemptionId: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  const option = REDEMPTION_OPTIONS.find(o => o.id === redemptionId);
  if (!option) return { success: false, error: 'Invalid redemption option' };

  const supabase = getAdmin();

  // Check balance
  const { data: userPoints } = await supabase
    .from('user_points')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();

  const currentBalance = userPoints?.balance || 0;
  if (currentBalance < option.points) {
    return { success: false, error: `Not enough points. You have ${currentBalance}, need ${option.points}.` };
  }

  // Get user's Stripe customer ID and email
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, email, first_name, full_name')
    .eq('id', userId)
    .single();

  // Handle charity donation (no Stripe needed)
  if (option.type === 'charity') {
    // Deduct points
    await supabase.from('user_points').update({
      balance: currentBalance - option.points,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    // Log event
    await supabase.from('point_events').insert({
      user_id: userId,
      event_type: 'points_redeemed',
      points: -option.points,
      description: `Donated £${option.value} to Shelter via loyalty points`,
      metadata: { redemption_id: redemptionId, charity: 'Shelter' },
    });

    // Send thank you email
    await sendRedemptionEmail(userId, profile, `You have donated £${option.value} to Shelter`, 'Thank you for your generosity. Paybacker will make this donation on your behalf as part of our monthly charity batch. Your kindness makes a difference.');

    return { success: true, message: `£${option.value} donation to Shelter pledged. Thank you!` };
  }

  // Stripe redemptions require a customer ID
  if (!profile?.stripe_customer_id) {
    return { success: false, error: 'No active subscription found. You need a paid plan to redeem discounts.' };
  }

  try {
    const { getStripeClient } = await import('@/lib/stripe');
    const stripe = getStripeClient();

    const couponId = `PAYBACKER-REDEEM-${userId.substring(0, 8)}-${Date.now()}`;
    const redeemBy = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days

    let coupon;

    if (option.type === 'stripe_amount') {
      // Fixed amount off
      coupon = await stripe.coupons.create({
        id: couponId,
        amount_off: Math.round(option.value * 100), // pence
        currency: 'gbp',
        duration: 'once',
        max_redemptions: 1,
        redeem_by: redeemBy,
        name: option.label,
      });
    } else if (option.type === 'stripe_percent') {
      // 100% off one invoice
      coupon = await stripe.coupons.create({
        id: couponId,
        percent_off: 100,
        duration: 'once',
        max_redemptions: 1,
        redeem_by: redeemBy,
        name: option.label,
      });
    }

    if (!coupon) {
      return { success: false, error: 'Failed to create discount' };
    }

    // Apply to customer
    await stripe.customers.update(profile.stripe_customer_id, {
      coupon: coupon.id,
    });

    // Deduct points
    await supabase.from('user_points').update({
      balance: currentBalance - option.points,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    // Log event
    await supabase.from('point_events').insert({
      user_id: userId,
      event_type: 'points_redeemed',
      points: -option.points,
      description: `Redeemed: ${option.label}`,
      metadata: { redemption_id: redemptionId, coupon_id: couponId, value: option.value },
    });

    // Send confirmation email
    await sendRedemptionEmail(userId, profile, option.label, 'Your discount has been applied and will appear on your next invoice. No action needed.');

    return { success: true, message: `${option.label} applied to your account!` };
  } catch (err: any) {
    console.error('[loyalty] Stripe redemption failed:', err.message);
    return { success: false, error: `Redemption failed: ${err.message}` };
  }
}

/**
 * Apply Gold tier reward: one free Pro month via Stripe coupon.
 */
export async function applyGoldTierReward(userId: string): Promise<void> {
  const supabase = getAdmin();

  // Check if already awarded this year
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from('point_events')
    .select('id')
    .eq('user_id', userId)
    .eq('event_type', 'tier_reward_gold')
    .gte('created_at', yearAgo)
    .maybeSingle();

  if (existing) return; // Already awarded this year

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_customer_id) return;

  try {
    const { getStripeClient } = await import('@/lib/stripe');
    const stripe = getStripeClient();

    const couponId = `PAYBACKER-GOLD-${userId.substring(0, 8)}-${Date.now()}`;

    const coupon = await stripe.coupons.create({
      id: couponId,
      percent_off: 100,
      duration: 'once',
      max_redemptions: 1,
      redeem_by: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60),
      name: 'Gold tier reward: 1 free month',
    });

    await stripe.customers.update(profile.stripe_customer_id, {
      coupon: coupon.id,
    });

    await supabase.from('point_events').insert({
      user_id: userId,
      event_type: 'tier_reward_gold',
      points: 0,
      description: 'Gold tier reward: free Pro month applied',
      metadata: { coupon_id: couponId },
    });

    console.log(`[loyalty] Gold tier reward applied for ${userId}`);
  } catch (err: any) {
    console.error('[loyalty] Gold tier reward failed:', err.message);
  }
}

/**
 * Send redemption/reward confirmation email via Resend.
 */
async function sendRedemptionEmail(
  userId: string,
  profile: { email?: string; first_name?: string; full_name?: string } | null,
  rewardTitle: string,
  body: string,
): Promise<void> {
  try {
    const email = profile?.email;
    if (!email) return;

    const name = profile?.first_name || profile?.full_name?.split(' ')[0] || 'there';

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'hello@paybacker.co.uk',
      to: email,
      subject: `Reward redeemed: ${rewardTitle}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#0f172a;padding:20px 32px;border-bottom:1px solid #1e293b;">
    <span style="font-size:22px;font-weight:800;color:#fff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </div>
  <div style="background:linear-gradient(180deg,#0f172a 0%,#1a1f35 100%);padding:32px;">
    <div style="font-size:36px;text-align:center;margin-bottom:12px;">🎁</div>
    <h1 style="color:#fff;font-size:22px;margin:0 0 12px;text-align:center;">${rewardTitle}</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.7;text-align:center;">Hi ${name}, ${body}</p>
    <div style="text-align:center;margin-top:20px;">
      <a href="https://paybacker.co.uk/dashboard/rewards" style="display:inline-block;background:#f59e0b;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Your Rewards</a>
    </div>
  </div>
  <div style="background:#0f172a;padding:20px 32px;border-top:1px solid #1e293b;">
    <div style="color:#475569;font-size:11px;">Paybacker LTD - paybacker.co.uk</div>
  </div>
</div></body></html>`,
    });
  } catch (e) {
    console.error('[loyalty] Redemption email failed:', e);
  }
}
