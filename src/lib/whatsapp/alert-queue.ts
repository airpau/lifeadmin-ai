/**
 * Evening-digest queue helpers (2026-08-16 WhatsApp cost/fatigue rework).
 *
 * The `whatsapp_alert_queue` table (migration 20260621160000_whatsapp_send_time.sql)
 * originally held only send-time-optimisation deferrals released one-by-one by
 * /api/cron/whatsapp-queue-release. This module adds a second, clearly-separated
 * use of the same table: items destined for the ONE consolidated evening digest
 * sent by /api/cron/whatsapp-evening-digest at 18:00 UTC.
 *
 * Separation contract (do not break):
 *   - Digest-destined rows ALWAYS have dedup_key prefixed 'digest:'.
 *   - The hourly queue-release cron SKIPS rows whose dedup_key starts
 *     'digest:' — they are grouped and delivered by the digest cron only.
 *   - Send-time deferral rows (written by src/lib/whatsapp/send-time.ts)
 *     keep their original un-prefixed dedup_key format and are untouched.
 *
 * Row payload shape for digest rows:
 *   { section, line, amount, provider, url, template_name, parameters,
 *     source: 'digest' }
 * `line` is a single newline-free sentence ready to drop into the digest.
 * `provider` (optional) is the merchant/provider name, bolded at render
 * time. `url` (optional) is the SPECIFIC dashboard destination for the
 * item (e.g. paybacker.co.uk/dashboard/disputes/{id}) — rendered on its
 * own line under the bullet so WhatsApp auto-linkifies it.
 *
 * The unique partial index uq_waq_pending_dedup (user_id, dedup_key) WHERE
 * status='pending' gives us cross-cron dedup for free — e.g. the same
 * outgoing-payment transaction detected by both large-debit-alert and
 * whatsapp-alerts enqueues once.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEMPLATES } from './template-registry';

export const DIGEST_DEDUP_PREFIX = 'digest:';

/** UTC hour of the daily evening digest cron (see vercel.json). */
export const DIGEST_HOUR_UTC = 18;

export type DigestSection = 'money_in' | 'money_out' | 'budgets' | 'renewals' | 'other';

export interface DigestEnqueueInput {
  userId: string;
  /** EVENT_CATALOG event name (or template name when no event applies). */
  eventType: string;
  /** Which digest section the line belongs in. Derived from eventType when omitted. */
  section?: DigestSection;
  /** One-line, newline-free summary shown in the evening digest. */
  line: string;
  /** Optional £ magnitude used to rank "top items" within a section. */
  amount?: number;
  /** Provider/merchant name — bolded in the rendered digest bullet. */
  provider?: string | null;
  /** Specific dashboard destination for this item (no protocol needed,
   *  e.g. paybacker.co.uk/dashboard/disputes/abc). Rendered on its own
   *  line under the bullet. */
  url?: string | null;
  /** Template the item would have been sent as (audit only — the digest itself
   *  goes out as one message, never as this template). */
  templateName?: string | null;
  parameters?: string[];
  /** Stable dedup key WITHOUT the 'digest:' prefix (added here). */
  dedupKey: string;
}

export type DigestEnqueueOutcome = 'queued' | 'duplicate' | 'error';

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * The next 18:00 UTC digest slot strictly after `now`. Items queued during
 * quiet hours late in the evening roll to tomorrow's digest; items queued
 * during the day land in today's.
 */
export function nextDigestSlot(now: Date = new Date()): Date {
  const slot = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DIGEST_HOUR_UTC, 0, 0,
  ));
  if (now.getTime() >= slot.getTime()) slot.setUTCDate(slot.getUTCDate() + 1);
  return slot;
}

