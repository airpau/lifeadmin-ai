/**
 * Weekly documents digest: due, renewal, expiry and warranty dates in
 * the next 30 days. Selection and wording are pure; the cron
 * (/api/cron/document-digest) does the reading and the sending through
 * the notification dispatcher.
 */

import { addDays, daysBetween } from '@/lib/documents/dates';
import { DOC_TYPE_SINGULAR, type DocType } from '@/lib/documents/types';
import { card, paragraph, renderPaybackerEmail, unorderedList } from '@/lib/email/PaybackerEmailLayout';

export const DIGEST_WINDOW_DAYS = 30;
/** Most dates one digest lists. */
export const DIGEST_MAX_ITEMS = 25;

export type DigestKind = 'due' | 'renewal' | 'expiry' | 'warranty';

export interface DigestDoc {
  id: string;
  doc_type: DocType;
  supplier: string | null;
  summary: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  renewal_date: string | null;
  expiry_date: string | null;
  warranty_until: string | null;
  warranty_note: string | null;
}

export interface DigestItem {
  docId: string;
  kind: DigestKind;
  date: string;
  daysAway: number;
  title: string;
  amount: number | null;
  currency: string | null;
}

export const DIGEST_KIND_LABEL: Record<DigestKind, string> = {
  due: 'Payment due',
  renewal: 'Renews',
  expiry: 'Expires',
  warranty: 'Warranty ends',
};

/** The window a digest covers: from today to today + days, both inclusive. */
export function digestWindow(today: string, days = DIGEST_WINDOW_DAYS): { from: string; to: string } {
  return { from: today, to: addDays(today, days) };
}

function titleOf(d: DigestDoc, kind: DigestKind): string {
  if (kind === 'warranty' && d.warranty_note) return d.warranty_note;
  const type = (DOC_TYPE_SINGULAR[d.doc_type] ?? 'Document').toLowerCase();
  return d.supplier ? `${d.supplier} ${type}` : DOC_TYPE_SINGULAR[d.doc_type] ?? 'Document';
}

/**
 * Every key date from today to today + 30 days (inclusive), soonest first,
 * one line per date. A document with a renewal and an expiry inside the
 * window gives two lines.
 */
export function selectDigestItems(docs: DigestDoc[], today: string, days = DIGEST_WINDOW_DAYS): DigestItem[] {
  const { from, to } = digestWindow(today, days);
  const items: DigestItem[] = [];
  for (const d of docs) {
    const dates: Array<[DigestKind, string | null]> = [
      ['due', d.due_date],
      ['renewal', d.renewal_date],
      ['expiry', d.expiry_date],
      ['warranty', d.warranty_until],
    ];
    for (const [kind, date] of dates) {
      if (!date || date < from || date > to) continue;
      items.push({ docId: d.id, kind, date, daysAway: daysBetween(today, date), title: titleOf(d, kind), amount: kind === 'warranty' ? null : d.amount, currency: d.currency });
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)));
  return items.slice(0, DIGEST_MAX_ITEMS);
}

function when(daysAway: number): string {
  if (daysAway <= 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  return `in ${daysAway} days`;
}

function niceDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
}

function amountText(i: DigestItem): string {
  if (i.amount === null || i.amount === undefined) return '';
  const v = Number(i.amount).toFixed(2);
  return !i.currency || i.currency === 'GBP' ? `, £${v}` : `, ${v} ${i.currency}`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** One line per date, for Telegram and push. */
export function digestLines(items: DigestItem[]): string[] {
  return items.map((i) => `${DIGEST_KIND_LABEL[i.kind]} ${when(i.daysAway)} (${niceDate(i.date)}): ${i.title}${amountText(i)}`);
}

export function buildDigestMessages(firstName: string, items: DigestItem[], appUrl: string): {
  email: { subject: string; html: string };
  telegram: string;
  push: { title: string; body: string };
} {
  const n = items.length;
  const soon = items.filter((i) => i.daysAway <= 7).length;
  const subject = soon > 0 ? `${soon} date${soon === 1 ? '' : 's'} coming up this week in your documents` : `${n} date${n === 1 ? '' : 's'} in your documents in the next 30 days`;
  const link = `${appUrl.replace(/\/$/, '')}/dashboard/documents`;
  const html = renderPaybackerEmail({
    preheader: subject,
    heading: `Hi ${firstName}, here is what is coming up`,
    intro: 'Renewals, payment dates, expiry dates and warranties from the documents in your Paybacker vault, for the next 30 days.',
    body: [
      card(
        unorderedList(
          items.map((i) => `<strong>${esc(DIGEST_KIND_LABEL[i.kind])} ${esc(when(i.daysAway))}</strong> (${esc(niceDate(i.date))}): ${esc(i.title)}${esc(amountText(i))}`),
        ),
        { eyebrow: 'Next 30 days' },
      ),
      paragraph('A renewal is the best moment to check you are still on a fair price. If a warranty is about to run out and something is not right, contact the seller before it does.'),
      paragraph('You get this once a week while there is something coming up. Turn it off in your notification settings at any time.', { muted: true }),
    ].join(''),
    cta: { label: 'Open your documents', href: link },
  });
  const telegram = [`📄 *Coming up in your documents*`, '', ...digestLines(items).map((l) => `• ${l}`), '', `Open them: ${link}`].join('\n');
  return {
    email: { subject, html },
    telegram,
    push: { title: 'Coming up in your documents', body: `${n} date${n === 1 ? '' : 's'} in the next 30 days. Tap to see them.` },
  };
}

/** ISO week key, e.g. 2026-W40, so a digest goes out at most once a week. */
export function isoWeekKey(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
