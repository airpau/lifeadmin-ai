import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Global email rate limiter.
 *
 * Problem: 11 independent cron jobs each send emails without knowing about
 * each other. A user can receive 9+ emails in a single morning.
 *
 * Solution: Every cron checks this BEFORE sending. We track sends in the
 * tasks table (which all crons already write to) and enforce a global cap.
 *
 * Rules:
 * - Max 1 general marketing email per user per day
 * - Transactional emails (welcome, password reset, ticket reply) bypass the limit
 * - Onboarding sequence gets 1 reserved slot per day (so it's not blocked by deals)
 */

const MAX_MARKETING_EMAILS_PER_DAY = 1;

/**
 * The onboarding sequence is counted against its OWN daily allowance rather
 * than the shared marketing slot.
 *
 * Without this, the reserved slot described above did not actually exist: the
 * 8am crons (daily digest, renewal reminders, contract expiry) consume the
 * single shared slot, and /api/cron/onboarding-emails runs at 10am on Tue/Fri
 * and finds the user already blocked. Because that cron stops at day 14 and
 * only runs twice a week, a blocked send is a permanently LOST onboarding
 * email, not a delayed one — new users are exactly the cohort we can least
 * afford to drop.
 *
 * Net effect per user per day: at most 1 general marketing email plus at most
 * 1 onboarding email, and onboarding only applies during the first 14 days.
 */
const ONBOARDING_EMAIL_TYPE = 'onboarding_email';
const MAX_ONBOARDING_EMAILS_PER_DAY = 1;

// These task types count towards the daily limit
const MARKETING_EMAIL_TYPES = [
  'deal_alert_email',
  'targeted_deal_email',
  'price_increase_alert',
  'daily_digest',
  'renewal_reminder',
  'churn_reengagement',
  'churn_inactive_7d',
  'churn_inactive_14d',
  'churn_pre_renewal',
  'founding_reminder',
  'weekly_money_digest',
  'onboarding_email',
  // Contract and overcharge alerts are marketing-adjacent — they count toward
  // the daily cap so users can't receive both a deal email AND a contract alert
  'contract_expiry_alert',
  'contract_end_alert',
  'overcharge_alert',
];

// The types that compete for the single shared marketing slot. Onboarding is
// excluded because it draws on its own reserved allowance above.
const GENERAL_MARKETING_EMAIL_TYPES = MARKETING_EMAIL_TYPES.filter(
  (t) => t !== ONBOARDING_EMAIL_TYPE
);

// These are transactional and bypass the limit
const TRANSACTIONAL_TYPES = [
  'welcome_email',
  'ticket_reply',
  'password_reset',
  'dispute_reminder_email',
];

/**
 * Check if we can send a marketing email to this user today.
 * Returns { allowed: boolean, sent_today: number, reason?: string }
 */
export async function canSendEmail(
  supabase: SupabaseClient,
  userId: string,
  emailType: string
): Promise<{ allowed: boolean; sent_today: number; reason?: string }> {
  // Transactional emails always go through
  if (TRANSACTIONAL_TYPES.includes(emailType)) {
    return { allowed: true, sent_today: 0 };
  }

  // Onboarding draws on its own reserved allowance; everything else competes
  // for the shared marketing slot.
  const isOnboarding = emailType === ONBOARDING_EMAIL_TYPE;
  const countedTypes = isOnboarding ? [ONBOARDING_EMAIL_TYPE] : GENERAL_MARKETING_EMAIL_TYPES;
  const limit = isOnboarding ? MAX_ONBOARDING_EMAILS_PER_DAY : MAX_MARKETING_EMAILS_PER_DAY;

  // Count emails already sent to this user today from that allowance
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('type', countedTypes)
    .gte('created_at', todayStart.toISOString());

  const sentToday = count || 0;

  if (error) {
    console.error(`[email-rate-limit] Error checking rate for ${userId}:`, error.message);
    // On error, allow the send (fail open) but log it
    return { allowed: true, sent_today: sentToday };
  }

  if (sentToday >= limit) {
    return {
      allowed: false,
      sent_today: sentToday,
      reason: `Daily ${isOnboarding ? 'onboarding' : 'marketing'} limit reached (${sentToday}/${limit})`,
    };
  }

  return { allowed: true, sent_today: sentToday };
}

/**
 * Check rate limit for a batch of users. Returns a Set of user IDs that
 * have already used their shared marketing slot today.
 *
 * This answers the general-marketing question only. The onboarding sequence
 * has its own reserved allowance, so it must go through canSendEmail() rather
 * than this batch helper.
 */
export async function getBlockedUsers(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Get count of shared-slot marketing emails per user today
  const { data, error } = await supabase
    .from('tasks')
    .select('user_id')
    .in('user_id', userIds)
    .in('type', GENERAL_MARKETING_EMAIL_TYPES)
    .gte('created_at', todayStart.toISOString());

  if (error) {
    console.error('[email-rate-limit] Batch check error:', error.message);
    return new Set(); // Fail open
  }

  // Count per user
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    counts[row.user_id] = (counts[row.user_id] || 0) + 1;
  }

  const blocked = new Set<string>();
  for (const [uid, count] of Object.entries(counts)) {
    if (count >= MAX_MARKETING_EMAILS_PER_DAY) {
      blocked.add(uid);
    }
  }

  return blocked;
}

/**
 * Record that a marketing email was sent. Must be called after every successful
 * send so canSendEmail / getBlockedUsers see it in the daily count.
 */
export async function markEmailSent(
  supabase: SupabaseClient,
  userId: string,
  emailType: string,
  title?: string,
): Promise<void> {
  const { error } = await supabase.from('tasks').insert({
    user_id: userId,
    type: emailType,
    title: title ?? emailType.replace(/_/g, ' '),
    status: 'completed',
  });
  if (error) {
    console.error(`[email-rate-limit] markEmailSent failed for ${userId} type=${emailType}:`, error.message);
  }
}
