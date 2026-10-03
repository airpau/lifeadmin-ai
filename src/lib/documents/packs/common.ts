/**
 * Small pure helpers shared by the pack definitions, the engine and the
 * builder: document text, dates, UK tax years, ID document detection and
 * the file names used inside a pack ZIP.
 */

import { extensionForMime } from '@/lib/documents/attachments';
import { DOC_TYPE_SINGULAR } from '@/lib/documents/types';
import { addDays, londonToday } from '@/lib/documents/dates';
import type { DisputeContext, DisputeCorrespondence, PackDocument } from '@/lib/documents/packs/types';

// ---------------------------------------------------------------------------
// Document text and dates
// ---------------------------------------------------------------------------

/** Lower-cased words we can test a document's wording against. */
export function docText(d: Pick<PackDocument, 'supplier' | 'summary' | 'filename' | 'email_subject'>): string {
  return [d.supplier, d.summary, d.filename, d.email_subject].filter(Boolean).join(' ').toLowerCase();
}

/**
 * The document's date for packs: its own date, else when it arrived.
 * Same rule as the accountant register (register.ts registerDate).
 */
export function packDate(d: Pick<PackDocument, 'doc_date' | 'email_date' | 'created_at'>): string {
  return d.doc_date || londonDateOf(d.email_date) || londonDateOf(d.created_at) || d.created_at.slice(0, 10);
}

/**
 * The UK calendar date of a timestamp (Europe/London), so an email that
 * arrived at 00:30 BST on 6 April belongs to 6 April, not 5 April.
 */
export function londonDateOf(ts: string | null | undefined): string {
  if (!ts) return '';
  const t = Date.parse(ts);
  return Number.isFinite(t) ? londonToday(new Date(t)) : '';
}

