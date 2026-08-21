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
  'daily_digest',
  'renewal_reminder',
  'churn_reengagement',
  'churn_inactive_7d',
  'churn_inactive_14d',
  'churn_pre_renewal',
  'founding_reminder',
  'weekly_money_digest',
  'onboarding_email',
  // contract_end_alert stays marketing: /api/cron/contract-expiry looks up the
  // best available deal and the email renders live "Switch to X and save
  // £Y/year" rows with a deal_url. That is an offer, so it counts.
  'contract_end_alert',
];

// These are transactional and bypass the limit
// Transactional emails bypass the cap entirely.
//
// The test is not "does it contain a link" — it is whether someone who opted
// out of ALL marketing would still want the message. A service message that
// carries an offer is marketing; one that only tells the user something about
// their own money is not.
const TRANSACTIONAL_TYPES = [
  'welcome_email',
  'ticket_reply',
  'password_reset',
  'dispute_reminder_email',

  // "You were overcharged" is the core thing this product exists to tell
  // people. Capping it means a user does not find out they lost money because
  // a deals email took the slot that morning. The only outbound link is
  // "Review & switch" pointing at their own subscriptions page — no offer, no
  // provider, no price. If that link ever starts reading as promotional,
  // soften the link rather than capping the message.
  'overcharge_alert',

  // /api/cron/contract-expiry-alerts hardcodes every deal field to null
  // (deal_provider, deal_price, potential_saving_monthly, deal_url), so the
  // deal rows never render and the subject falls back to "review before
  // auto-renewal". As sent, it carries no promotional content at all.
  //
  // ⚠️ If you ever wire real deal data into that cron, this stops being true
  // and the type belongs back in MARKETING_EMAIL_TYPES. The sibling
  // contract_end_alert is the worked example of what that looks like.
  'contract_expiry_alert',
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
  // `tasks.description` is NOT NULL with no default. Omitting it made every
  // insert here fail the constraint, and the error below only ever reached
  // the console — so this ledger has never recorded a single row. The cap
  // counts rows in `tasks`, which is why it only ever saw the crons that do
  // their own insert (renewal_reminder, deal_alert_email, weekly_money_digest,
  // founding_reminder) and never the ones routed through this helper
  // (daily_digest, price_increase_alert, contract_expiry_alert,
  // contract_end_alert, overcharge_alert).
  const label = title ?? emailType.replace(/_/g, ' ');
  const { error } = await supabase.from('tasks').insert({
    user_id: userId,
    type: emailType,
    title: label,
    description: label,
    status: 'completed',
  });
  if (error) {
    console.error(`[email-rate-limit] markEmailSent failed for ${userId} type=${emailType}:`, error.message);
  }
}
