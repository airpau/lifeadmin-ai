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
 *   { section, line, amount, template_name, parameters, source: 'digest' }
 * `line` is a single newline-free sentence ready to drop into the digest.
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
