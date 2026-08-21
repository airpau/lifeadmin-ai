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

export type ReminderChannel = 'whatsapp' | 'telegram' | 'email';

/**
 * Is the approved WhatsApp template's wording actually TRUE today?
 *
 * `paybacker_reconnect_required` is Meta-approved with a fixed body:
 *
 *   "Your {{1}} connection has expired. Reconnect here: {{2}}
 *    — alerts pause until you do."
 *
 * Only the two variables are ours; the sentence is frozen. So at T-7,
 * when the user has a full week of working bank feed left, that
 * template would tell them their connection HAS EXPIRED and that alerts
 * have stopped. Both false, and alarming in a way that damages trust in
 * every alert we send afterwards.
 *
 * Caught on 2026-08-21 by firing a real T-0 test send and reading the
 * message that arrived. It only announces itself when you look at the
 * words a human receives, not at the return value.
 *
 * So WhatsApp is restricted to the days its copy is true — the deadline
 * itself and after. Advance warnings go by Telegram or email, where we
 * control the wording and can say "expires in 5 days" accurately.
 *
 * The fix is not to weaken this check: it is to submit an advance-notice
 * template to Meta ("Your {{1}} connection needs reconfirming within
 * {{2}} days") and widen this once approved.
 */
export function whatsappCopyIsTruthful(daysLeft: number | undefined): boolean {
  // Undefined means the caller isn't day-aware; be conservative.
  if (daysLeft === undefined) return false;
  return daysLeft <= 0;
}

export interface ChannelAvailability {
  /** Effective plan tier, for the WhatsApp Pro gate. */
  tier: string;
  /**
   * Days until the deadline. Needed because channel eligibility is not
   * purely about what the user has linked — the approved WhatsApp
   * template's wording is only accurate from T-0 onward.
   */
  daysLeft?: number;
  /** Active, non-opted-out whatsapp_sessions row. */
  whatsappPhone: string | null;
  /** Active telegram_sessions row. */
  telegramChatId: number | null;
  /** profiles.email */
  email: string | null;
  /** isAtLeastPro(tier) — injected so this module stays dependency-free. */
  isPro: boolean;
}

export interface ChannelChoice {
  channel: ReminderChannel;
  /** Why this one won — logged, and surfaced by the admin harness. */
  reason: string;
}

/**
 * Picks EXACTLY ONE channel, or none.
 *
 * Migle Ivanauskaite (Yapily) asked us to simplify to "the primary
 * preferred channel" rather than firing every channel we have. The old
 * code did the opposite on purpose — a comment justified sending
 * WhatsApp AND email to the same person for the same event on the same
 * day, which is precisely the alert fatigue that trains people to
 * ignore the one message that matters.
 *
 * Order is by likelihood of actually being read, with cost as the
 * tie-breaker:
 *
 *   1. WhatsApp — highest open rate, but every template send costs us
 *      £0.003-£0.06, so it is Pro-only. That gate is enforced HERE
 *      rather than being assumed: the old cron called the low-level
 *      sendWhatsAppTemplate facade directly, which never reads tier, so
 *      the `proOnly` flag in the template registry was decorative and
 *      free users on a linked number were being messaged.
 *   2. Telegram — free for us and available on every tier.
 *   3. Email — universal fallback; everyone has one.
 *
 * The in-app banner is deliberately NOT in this list. It is always
 * shown and costs nothing to display, so it is not a "send" competing
 * for the one-per-day slot.
 */
export function pickReminderChannel(a: ChannelAvailability): ChannelChoice | null {
  return reminderChannelChain(a)[0] ?? null;
}

/**
 * The ordered list of channels to try, best first.
 *
 * We attempt ONE and stop as soon as it is delivered — this is not a
 * fan-out. The list exists because a channel can refuse at send time
 * for reasons we cannot know in advance: WhatsApp applies its own
 * suppression list and a marketing opt-in check inside the facade. If
 * the best channel refuses, dropping the day's reminder entirely would
 * be the wrong answer for a deadline that only passes once, so we fall
 * through to the next one.
 *
 * Deliberately NOT a reason to fall through: a `deferred` WhatsApp.
 * That means the facade has queued it for the 18:00 evening digest and
 * it genuinely will arrive today, so falling through would send the
 * same person two reminders for one event.
 */
export function reminderChannelChain(a: ChannelAvailability): ChannelChoice[] {
  const chain: ChannelChoice[] = [];

  if (a.whatsappPhone && a.isPro && whatsappCopyIsTruthful(a.daysLeft)) {
    chain.push({ channel: 'whatsapp', reason: 'Pro tier with an active opted-in WhatsApp session' });
  } else if (a.whatsappPhone && a.isPro) {
    // Eligible for WhatsApp, but the only approved template would lie.
    // Falls through to Telegram / email below.
  }
  const whatsappSkipReason = !a.whatsappPhone
    ? null
    : !a.isPro
      ? 'WhatsApp session exists but tier is below Pro'
      : !whatsappCopyIsTruthful(a.daysLeft)
        ? 'WhatsApp skipped — the approved template says "has expired", which is not true yet'
        : null;

  if (a.telegramChatId) {
    chain.push({
      channel: 'telegram',
      reason: whatsappSkipReason
        ? `${whatsappSkipReason} — using Telegram`
        : 'active Telegram session',
    });
  }
  if (a.email) {
    chain.push({
      channel: 'email',
      reason: whatsappSkipReason && !a.telegramChatId
        ? `${whatsappSkipReason}, and no Telegram — using email`
        : 'email',
    });
  }
  return chain;
}

/**
 * Is this reminder urgent enough to bypass WhatsApp's quiet hours and
 * the 2-paid-templates-per-day cap?
 *
 * Only in the last 24 hours and after. Those caps exist to stop us
 * training people to ignore us, and a T-7 notice does not warrant
 * spending that budget — the user has a week. A connection expiring
 * today or already lapsed is different: it stops their bank feed, and
 * they cannot act on a message they never receive.
 */
export function isUrgentReminder(daysLeft: number): boolean {
  return daysLeft <= 1;
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
