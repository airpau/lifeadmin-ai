/**
 * UK civil-time send windows for proactive Pocket Agent alerts.
 *
 * Single source of truth for "is it polite to message a consumer right
 * now?". Every proactive WhatsApp / Telegram alert path funnels through
 * these helpers so a cron firing at the wrong minute can never reach the
 * user outside the allowed window.
 *
 * Why this exists (2026-06-11): the dispute watchdog / stall-letter crons
 * run every 30 minutes and dispatched alerts at 22:30 and 01:01 BST. The
 * Pocket Agent dispatch path had no time gating at all, and the legacy
 * `whatsapp-alerts` cron fired on a `0 * /6` schedule (01:00 / 07:00 BST).
 *
 * Rules (all in UK civil time — Europe/London, DST-correct):
 *   • ABSOLUTE QUIET HOURS: 21:00–08:00. No proactive message ever sends
 *     in this window. Applies to BOTH channels and ALL alert types.
 *   • Dispute watchdog / stale-letter / outcome alerts only send inside
 *     the afternoon window 16:00–18:00.
 *
 * IMPORTANT: these gates apply to PROACTIVE (cron-initiated) alerts only.
 * Direct replies to a user-initiated Telegram/WhatsApp message must NOT
 * be gated — if a user messages the bot at 11pm it should answer. That is
 * why the gates live at the alert-dispatch layer, never at the low-level
 * transport (`sendWhatsAppText` / `sendProactiveAlert`) layer.
 */

const UK_TZ = 'Europe/London';

/** No proactive sends at/after this hour (UK civil time). 21:00. */
export const QUIET_START_HOUR = 21;
/** Proactive sends resume at this hour (UK civil time). 08:00. */
export const QUIET_END_HOUR = 8;

/** Dispute-alert afternoon window — inclusive start, exclusive end. */
export const DISPUTE_WINDOW_START_HOUR = 16; // 16:00 BST
export const DISPUTE_WINDOW_END_HOUR = 18; // 18:00 BST

/**
 * Current hour + minute + weekday in UK civil time. DST-safe because it
 * derives the wall-clock time via Intl rather than a manual UTC offset.
 */
export function ukParts(date: Date = new Date()): {
  hour: number;
  minute: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: UK_TZ,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  // Intl renders midnight as "24" in some en-GB implementations; normalise.
  const rawHour = parseInt(get('hour'), 10);
  const hour = Number.isNaN(rawHour) ? 0 : rawHour % 24;
  const minute = parseInt(get('minute'), 10) || 0;
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = weekdayMap[get('weekday')] ?? 0;

  return { hour, minute, weekday };
}

/** Current hour (0–23) in UK civil time. */
export function ukHour(date: Date = new Date()): number {
  return ukParts(date).hour;
}

/**
 * True when UK civil time is inside the absolute quiet-hours window
 * (21:00–08:00). No proactive alert may send when this returns true.
 */
export function isUkQuietHours(date: Date = new Date()): boolean {
  const { hour } = ukParts(date);
  // Window wraps midnight: [21:00, 24:00) ∪ [00:00, 08:00).
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Generic UK-time window check, inclusive start hour, exclusive end hour.
 * Handles windows that wrap midnight (start > end).
 */
export function isWithinUkWindow(
  startHour: number,
  endHour: number,
  date: Date = new Date(),
): boolean {
  const { hour } = ukParts(date);
  if (startHour <= endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Wraps midnight.
  return hour >= startHour || hour < endHour;
}

/**
 * True only during the dispute-alert afternoon window (16:00–18:00 BST).
 * The dispute watchdog, stale-letter sweep and outcome-check alerts gate
 * their SENDS on this — detection/state work still runs every tick, but
 * outside this window the send is skipped (logged, not delivered).
 */
export function isDisputeAlertWindow(date: Date = new Date()): boolean {
  return isWithinUkWindow(DISPUTE_WINDOW_START_HOUR, DISPUTE_WINDOW_END_HOUR, date);
}