/** Oldest first, then by when it was filed. */
export function byDateAsc(a: PackDocument, b: PackDocument): number {
  const da = packDate(a);
  const db = packDate(b);
  if (da !== db) return da < db ? -1 : 1;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/** Newest first. */
export function byDateDesc(a: PackDocument, b: PackDocument): number {
  return -byDateAsc(a, b);
}

/** YYYY-MM of a YYYY-MM-DD date. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** YYYY-MM for `n` calendar months before the month of `today`. */
export function monthsBefore(today: string, n: number): string {
  const [y, m] = today.split('-').map(Number);
  const idx = y * 12 + (m - 1) - n;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

/** "September 2026" from YYYY-MM. */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "14 March 2026" from YYYY-MM-DD. */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = iso.length >= 10 ? iso.slice(0, 10) : iso;
  const [y, m, day] = d.split('-').map(Number);
  if (!y || !m || !day) return '';
  return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Days before `today` as a YYYY-MM-DD date. */
export function daysAgo(today: string, days: number): string {
  return addDays(today, -days);
}

export function money(n: number | null | undefined, currency: string | null | undefined = 'GBP'): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
  const v = Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return !currency || currency === 'GBP' ? `£${v}` : `${v} ${currency}`;
}

// ---------------------------------------------------------------------------
// UK tax years (6 April to 5 April)
// ---------------------------------------------------------------------------

/** The tax year starting 6 April `startYear`: first and last day. */
export function taxYearRange(startYear: number): { from: string; to: string } {
  return { from: `${startYear}-04-06`, to: `${startYear + 1}-04-05` };
}

/** The start year of the tax year a date falls in (5 April 2026 is in 2025 to 2026). */
export function taxYearOf(isoDate: string): number {
  const y = Number(isoDate.slice(0, 4));
  return isoDate.slice(5) >= '04-06' ? y : y - 1;
}

/** "2025 to 2026", the way HMRC writes it. */
export function taxYearLabel(startYear: number): string {
  return `${startYear} to ${startYear + 1}`;
}

/** Earliest tax year a pack can be built for. */
export const EARLIEST_TAX_YEAR = 2015;

// ---------------------------------------------------------------------------
// Identity documents: never put in a pack
// ---------------------------------------------------------------------------

const ID_DOCUMENT_RE =
  /\b(passport|driving licen[cs]e|driver'?s licen[cs]e|provisional licen[cs]e|photocard|identity card|id card|national identity|biometric residence|brp|birth certificate|marriage certificate|national insurance (number|card)|ni number|proof of identity|identity document)\b/i;

/**
 * True for passports, driving licences, ID cards, birth certificates and
 * National Insurance number letters. These never go into a pack, even
 * when the user adds them by hand: a pack can be shared by link, and an
 * ID document in the wrong hands is how identity fraud starts. Lenders
 * see ID through their own checks.
 */
export function looksLikeIdDocument(d: Pick<PackDocument, 'supplier' | 'summary' | 'filename' | 'email_subject'>): boolean {
  return ID_DOCUMENT_RE.test(docText(d));
}

/** The same test on free text, e.g. a correspondence attachment's file name. */
export function looksLikeIdText(text: string | null | undefined): boolean {
  return !!text && ID_DOCUMENT_RE.test(text.replace(/[_.-]+/g, ' '));
}

// ---------------------------------------------------------------------------
// Dispute correspondence attachments
// ---------------------------------------------------------------------------

/** Object path of a correspondence attachment, only when it is this user's file on this dispute. */
export function correspondenceObjectPath(url: string, userId: string, disputeId: string): string | null {
  const m = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/correspondence-files\/([^?#]+)/.exec(url || '');
  if (!m) return null;
  let path: string;
  try {
    path = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  if (path.includes('..')) return null;
  return path.startsWith(`disputes/${userId}/${disputeId}/`) ? path : null;
}

export interface AttachmentPlanItem {
  c: DisputeCorrespondence;
  a: DisputeCorrespondence['attachments'][number];
  path: string;
}

/**
 * Which correspondence attachments go into a dispute bundle: the user's
 * own files on this dispute, never one whose name looks like an identity
 * document (those are listed as excluded).
 */
export function disputeAttachmentPlan(
  dispute: DisputeContext | null | undefined,
  userId: string,
): { included: AttachmentPlanItem[]; excluded: Array<{ id: string; reason: string }>; bytes: number } {
  const included: AttachmentPlanItem[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];
  if (!dispute) return { included, excluded, bytes: 0 };
  for (const c of dispute.correspondence) {
    for (const a of c.attachments) {
      const path = correspondenceObjectPath(a.url, userId, dispute.id);
      if (!path) continue;
      if (looksLikeIdText(a.filename) || looksLikeIdText(path.split('/').pop() ?? '')) {
        excluded.push({ id: `${c.id}:${a.filename ?? path}`, reason: 'A correspondence attachment that looks like an identity document was left out.' });
        continue;
      }
      included.push({ c, a, path });
    }
  }
  return { included, excluded, bytes: included.reduce((s, x) => s + Math.max(0, Number(x.a.size) || 0), 0) };
}

// ---------------------------------------------------------------------------
// File names inside the ZIP
// ---------------------------------------------------------------------------

/** Strip characters Windows, macOS and ZIP tools dislike. */
export function cleanNamePart(s: string, max: number): string {
  const t = (s || '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '');
  return t.slice(0, max).trim();
}

/** Zero padded position: 01..99, then 100.. for big packs. */
export function seqLabel(n: number, total: number): string {
  return String(n).padStart(total >= 100 ? 3 : 2, '0');
}

/**
 * "NN YYYY-MM-DD Supplier, type.ext", for example
 * "03 2026-02-14 British Gas, bill.pdf". Unknown supplier and type fall
 * back to plain words; the extension follows the stored file type.
 */
export function packFileName(seq: number, total: number, d: Pick<PackDocument, 'doc_type' | 'supplier' | 'mime_type' | 'filename' | 'doc_date' | 'email_date' | 'created_at'>): string {
  const date = packDate(d);
  const supplier = cleanNamePart(d.supplier || 'Unknown supplier', 60) || 'Unknown supplier';
  const type = (DOC_TYPE_SINGULAR[d.doc_type] ?? 'Document').toLowerCase();
  const ext = extensionForMime(d.mime_type, d.filename) || 'bin';
  return `${seqLabel(seq, total)} ${date} ${supplier}, ${type}.${ext}`;
}

/** The same pattern for a file attached to dispute correspondence. */
export function attachmentFileName(seq: number, total: number, date: string | null, company: string | null, originalName: string | null, mime: string | null): string {
  const supplier = cleanNamePart(company || 'Company', 60) || 'Company';
  const ext = extensionForMime(mime || '', originalName || '') || (originalName?.split('.').pop() ?? 'bin');
  return `${seqLabel(seq, total)} ${date || 'undated'} ${supplier}, correspondence attachment.${cleanNamePart(ext, 8) || 'bin'}`;
}

/** Make every name in a list unique by adding (2), (3) before the extension. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return n;
    const dot = n.lastIndexOf('.');
    return dot > 0 ? `${n.slice(0, dot)} (${count + 1})${n.slice(dot)}` : `${n} (${count + 1})`;
  });
}