/** Map an event type / template name onto a digest section. */
export function sectionForEvent(
  eventType?: string | null,
  templateName?: string | null,
): DigestSection {
  const ev = (eventType ?? '').toLowerCase();
  const tpl = (templateName ?? '').toLowerCase();
  const is = (...names: string[]) => names.some((n) => ev === n || tpl === n);

  if (is('income_received', 'payment_received', 'money_received', 'paybacker_payment_received')) {
    return 'money_in';
  }
  if (
    is(
      'payment_outgoing', 'dd_warning', 'large_upcoming_bill',
      'paybacker_payment_outgoing', 'paybacker_dd_warning',
    )
  ) {
    return 'money_out';
  }
  if (is('budget_alert', 'paybacker_budget_alert')) return 'budgets';
  if (
    is(
      'renewal_reminder', 'trial_ending', 'contract_expiry', 'contract_expiring',
      'subscription_renewing', 'paybacker_alert_renewal', 'paybacker_alert_trial_ending',
    )
  ) {
    return 'renewals';
  }
  return 'other';
}

/**
 * Render an approved template body with its positional parameters filled in.
 * Used (a) by the send facade as the free in-window text equivalent of a
 * buttonless template, and (b) as the digest-line fallback for facade-deferred
 * sends. Returns null for unknown templates.
 */
export function renderTemplatePreview(
  templateName: string,
  parameters: string[],
): string | null {
  const tpl = (TEMPLATES as Record<string, { body?: string }>)[templateName];
  if (!tpl?.body) return null;
  return tpl.body.replace(/\{\{(\d+)\}\}/g, (_m, idx: string) => {
    const v = parameters[Number(idx) - 1];
    return v !== undefined ? String(v) : '';
  });
}

