/**
 * Once-a-day WhatsApp digest (2026-10-14, Todoist: "Make WhatsApp daily
 * alerts come once a day, not lots of separate messages").
 *
 * BEFORE (flag off, current production behaviour):
 *   07:30 UTC morning brief  +  18:00 UTC evening digest  +  up to 2 paid
 *   individual templates a day  +  uncapped "urgent" sends. Measured over
 *   the 30 days to 2026-10-14: 2.71 delivered messages per user per day,
 *   max 6, and 29 of 31 days had more than one message.
 *
 * AFTER (flag on, WHATSAPP_SINGLE_DAILY_DIGEST=1):
 *   Every non-urgent WhatsApp alert is queued and folded into the ONE
 *   07:30 UTC morning brief. The evening digest stops sending. The only
 *   messages that still go out on their own are the ones listed in
 *   `classifyWhatsAppSend` as 'instant' (OTP, replies to something the
 *   user just did, large-debit fraud signal, a trial charging before the
 *   next brief).
 *
 * Delivery uses the already-approved `paybacker_morning_summary` UTILITY
 * template (its {{2}} "highlights" variable already carries a multi-item
 * body) or a free in-window text, so NO new Meta template is needed.
 *
 * This file is deliberately import-free (type imports only) so the pure
 * helpers run under `node --experimental-strip-types --test` without the
 * Next.js path aliases.
 */

import type { DigestSection, QueuedDigestRow } from './alert-queue';

// ─────────────────────────────── feature flag ───────────────────────────────

/**
 * Feature flag. Default OFF so merging this changes nothing until Paul
 * flips `WHATSAPP_SINGLE_DAILY_DIGEST=1` in Vercel.
 */
export function isSingleDailyDigestEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = (env.WHATSAPP_SINGLE_DAILY_DIGEST ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

// ─────────────────────────────── slot timing ────────────────────────────────

/**
 * Queued items become due at 07:00 UTC so the 07:30 UTC morning-brief cron
 * (vercel.json: telegram-morning-summary "30 7 * * *") picks them up.
 * The half hour gap means an item queued while the brief is being built
 * rolls cleanly to tomorrow instead of racing it.
 */
export const MORNING_DIGEST_HOUR_UTC = 7;

/** The next 07:00 UTC slot strictly after `now`. */
export function nextMorningDigestSlot(now: Date = new Date()): Date {
  const slot = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), MORNING_DIGEST_HOUR_UTC, 0, 0),
  );
  if (now.getTime() >= slot.getTime()) slot.setUTCDate(slot.getUTCDate() + 1);
  return slot;
}

// ───────────────────────────── instant vs digest ────────────────────────────

export type SendClass = 'instant' | 'digest' | 'marketing';

export interface ClassifyInput {
  templateName: string;
  /** Template category from the registry (AUTHENTICATION / UTILITY / MARKETING). */
  category: string | null;
  /** The caller marked this genuinely time-critical. */
  allowUrgent?: boolean;
  /** True when the template is a response to something the user just did. */
  transactional?: boolean;
}

/**
 * What happens to a WhatsApp send when the single daily digest is on.
 *
 *  'instant'   : send now (OTP, conversational replies, the brief itself,
 *                caller-flagged urgent alerts).
 *  'marketing' : left to the existing marketing consent + 24h frequency
 *                gate. Never folded into the utility digest because it has
 *                a different lawful basis (PECR).
 *  'digest'    : queued for tomorrow's morning brief.
 */
export function classifyWhatsAppSend(input: ClassifyInput): SendClass {
  if (input.category === 'AUTHENTICATION') return 'instant';
  if (input.transactional) return 'instant';
  if (input.category === 'MARKETING') return 'marketing';
  if (input.allowUrgent) return 'instant';
  return 'digest';
}

// ───────────────────────────── digest rendering ─────────────────────────────

const SECTION_ORDER: DigestSection[] = ['money_in', 'money_out', 'budgets', 'renewals', 'other'];

/** Items shown in the morning section before "+N more". Sized so the
 *  section fits inside the 600 char highlights budget of the
 *  paybacker_morning_summary template once newlines are flattened. */
export const MORNING_MAX_ITEMS = 5;
export const MORNING_MAX_LINE_CHARS = 80;

/**
 * Make one queued line digest-ready:
 *  - single line, collapsed whitespace
 *  - em and en dashes replaced (house style: no dashes in copy)
 *  - trailing "Reply X ..." call to action dropped (a keyword reply is
 *    ambiguous when one message carries several items)
 *  - trailing "open paybacker.co.uk/dashboard" clause dropped (the brief
 *    already ends with the dashboard link)
 *  - capped at `max` characters with an ellipsis
 */
