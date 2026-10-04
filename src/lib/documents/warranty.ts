/**
 * Warranties and guarantees. Pure.
 *
 * The classifier reads a warranty or guarantee length off a receipt or
 * invoice when one is stated ("2 year guarantee", "12 months warranty")
 * and the product it covers. warranty_until is then worked out from the
 * purchase date. The user can set or correct it by hand on any plan.
 *
 * The last covered day is purchase date plus the length, less one day:
 * a 12 month warranty bought on 15 March 2026 covers up to and including
 * 14 March 2027. Erring a day early is the safe side for a reminder. A
 * purchase on the 31st plus one month lands on the last day of a shorter
 * month (31 January + 1 month = 28 or 29 February), then less one day.
 */

import { addDays } from '@/lib/documents/dates';

/**
 * YYYY-MM-DD that is a real calendar date, else null. Same rule as
 * classify.ts validIsoDate, repeated here so classify.ts can import this
 * module without a cycle.
 */
function validIsoDate(v: string | null | undefined): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Longest warranty length we accept from the classifier: 25 years. */
export const MAX_WARRANTY_MONTHS = 300;

/** A whole number of months from 1 to MAX_WARRANTY_MONTHS, else null. */
export function parseWarrantyMonths(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > MAX_WARRANTY_MONTHS) return null;
  return r;
}

/** Add calendar months to a YYYY-MM-DD date, clamping to the month end. */
export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(ty).padStart(4, '0')}-${String(tm + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Last covered day for a warranty of `months` bought on `purchaseDate`. */
export function computeWarrantyUntil(purchaseDate: string | null | undefined, months: number | null | undefined): string | null {
  const start = validIsoDate(purchaseDate ?? null);
  const m = parseWarrantyMonths(months ?? null);
  if (!start || !m) return null;
  return addDays(addMonths(start, m), -1);
}

/** The purchase date to count from: the document's own date, else the email date. */
export function purchaseDateOf(doc: { doc_date: string | null; email_date?: string | null }): string | null {
  return validIsoDate(doc.doc_date) ?? validIsoDate(doc.email_date ? doc.email_date.slice(0, 10) : null);
}

/** "2 year guarantee: Bosch washing machine" style note. */
export function warrantyNote(months: number | null, product: string | null | undefined): string | null {
  const p = (product || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!months && !p) return null;
  const length = !months ? null : months % 12 === 0 ? `${months / 12} year${months === 12 ? '' : 's'}` : `${months} month${months === 1 ? '' : 's'}`;
  if (length && p) return `${length} cover: ${p}`;
  return length ? `${length} cover` : p;
}

/** Clean a user supplied note. */
export function cleanWarrantyNote(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 200) : null;
}

/** Reminder label: "Warranty ends in 30 days: X", "Warranty ends tomorrow: X". */
export const WARRANTY_LABEL = 'Warranty ends';

/** What the warranty is for, for reminder titles: the note's product, else the supplier. */
export function warrantyWhat(doc: { warranty_note: string | null; supplier: string | null; summary?: string | null }): string {
  const product = doc.warranty_note ? doc.warranty_note.replace(/^[^:]*cover:\s*/i, '').trim() : '';
  if (product && !/^\d+ (year|month)s? cover$/i.test(product)) return product.slice(0, 80);
  if (doc.supplier) return `${doc.supplier} purchase`;
  return 'your purchase';
}