/** Collapse a rendered body into a single digest-safe line. */
export function toDigestLine(text: string, max = 220): string {
  const flat = text.replace(/\s*\n+\s*/g, ' · ').replace(/\s{2,}/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Queue one item for the user's evening digest. Never throws.
 *
 * Returns:
 *   'queued'    — inserted; will appear in the next digest.
 *   'duplicate' — an identical pending item already exists (unique index hit)
 *                 — treat as success, the item IS in the digest.
 *   'error'     — insert failed for another reason; caller decides whether to
 *                 fail-open (send now) or drop.
 */
export async function enqueueDigestItem(
  supabase: SupabaseClient | null,
  input: DigestEnqueueInput,
): Promise<DigestEnqueueOutcome> {
  const sb = supabase ?? adminClient();
  if (!sb) return 'error';
  try {
    const section = input.section ?? sectionForEvent(input.eventType, input.templateName);
    const dedupKey = `${DIGEST_DEDUP_PREFIX}${input.dedupKey}`.slice(0, 250);
    const { error } = await sb.from('whatsapp_alert_queue').insert({
      user_id: input.userId,
      event_type: input.eventType,
      template_name: input.templateName ?? null,
      payload: {
        section,
        line: toDigestLine(input.line),
        amount: typeof input.amount === 'number' && Number.isFinite(input.amount)
          ? Math.round(Math.abs(input.amount) * 100) / 100
          : null,
        provider: input.provider?.trim() || null,
        url: input.url?.trim() || null,
        template_name: input.templateName ?? null,
        parameters: input.parameters ?? null,
        source: 'digest',
      },
      release_after: nextDigestSlot().toISOString(),
      dedup_key: dedupKey,
    });
    if (error) {
      if ((error as { code?: string }).code === '23505') return 'duplicate';
      console.warn('[whatsapp/alert-queue] enqueue failed:', error.message);
      return 'error';
    }
    return 'queued';
  } catch (e) {
    console.warn('[whatsapp/alert-queue] enqueue threw:', (e as Error)?.message ?? e);
    return 'error';
  }
}

// ─────────────────────────── digest assembly ───────────────────────────

export interface QueuedDigestRow {
  id: string;
  user_id: string;
  event_type: string | null;
  template_name: string | null;
  payload: {
    section?: DigestSection;
    line?: string;
    amount?: number | null;
    provider?: string | null;
    url?: string | null;
    [k: string]: unknown;
  } | null;
}

const SECTION_ORDER: DigestSection[] = [
  'money_in',
  'money_out',
  'budgets',
  'renewals',
  'other',
];

const SECTION_TITLES: Record<DigestSection, string> = {
  money_in: 'Money in',
  money_out: 'Money out',
  budgets: 'Budgets',
  renewals: 'Renewals',
  other: 'Other',
};

/** Max lines shown per section — the rest are rolled into a "+N more". */
const MAX_LINES_PER_SECTION = 3;

/**
 * Strip a generic "open paybacker.co.uk/dashboard" tail from a bullet
 * line. Only applied when the item carries a SPECIFIC `url` — the link
 * is rendered on its own line instead, so the generic clause (which some
 * rendered template previews end with) would be dead weight.
 */
function stripTrailingDashboardClause(line: string): string {
  const m = line.match(
    /^(.*?)[,;]?\s*(?:or\s+)?open\s+paybacker\.co\.uk\/dashboard[\w/-]*[.\s]*$/i,
  );
  if (!m) return line;
  let head = m[1].trim();
  if (!head) return line;
  if (!/[.!?]$/.test(head)) head += '.';
  return head;
}

/**
 * Bold the provider name inside a bullet line. If the line already
 * mentions the provider, the first occurrence is wrapped in WhatsApp
 * bold markers in place; otherwise the provider is prefixed.
 */
function boldProviderInLine(line: string, provider?: string | null): string {
  const p = (provider ?? '').trim();
  if (!p) return line;
  const idx = line.toLowerCase().indexOf(p.toLowerCase());
  if (idx === -1) return `*${p}*: ${line}`;
  // Already bolded at this position — leave it alone.
  if (idx > 0 && line[idx - 1] === '*') return line;
  return `${line.slice(0, idx)}*${line.slice(idx, idx + p.length)}*${line.slice(idx + p.length)}`;
}

/**
 * Group one user's queued items into a single sectioned evening-digest
 * body, in the same voice as the morning brief. Sections with nothing in
 * them are omitted entirely. Items are ranked by £ magnitude so the top
 * items surface first. Each item's specific deep link (payload.url) is
 * rendered on its own line directly under the bullet so WhatsApp
 * auto-linkifies it.
 */
export function buildEveningDigestBody(
  firstName: string,
  rows: QueuedDigestRow[],
): string {
  const bySection = new Map<
    DigestSection,
    Array<{ line: string; amount: number; url: string | null }>
  >();
  for (const row of rows) {
    const section =
      row.payload?.section ?? sectionForEvent(row.event_type, row.template_name);
    let line =
      (typeof row.payload?.line === 'string' && row.payload.line.trim()) ||
      `${row.event_type ?? row.template_name ?? 'Update'}`;
    const url =
      (typeof row.payload?.url === 'string' && row.payload.url.trim()) || null;
    if (url) line = stripTrailingDashboardClause(line);
    line = boldProviderInLine(line, row.payload?.provider);
    const amount = Number(row.payload?.amount) || 0;
    if (!bySection.has(section)) bySection.set(section, []);
    bySection.get(section)!.push({ line, amount, url });
  }

  const parts: string[] = [
    `*Evening round-up, ${firstName}*`,
    `${rows.length} update${rows.length === 1 ? '' : 's'} from today.`,
  ];

  for (const section of SECTION_ORDER) {
    const items = bySection.get(section);
    if (!items || items.length === 0) continue;
    items.sort((a, b) => b.amount - a.amount);
    const shown = items.slice(0, MAX_LINES_PER_SECTION);
    const header = `*${SECTION_TITLES[section]}* (${items.length})`;
    const lines: string[] = [];
    for (const it of shown) {
      lines.push(`• ${it.line}`);
      if (it.url) lines.push(it.url);
    }
    if (items.length > shown.length) {
      lines.push(`• +${items.length - shown.length} more in your dashboard`);
    }
    parts.push('', header, ...lines);
  }

  parts.push('', 'Full detail: paybacker.co.uk/dashboard');
  return parts.join('\n');
}

