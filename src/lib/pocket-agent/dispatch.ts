/**
 * Channel-agnostic Pocket Agent alert dispatcher.
 *
 * The Pocket Agent has two channels (Telegram + WhatsApp) and a
 * mutex enforcing only one is active per user. The detection
 * pipeline in /api/cron/telegram-alerts knows how to FIND alerts
 * but only knew how to SEND via Telegram. WhatsApp users (Paul, Pro
 * tier on WhatsApp since 2026-04-27) got nothing.
 *
 * This helper unifies the send path. Caller doesn't care which
 * channel the user is on — pass the alert type + structured payload
 * and we'll route to whichever session is active.
 *
 * Telegram path: existing sendProactiveAlert (rich Markdown +
 * inline buttons).
 *
 * WhatsApp path: Twilio template send via the registered template
 * matching the alert type. Templates in
 * src/lib/whatsapp/template-registry.ts are pre-approved by Meta.
 */

import { createClient } from '@supabase/supabase-js';

// Loose typing — the cron passes a Supabase client with a different
// generic instantiation than this lib's createClient inference would
// produce. We only call .from() so the loose shape is fine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export type AlertType =
  | 'price_increase'
  | 'contract_expiring'
  | 'budget_overrun'
  | 'dispute_followup'
  | 'subscription_renewing'
  | 'unusual_charge'
  | 'money_recovered';

export interface ActiveSession {
  user_id: string;
  channel: 'telegram' | 'whatsapp';
  /** Telegram chat_id when channel='telegram', E.164 phone when channel='whatsapp'. */
  destination: string | number;
}

/**
 * Pull every active Pocket Agent session across BOTH channels, in
 * one go. The mutex guarantees a user has at most one active row,
 * so we never duplicate.
 */
export async function listActivePocketAgentSessions(
  supabase: AdminClient,
): Promise<ActiveSession[]> {
  const [{ data: tg }, { data: wa }] = await Promise.all([
    supabase
      .from('telegram_sessions')
      .select('user_id, telegram_chat_id')
      .eq('is_active', true),
    supabase
      .from('whatsapp_sessions')
      .select('user_id, whatsapp_phone')
      .eq('is_active', true)
      .is('opted_out_at', null),
  ]);

  const sessions: ActiveSession[] = [];
  for (const r of (tg ?? []) as Array<{ user_id: string; telegram_chat_id: number }>) {
    sessions.push({
      user_id: r.user_id,
      channel: 'telegram',
      destination: r.telegram_chat_id,
    });
  }
  for (const r of (wa ?? []) as Array<{ user_id: string; whatsapp_phone: string }>) {
    sessions.push({
      user_id: r.user_id,
      channel: 'whatsapp',
      destination: r.whatsapp_phone,
    });
  }
  return sessions;
}

export interface DispatchResult {
  ok: boolean;
  channel: 'telegram' | 'whatsapp';
  messageId?: string;
  error?: string;
}

/**
 * Channel-agnostic send. Caller passes a structured alert and we
 * route to the right channel using the session info. Failures are
 * logged but never throw — the cron continues to the next alert.
 *
 * Telegram payload shape preserves the existing rich-format the
 * Telegram cron uses (title + detail + recommendation + buttons).
 *
 * WhatsApp payload uses the Meta-approved template per alert type
 * and fills its named variables. Template SIDs are in
 * src/lib/whatsapp/template-registry.ts.
 */
export async function dispatchPocketAgentAlert(args: {
  session: ActiveSession;
  alertType: AlertType;
  /** Used by Telegram path for the inline-button issue id. */
  detectedIssueId: string;
  /** Telegram-only — rich text. WhatsApp uses templateVars instead. */
  telegram?: {
    title: string;
    detail: string;
    recommendation?: string | null;
    amount_impact?: number;
  };
  /** WhatsApp template variables — keyed by var name in the
   * template registry. Missing vars throw on send. */
  whatsappVars?: Record<string, string | number>;
}): Promise<DispatchResult> {
  const { session, alertType, detectedIssueId, telegram, whatsappVars } = args;

  if (session.channel === 'telegram') {
    if (!telegram) {
      return { ok: false, channel: 'telegram', error: 'no telegram payload provided' };
    }
    try {
      const { sendProactiveAlert } = await import('@/lib/telegram/user-bot');
      const { ok, messageId } = await sendProactiveAlert({
        chatId: Number(session.destination),
        issue: {
          id: detectedIssueId,
          title: telegram.title,
          detail: telegram.detail,
          recommendation: telegram.recommendation ?? null,
          amount_impact: telegram.amount_impact,
          issue_type: alertType,
        },
      });
      return { ok, channel: 'telegram', messageId: messageId != null ? String(messageId) : undefined };
    } catch (e) {
      return { ok: false, channel: 'telegram', error: e instanceof Error ? e.message : String(e) };
    }
  }

  // WhatsApp path — match alert type to the approved template.
  if (session.channel === 'whatsapp') {
    if (!whatsappVars) {
      return { ok: false, channel: 'whatsapp', error: 'no whatsapp vars provided' };
    }
    try {
      const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
      const templateName = templateForAlertType(alertType);
      if (!templateName) {
        return {
          ok: false,
          channel: 'whatsapp',
          error: `no whatsapp template registered for alert type ${alertType}`,
        };
      }
      // Send via the existing twilio-provider, which resolves the
      // template SID from the registry (added 2026-04-28 fallback).
      // Template parameters are positional — we get the template
      // shape from the registry to order them correctly.
      const { TEMPLATES } = await import('@/lib/whatsapp/template-registry');
      const tpl = (TEMPLATES as Record<string, { vars: readonly string[] }>)[templateName];
      const positional = tpl.vars.map((name) => {
        const v = whatsappVars[name];
        if (v === undefined) {
          throw new Error(`whatsapp template ${templateName} missing var "${name}"`);
        }
        return String(v);
      });
      const result = await sendWhatsAppTemplate({
        to: String(session.destination),
        templateName,
        parameters: positional,
      });
      return { ok: true, channel: 'whatsapp', messageId: result.providerMessageId };
    } catch (e) {
      return { ok: false, channel: 'whatsapp', error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { ok: false, channel: session.channel, error: 'unknown channel' };
}

/**
 * Map detection alert types to the WhatsApp template that carries
 * them. Returns null when there's no Meta-approved template for the
 * alert type — the caller should skip the WhatsApp send and rely
 * on the Telegram cron's queued evening digest path.
 */
function templateForAlertType(alertType: AlertType): string | null {
  switch (alertType) {
    case 'price_increase':
      return 'paybacker_alert_price_increase';
    case 'contract_expiring':
    case 'subscription_renewing':
      return 'paybacker_alert_renewal';
    case 'unusual_charge':
      return 'paybacker_alert_unusual_charge';
    case 'money_recovered':
      return 'paybacker_money_recovered';
    case 'dispute_followup':
      // Use the dispute_reply template's SID — same shape (merchant /
      // summary / link) and is already Meta-approved.
      return 'paybacker_dispute_reply';
    case 'budget_overrun':
      return 'paybacker_budget_alert';
    default:
      return null;
  }
}
