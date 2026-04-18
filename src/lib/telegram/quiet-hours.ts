/**
 * Quiet hours guard for proactive Telegram messages.
 *
 * Returns true if the current wall-clock time in the given IANA timezone
 * falls within the do-not-disturb window (23:00–05:00 inclusive).
 * Falls back to Europe/London when no timezone is supplied or the supplied
 * value is unrecognised.
 *
 * Usage:
 *   if (isQuietHours()) { return; }          // UK time (default)
 *   if (isQuietHours('America/New_York')) {}  // user-local time
 */
export function isQuietHours(timezone?: string): boolean {
  const tz = timezone?.trim() || 'Europe/London';

  let hour: number;
  try {
    // Extract the hour in the target timezone using Intl.
    // 'numeric' / hour12:false gives values 0–23.
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    });
    hour = parseInt(fmt.format(new Date()), 10);
    if (Number.isNaN(hour)) throw new Error('parse failed');
  } catch {
    // Invalid / unknown timezone — retry with London so we never throw.
    if (tz !== 'Europe/London') return isQuietHours('Europe/London');
    return false;
  }

  // Quiet window: 23:00 (inclusive) through 04:59 (inclusive)
  return hour >= 23 || hour < 5;
}
