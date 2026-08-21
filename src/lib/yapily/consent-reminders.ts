// src/lib/yapily/consent-reminders.ts
//
// Scheduling and channel selection for the UK 90-day consent
// reconfirmation reminders.
//
// Why this is a separate module
// ─────────────────────────────
// All of this logic used to live inline in the cron, entangled with the
// status-maintenance UPDATEs, and it was wrong in a way nobody could see
// from reading it. Production evidence, 21 Aug 2026: across the entire
// history of the system the reminder path had sent exactly ONE email —
// and that one was the "your connection has already stopped" variant,
// not an advance warning. No user has ever received a 7-day notice.
//
// The root cause was structural. The cron built its candidate list from
// the rows returned by the two status UPDATEs, i.e. only connections
// whose status CHANGED on that run. Once a connection flipped to
// `expiring_soon` on day T-7 it could never be a candidate again until
// it flipped to `expired` on T-0. So the ceiling was two messages per
// connection, ever, with nothing in between — while the `_${today}`
// suffix on both dedup keys implied a daily cadence that could not
// happen.
//
// Pulling the decision out here makes it testable without a database,
// which is the point: this path is impossible to exercise naturally
// without waiting 90 days.

/** First advance warning, in days before the deadline. */
export const FIRST_REMINDER_DAYS_BEFORE = 7;

/**
 * How many days AFTER the deadline we keep nudging before going quiet.
 *
 * Not zero, because a lapsed connection is recoverable — reconfirmation
 * restores access without a bank login — and someone who missed the
 * week of warnings is exactly the person who needs one more prompt.
 * Not unbounded, because a user who has decided to stop should be
 * allowed to stop; three days is enough to catch a holiday, and short
 * of nagging.
 */
export const REMINDER_DAYS_AFTER = 3;

export type ReminderStage =
  /** Deadline is still ahead: T-7 .. T-1. */
  | 'advance'
  /** Deadline is today. */
  | 'final'
  /** Deadline has passed, still inside the grace nudges: T+1 .. T+3. */
  | 'lapsed';

/**
 * Whole days from `now` to `deadline`.
 *
 * Ceil, so "expires at 23:00 tonight" reads as 1 day left rather than 0
 * — the user still has today to act, and telling them it has already
 * gone would be wrong. Negative once the deadline is past.
 */
export function daysUntil(deadline: string | Date, now: Date = new Date()): number {
  const end = new Date(deadline);
  if (Number.isNaN(end.getTime())) return Number.NaN;
  return Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
}

/**
 * Which deadline governs this connection.
 *
 * `consent_reconfirm_by` is Yapily's own answer, returned by the extend
 * endpoint and captured at callback — it is the date that actually
 * gates data access under the UK reconfirmation regime. Prefer it.
 *
 * `consent_expires_at` is our locally computed `now + 90 days` and is a
 * guess. It stays as the fallback for connections created before we
 * started reading Yapily's dates back.
 */
export function reminderDeadline(conn: {
  consent_reconfirm_by?: string | null;
  consent_expires_at?: string | null;
}): string | null {
  return conn.consent_reconfirm_by || conn.consent_expires_at || null;
}

/** Is today a day we should nudge this connection? */
export function shouldRemindToday(daysLeft: number): boolean {
  if (!Number.isFinite(daysLeft)) return false;
  return daysLeft <= FIRST_REMINDER_DAYS_BEFORE && daysLeft >= -REMINDER_DAYS_AFTER;
}

export function reminderStage(daysLeft: number): ReminderStage {
  if (daysLeft > 0) return 'advance';
  if (daysLeft === 0) return 'final';
  return 'lapsed';
}

export type ReminderChannel = 'email';

export interface ChannelAvailability {
  /** profiles.email */
  email: string | null;
}

export interface ChannelChoice {
  channel: ReminderChannel;
  /** Why this one, or why nothing. Surfaced by the admin harness. */
  reason: string;
}

/**
 * Email, or nothing.
 *
 * Simplified on 2026-08-21 after a live test send, and it is worth
 * recording why, because the earlier version was cleverer and worse.
 *
 * We had a chain: WhatsApp for Pro users, then Telegram, then email.
 * The problem only surfaced when a real message landed on a real
 * handset. Our one Meta-approved template,
 * `paybacker_reconnect_required`, has a frozen body:
 *
 *   "Your {{1}} connection has expired. Reconnect here: {{2}}
 *    ... alerts pause until you do."
 *
 * Only the two variables are ours. At T-0 that sentence is true. At T-7
 * it tells someone with a full week of working bank feed left that it
 * has already stopped. Telling a user their bank connection is dead
 * when it is not is worse than not messaging them at all, and it costs
 * us credibility on every alert we send afterwards.
 *
 * We could gate WhatsApp to the days its copy happens to be true. We
 * did, briefly. But that leaves a reminder schedule whose channel
 * silently changes halfway through for reasons no user could infer,
 * built around a sentence we are not allowed to edit.
 *
 * Email plus an in-app notification is the honest version: we write
 * every word, it reaches every user on every tier, it costs nothing per
 * send, and the copy can say "expires in 5 days" because that is true.
 *
 * Telegram went for the same reason: with email already covering
 * everyone, a second push channel is a second thing to keep accurate
 * for no extra reach.
 *
 * The in-app notification is deliberately NOT a channel here. It is
 * written on every reminder day alongside the email, so it is waiting
 * when the user next opens Paybacker. It does not compete for the
 * one-send-per-day slot because it costs nothing and interrupts nobody.
 * When the mobile app lands, this is the row a push notification reads.
 */
export function pickReminderChannel(a: ChannelAvailability): ChannelChoice | null {
  if (!a.email) return null;
  return { channel: 'email', reason: 'email' };
}

/**
 * One reminder per connection per day, whatever channel it went out on.
 *
 * The channel is deliberately NOT in the key. The old code used a
 * separate key per channel, which is what allowed the same person to be
 * messaged twice for one event. Keying on the connection and the date
 * makes "one message per bank per day" an invariant of the dedup table
 * rather than a property of the send logic.
 *
 * Per CONNECTION rather than per USER: two banks expiring means two
 * separate reconnections, and a single message naming one of them would
 * leave the other silently lapsed.
 */
export function reminderReferenceKey(connectionId: string, dateIso: string): string {
  return `consent_reminder_${connectionId}_${dateIso.slice(0, 10)}`;
}

/** notification_log.notification_type for the unified reminder. */
export const REMINDER_NOTIFICATION_TYPE = 'consent_reminder';

/**
 * The full schedule for one connection, used by the admin harness to
 * show what a 90-day cycle looks like without waiting 90 days.
 */
export function reminderSchedule(): Array<{ daysLeft: number; stage: ReminderStage }> {
  const out: Array<{ daysLeft: number; stage: ReminderStage }> = [];
  for (let d = FIRST_REMINDER_DAYS_BEFORE; d >= -REMINDER_DAYS_AFTER; d--) {
    out.push({ daysLeft: d, stage: reminderStage(d) });
  }
  return out;
}
