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
 * - Max 2 marketing emails per user per day
 * - Transactional emails (welcome, password reset, ticket reply) bypass the limit
 * - Onboarding sequence gets 1 reserved slot per day (so it's not blocked by deals)
 */

const MAX_MARKETING_EMAILS_PER_DAY = 1;

// These task types count towards the daily limit
const MARKETING_EMAIL_TYPES = [
  'deal_alert_email',
  'targeted_deal_email',
  'price_increase_alert',
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
  // Combined morning digest replaces price_increase_alert + renewal_reminder
  'morning_digest',
];

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

  // Count marketing emails sent to this user today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('type', MARKETING_EMAIL_TYPES)
    .gte('created_at', todayStart.toISOString());

  const sentToday = count || 0;

  if (error) {
    console.error(`[email-rate-limit] Error checking rate for ${userId}:`, error.message);
    // On error, allow the send (fail open) but log it
    return { allowed: true, sent_today: sentToday };
  }

  if (sentToday >= MAX_MARKETING_EMAILS_PER_DAY) {
    return {
      allowed: false,
      sent_today: sentToday,
      reason: `Daily limit reached (${sentToday}/${MAX_MARKETING_EMAILS_PER_DAY})`,
    };
  }

  return { allowed: true, sent_today: sentToday };
}

/**
 * Check rate limit for a batch of users. Returns a Set of user IDs that
 * have already hit their daily limit.
 */
export async function getBlockedUsers(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Get count of marketing emails per user today
  const { data, error } = await supabase
    .from('tasks')
    .select('user_id')
    .in('user_id', userIds)
    .in('type', MARKETING_EMAIL_TYPES)
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
