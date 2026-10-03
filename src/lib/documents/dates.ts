/**
 * Key dates on a document (due, renewal, expiry) and which one a
 * reminder should be for. Pure.
 */

export type KeyDateKind = 'due' | 'renewal' | 'expiry';

export interface KeyDateSource {
  due_date: string | null;
  renewal_date: string | null;
  expiry_date: string | null;
}

export const KEY_DATE_LABEL: Record<KeyDateKind, string> = {
  due: 'Payment due',
  renewal: 'Renews',
  expiry: 'Expires',
};

export function isKeyDateKind(v: unknown): v is KeyDateKind {
  return v === 'due' || v === 'renewal' || v === 'expiry';
}

/** Today's date in Europe/London as YYYY-MM-DD. */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Add whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from a to b (b minus a), both YYYY-MM-DD. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function keyDatesOf(doc: KeyDateSource): Array<{ kind: KeyDateKind; date: string }> {
  const out: Array<{ kind: KeyDateKind; date: string }> = [];
  if (doc.due_date) out.push({ kind: 'due', date: doc.due_date });
  if (doc.renewal_date) out.push({ kind: 'renewal', date: doc.renewal_date });
  if (doc.expiry_date) out.push({ kind: 'expiry', date: doc.expiry_date });
  return out;
}

/**
 * The date a reminder should be for. With `kind` given, that date (if
 * set). Otherwise the soonest date that is still in the future.
 * Returns null when there is nothing upcoming to remind about.
 */
export function pickReminderDate(
  doc: KeyDateSource,
  today: string,
  kind?: KeyDateKind | null,
): { kind: KeyDateKind; date: string } | null {
  const all = keyDatesOf(doc).filter((k) => k.date > today);
  if (kind) return all.find((k) => k.kind === kind) ?? null;
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return all[0] ?? null;
}
