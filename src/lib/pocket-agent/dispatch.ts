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
 * WhatsApp path: smart routing —
 *   1. UTILITY templates always send freely (price hike, dispute
 *      reply, money recovered, unusual charge, budget alert).
 *   2. MARKETING templates (alert_renewal etc — Meta re-categorised
 *      these on approval 2026-04-29) check three guards:
 *        a) Inside the 24h customer-service window? → send free-form
 *           text instead of the template (£0, no opt-in required).
 *        b) Outside the window AND user has marketing_opt_in_at? →
 *           send template, stamp last_marketing_template_at, respect
 *           the 24h frequency cap.
 *        c) Outside the window AND no opt-in? → skip silently.
 *
 *   This matches the rules the unified notification dispatcher
 *   enforces in src/lib/notifications/dispatch.ts. Both code paths
 *   converge on the same gate so a Pocket Agent alert and a generic
 *   notification can never together breach the 1-marketing/24h cap.
 *
 * Templates in src/lib/whatsapp/template-registry.ts are pre-approved
 * by Meta — that file is the single source of truth for category +
 * SID + variable order.
 */

import { createClient } from '@supabase/supabase-js';

// Loose typing — the cron passes a Supabase client with a different
// generic instantiation than this lib's createClient inference would
// produce. We only call .from() so the loose shape is fine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

/**
 * 24h window in milliseconds. Inside this window WhatsApp lets us
 * send free-form text with no template, no marketing fee, no opt-in
 * requirement. Outside, every outbound MUST be a Meta-approved
 * template.
 */
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MARKETING_FREQUENCY_CAP_MS = 24 * 60 * 60 * 1000;

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
  /**
   * Optional supabase admin client. When provided, the WhatsApp
   * branch checks the session's last_message_at + marketing_opt_in_at
   * + last_marketing_template_at to apply the service-window
   * fallback and the marketing gate. Callers that already hold an
   * admin client (every cron does) should pass it. Without it, the
   * WhatsApp branch falls back to the legacy "always send template"
   * behaviour — safe but pays the marketing rate when it didn't
   * have to.
   */
  supabase?: AdminClient;
}): Promise<DispatchResult> {
  const { session, alertType, detectedIssueId, telegram, whatsappVars, supabase } = args;

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

  // WhatsApp path — match alert type to the approved template, then
  // apply the service-window fallback + marketing gate.
  if (session.channel === 'whatsapp') {
    if (!whatsappVars) {
      return { ok: false, channel: 'whatsapp', error: 'no whatsapp vars provided' };
    }
    try {
      const templateName = templateForAlertType(alertType);
      if (!templateName) {
        return {
          ok: false,
          channel: 'whatsapp',
          error: `no whatsapp template registered for alert type ${alertType}`,
        };
      }

      const { TEMPLATES } = await import('@/lib/whatsapp/template-registry');
      const tpl = (TEMPLATES as Record<string, { vars: readonly string[]; category: string }>)[templateName];
      const positional = tpl.vars.map((name) => {
        const v = whatsappVars[name];
        if (v === undefined) {
          throw new Error(`whatsapp template ${templateName} missing var "${name}"`);
        }
        return String(v);
      });

      const isMarketing = tpl.category === 'MARKETING';

      // Look up the session's window + opt-in state. We can only do
      // this when the caller passed a supabase client — without it
      // we fall back to the legacy template-only path, which is safe
      // but pays marketing rates when it didn't have to.
      let inWindow = false;
      let hasMarketingOptIn = false;
      let withinMarketingCap = false;
      if (supabase) {
        const { data: row } = await supabase
          .from('whatsapp_sessions')
          .select('last_message_at, marketing_opt_in_at, last_marketing_template_at')
          .eq('user_id', session.user_id)
          .eq('is_active', true)
          .maybeSingle();
        if (row) {
          if (row.last_message_at) {
            inWindow = Date.now() - new Date(row.last_message_at).getTime() < SERVICE_WINDOW_MS;
          }
          hasMarketingOptIn = !!row.marketing_opt_in_at;
          if (row.last_marketing_template_at) {
            const since = Date.now() - new Date(row.last_marketing_template_at).getTime();
            withinMarketingCap = since < MARKETING_FREQUENCY_CAP_MS;
          }
        }
      }

      // Service-window fast path: free-form text inside the 24h
      // window. Costs nothing, no opt-in needed, no cap. Used for
      // marketing AND utility templates when we're inside the window
      // — the user gets a friendlier message AND we save the fee.
      if (inWindow && supabase) {
        const text = renderAlertText(alertType, whatsappVars);
        if (text) {
          const { sendWhatsAppText } = await import('@/lib/whatsapp');
          const result = await sendWhatsAppText({
            to: String(session.destination),
            text,
          });
          return {
            ok: true,
            channel: 'whatsapp',
            messageId: result.providerMessageId,
          };
        }
        // No text renderer — fall through to template path.
      }

      // Marketing gate (template path, outside window).
      if (isMarketing) {
        if (!hasMarketingOptIn) {
          return {
            ok: false,
            channel: 'whatsapp',
            error: 'marketing opt-in required and 24h window expired',
          };
        }
        if (withinMarketingCap) {
          return {
            ok: false,
            channel: 'whatsapp',
            error: 'marketing 24h frequency cap',
          };
        }
      }

      const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
      const result = await sendWhatsAppTemplate({
        to: String(session.destination),
        templateName,
        parameters: positional,
      });

      // Stamp last_marketing_template_at so concurrent crons can't
      // double-charge by both deciding the cap had elapsed.
      if (isMarketing && supabase) {
        await supabase
          .from('whatsapp_sessions')
          .update({ last_marketing_template_at: new Date().toISOString() })
          .eq('user_id', session.user_id)
          .eq('is_active', true);
      }

      return { ok: true, channel: 'whatsapp', messageId: result.providerMessageId };
    } catch (e) {
      return { ok: false, channel: 'whatsapp', error: e instanceof Error ? e.message : String(e) };
    }
  }

  return { ok: false, channel: session.channel, error: 'unknown channel' };
}