export function compactDigestLine(raw: string, max = MORNING_MAX_LINE_CHARS): string {
  let s = (raw ?? '')
    .replace(/\s*\n+\s*/g, ' · ')
    .replace(/\s+[\u2014\u2013]\s+/g, ', ')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Drop "Reply DISPUTE to ..." style tails (possibly after a " · " joiner).
  s = s.replace(/(?:\s*·\s*|\s+)Reply\s+[A-Z]{2,}\b[\s\S]*$/, '').trim();
  // Drop a generic dashboard tail.
  s = s
    .replace(/[,;.]?\s*(?:or\s+)?open\s+paybacker\.co\.uk\/dashboard[\w/-]*[.\s]*$/i, '')
    .trim();
  s = s.replace(/\s*·\s*$/, '').trim();
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

interface RankedItem {
  section: DigestSection;
  line: string;
  amount: number;
  createdOrder: number;
}

/**
 * Order queued rows for display: by section (money in, money out,
 * budgets, renewals, other), then largest £ first, then queue order.
 * Rows with an empty line are dropped.
 */
export function rankDigestRows(rows: QueuedDigestRow[]): RankedItem[] {
  const items: RankedItem[] = [];
  rows.forEach((row, i) => {
    const raw =
      (typeof row.payload?.line === 'string' && row.payload.line.trim()) ||
      (row.event_type ?? row.template_name ?? '').replace(/_/g, ' ').trim();
    if (!raw) return;
    let line = compactDigestLine(raw);
    const provider = (row.payload?.provider ?? '').toString().trim();
    if (provider && !line.toLowerCase().includes(provider.toLowerCase())) {
      line = compactDigestLine(`${provider}: ${line}`);
    }
    const section = (row.payload?.section ?? 'other') as DigestSection;
    items.push({
      section: SECTION_ORDER.includes(section) ? section : 'other',
      line,
      amount: Math.abs(Number(row.payload?.amount) || 0),
      createdOrder: i,
    });
  });
  // Collapse identical lines (two crons can describe the same event in
  // the same words without sharing a dedup key).
  const seen = new Set<string>();
  const unique = items.filter((it) => {
    const k = it.line.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort(
    (a, b) =>
      SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) ||
      b.amount - a.amount ||
      a.createdOrder - b.createdOrder,
  );
  return unique;
}

/**
 * The "since yesterday" block folded into the morning brief. Returns null
 * when there is nothing queued.
 */
export function buildMorningDigestSection(
  rows: QueuedDigestRow[],
  maxItems = MORNING_MAX_ITEMS,
): string | null {
  const ranked = rankDigestRows(rows);
  if (ranked.length === 0) return null;
  const shown = ranked.slice(0, maxItems);
  const lines = [
    `*Since yesterday (${ranked.length} update${ranked.length === 1 ? '' : 's'})*`,
    ...shown.map((it) => `• ${it.line}`),
  ];
  if (ranked.length > shown.length) {
    lines.push(`• +${ranked.length - shown.length} more at paybacker.co.uk/dashboard`);
  }
  return lines.join('\n');
}

/**
 * Fold the queued items into the morning brief body.
 *
 *  - No queued items: the brief is returned untouched (null stays null,
 *    so a user with no bank data and nothing queued still gets nothing).
 *  - No brief (user has no bank transactions yet) but items queued: a
 *    digest-only body is returned so the queued alerts are not lost.
 *  - Both: the section goes straight after the brief's header line, so it
 *    survives the 600 char truncation of the template highlights variable.
 */
export function foldDigestIntoBrief(
  briefBody: string | null,
  rows: QueuedDigestRow[],
): string | null {
  const section = buildMorningDigestSection(rows);
  if (!section) return briefBody;
  if (!briefBody || !briefBody.trim()) {
    return `${section}\n\nFull detail: paybacker.co.uk/dashboard`;
  }
  const nl = briefBody.indexOf('\n');
  if (nl === -1) return `${briefBody}\n\n${section}`;
  const header = briefBody.slice(0, nl);
  const rest = briefBody.slice(nl).replace(/^\n+/, '');
  return `${header}\n\n${section}\n\n${rest}`;
}

// ─────────────────────────── large debit (instant) ──────────────────────────

/**
 * £ threshold at which a single outgoing debit is sent straight away
 * (possible fraud: the user can freeze the card or dispute while it
 * matters). Default 500, the value large-debit-alert has always used.
 * Tunable via WHATSAPP_URGENT_DEBIT_GBP without a deploy of code.
 */
export function urgentDebitThresholdGbp(
  env: Record<string, string | undefined> = process.env,
): number {
  const n = Number(env.WHATSAPP_URGENT_DEBIT_GBP);
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export interface UrgentDebitItem {
  /** Already formatted, e.g. "£612.00". */
  amount: string;
  merchant: string;
  category: string;
}

/**
 * One message for several large debits found in the same cron run, so a
 * run that finds four £500+ payments buzzes the user once, not four times.
 */
export function buildUrgentDebitsBody(items: UrgentDebitItem[]): string {
  const lines = items.map((it) => `• ${it.amount} to ${it.merchant} (${it.category})`);
  return [
    `*${items.length} large payments just left your account*`,
    ...lines,
    '',
    "If any of these doesn't look right, reply DISPUTE or check paybacker.co.uk/dashboard/money-hub",
  ].join('\n');
}
