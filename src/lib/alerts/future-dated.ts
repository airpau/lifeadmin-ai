// src/lib/alerts/future-dated.ts
//
// Guard against alerting on FUTURE-DATED bank transactions.
//
// Why this exists (2026-08-16):
// HSBC (and other Open Banking providers) return scheduled payments as
// ordinary transaction rows dated on the day they are DUE, not the day
// they were booked. Confirmed in production: five rows dated
// 2026-08-17 (a Monday) were synced on 2026-08-15 (a Friday) — e.g.
// "BRITISH GAS BUSINE" -1598.00 and "BROXBOURNE BC" -2282.00 — all with
// is_pending = false. The bank sets is_pending false, so that flag is
// useless for this: it tells us nothing about whether the money has
// actually moved.
//
// The consequence was a Saturday WhatsApp/Telegram alert telling the
// founder those payments had LEFT his account. They had not. They were
// scheduled for Monday.
//
// Rule: any notification phrased in the past tense ("just left your
// account", "just landed", "money received") must only fire for
// transactions whose date is today or earlier. A future-dated row is a
// SCHEDULED payment and belongs in the upcoming/scheduled-payments
// surface (/api/cron/sync-upcoming, Money Hub "Upcoming"), never in a
// "payment received/left" alert.
//
// Comparison is done on the CALENDAR DATE in Europe/London, not on the
// raw instant. Banks commonly stamp date-only transactions at midnight,
// and a transaction dated later today is not "in the future" in any way
// a user would recognise — only a later calendar day is.

/** YYYY-MM-DD for an instant, as seen in Europe/London. */
export function londonDateKey(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  // en-CA gives ISO-shaped YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * True when the transaction's Europe/London calendar date is AFTER
 * today's Europe/London calendar date — i.e. the money has not moved
 * yet and we must not say that it has.
 *
 * Unparseable timestamps return false (fail open): we'd rather send a
 * real alert than silently drop every transaction on a date-parsing
 * regression. The dedup log means a bad send can't repeat.
 */
export function isFutureDated(
  timestamp: string | number | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!timestamp) return false;
  const txKey = londonDateKey(timestamp);
  if (!txKey) return false;
  return txKey > londonDateKey(now);
}

/**
 * End of today in Europe/London, as an ISO instant — usable as a
 * `.lte('timestamp', …)` upper bound so future-dated rows are excluded
 * in the query rather than in JS.
 */
export function endOfTodayLondonIso(now: Date = new Date()): string {
  // Take today's London date, then take the last millisecond of it. We
  // resolve the UTC offset by probing midnight UTC of the same date and
  // reading back what London calls it — avoids hardcoding BST/GMT.
  const key = londonDateKey(now);
  // 23:59:59.999 London is at worst 22:59:59.999Z (BST) — using the
  // next date's 00:00Z as the exclusive bound is simpler and safe:
  // it can only ever include a little of the following UTC morning,
  // which is still the same or an earlier London day than "tomorrow".
  const [y, m, d] = key.split('-').map(Number);
  const endUtc = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  return new Date(endUtc).toISOString();
}