/**
 * Render the alert as friendly free-form text — used inside the 24h
 * customer-service window when we don't need to burn a Meta template
 * to deliver the same content.
 *
 * Each branch consumes the same `whatsappVars` keys as the matching
 * template, so callers don't have to assemble the message twice.
 *
 * Returns null if we don't have a renderer for the alert type — the
 * dispatcher will fall through to the template path. Currently every
 * alert type has one.
 */
function renderAlertText(
  alertType: AlertType,
  vars: Record<string, string | number>,
): string | null {
  const v = (k: string): string => String(vars[k] ?? '');
  switch (alertType) {
    case 'price_increase':
      return (
        `📈 Price hike spotted on *${v('merchant')}*.\n\n` +
        `Old: ${v('old_price')} → New: ${v('new_price')}\n` +
        `Effective from ${v('effective_date')}.\n\n` +
        `Want me to draft a complaint or find a cheaper deal? Just reply.`
      );
    case 'contract_expiring':
    case 'subscription_renewing':
      return (
        `⏰ Renewal coming up — *${v('service')}* in ${v('days_left')} days.\n\n` +
        `You're paying ${v('monthly_cost')}/mo on this. Want me to compare cheaper deals or draft a cancellation? Reply for either.`
      );
    case 'unusual_charge':
      return (
        `⚠️ Unusual charge from *${v('merchant')}*.\n\n` +
        `Charged: ${v('current_amount')}\n` +
        `Your average: ${v('average_amount')} (${v('percent_higher')}% higher)\n\n` +
        `Reply "dispute" if this looks wrong.`
      );
    case 'money_recovered':
      return (
        `💰 Refund received! ${v('amount')} from *${v('merchant')}*.\n\n` +
        `Lifetime recovered through Paybacker: ${v('lifetime_total')}. Nice one.`
      );
    case 'dispute_followup':
      return (
        `📨 *${v('merchant')}* replied to your dispute.\n\n` +
        `Summary: ${v('summary')}\n\n` +
        `Full thread: ${v('thread_url')}`
      );
    case 'budget_overrun':
      return (
        `🟡 Budget watch — *${v('category')}* is at ${v('percent_used')}% with ${v('amount_left')} left until ${v('end_date')}.`
      );
    default:
      return null;
  }
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
