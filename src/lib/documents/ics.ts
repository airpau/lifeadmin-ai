/**
 * RFC 5545 calendar file for a document reminder. Pure.
 *
 * One VEVENT at 09:00 Europe/London on the day BEFORE the key date
 * (renewal, due or expiry), 30 minutes long, with VALARM reminders 30, 7
 * and 1 days before the event. An alarm is only included when it would
 * still fire in the future, so a renewal 10 days away gets the 7 and 1
 * day alarms and not the 30 day one.
 *
 * Correctness points that calendar apps are strict about:
 *  - CRLF line endings, and lines folded at 75 octets (UTF-8 aware, so a
 *    multi-byte character such as £ is never split)
 *  - TEXT values escape backslash, semicolon, comma and newlines
 *  - a TZID on DTSTART requires a matching VTIMEZONE, included here for
 *    Europe/London (GMT/BST rules)
 *  - DTSTAMP in UTC, a stable UID so re-importing updates rather than
 *    duplicates
 */

import { addDays } from '@/lib/documents/dates';

export const ICS_ALARM_DAYS = [30, 7, 1] as const;

/** Escape a TEXT property value (RFC 5545 section 3.3.11). */
export function escapeIcsText(v: string): string {
  return (v || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold one content line at 75 octets. Continuation lines start with a
 * single space, which counts towards their 75.
 */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of Array.from(line)) {
    const b = enc.encode(ch).length;
    if (currentBytes + b > limit) {
      out.push(current);
      current = ch;
      currentBytes = b;
      limit = 74; // the leading space takes one octet
    } else {
      current += ch;
      currentBytes += b;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n ');
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function compactDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/** London wall-clock hour for a date/time, used to tell if an alarm is past. */
function londonInstant(isoDate: string, hour: number): Date {
  // Find the UTC instant whose London wall clock is isoDate hour:00.
  // BST is UTC+1, GMT is UTC+0: try both offsets and keep the one that
  // formats back to the wanted hour.
  const [y, m, d] = isoDate.split('-').map(Number);
  for (const offset of [1, 0]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, hour - offset, 0, 0));
    const h = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(candidate),
    );
    if (h === hour) return candidate;
  }
  return new Date(Date.UTC(y, m - 1, d, hour, 0, 0));
}

const VTIMEZONE_LONDON = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/London',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:BST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:GMT',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

export interface DocumentIcsInput {
  /** Stable id, e.g. `${documentId}-renewal`. */
  uid: string;
  /** The key date itself (YYYY-MM-DD). The event is the day before. */
  keyDate: string;
  summary: string;
  description: string;
  url?: string | null;
  now?: Date;
}

export function buildDocumentIcs(input: DocumentIcsInput): string {
  const now = input.now ?? new Date();
  const eventDate = addDays(input.keyDate, -1);
  const start = `${compactDate(eventDate)}T090000`;
  const end = `${compactDate(eventDate)}T093000`;
  const eventStart = londonInstant(eventDate, 9);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Paybacker//Documents vault//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE_LONDON,
    'BEGIN:VEVENT',
    `UID:${input.uid.replace(/[^A-Za-z0-9._-]/g, '')}@paybacker.co.uk`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=Europe/London:${start}`,
    `DTEND;TZID=Europe/London:${end}`,
    `SUMMARY:${escapeIcsText(input.summary)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    ...(input.url ? [`URL:${input.url}`] : []),
    'TRANSP:TRANSPARENT',
  ];

  for (const days of ICS_ALARM_DAYS) {
    const fireAt = eventStart.getTime() - days * 86_400_000;
    if (fireAt <= now.getTime()) continue;
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(`${input.summary} (${days === 1 ? 'tomorrow' : `in ${days} days`})`)}`,
      `TRIGGER:-P${days}D`,
      'END:VALARM',
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
