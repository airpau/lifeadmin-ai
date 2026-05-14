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
  | 'money_recovered'
  | 'dispute_agent_action'
  | 'morning_summary'
  | 'weekly_digest'
  | 'savings_milestone'
  | 'reconnect_required'
  | 'trial_ending'
  | 'complaint_letter_ready'
  | 'outcome_check'
  | 'welcome';

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
      const err = 'no whatsapp vars provided';
      await logWhatsAppDispatchOutcome({ session, alertType, ok: false, error: err, templateName: null });
      return { ok: false, channel: 'whatsapp', error: err };
    }
    const templateName = templateForAlertType(alertType);
    if (!templateName) {
      const err = `no whatsapp template registered for alert type ${alertType}`;
      await logWhatsAppDispatchOutcome({ session, alertType, ok: false, error: err, templateName: null });
      return { ok: false, channel: 'whatsapp', error: err };
    }
    try {
      // Send via the existing twilio-provider, which resolves the
      // template SID from the registry (added 2026-04-28 fallback).
      // Template parameters are positional — we get the template
      // shape from the registry to order them correctly.
      const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
      const { TEMPLATES } = await import('@/lib/whatsapp/template-registry');
      const { getTemplateSid } = await import('@/lib/whatsapp/template-sids');
      const liveSid = await getTemplateSid(templateName);
      if (!liveSid) {
        // Pre-flight guard: template not approved by Meta yet. Skip the
        // Twilio call entirely (it would 4xx) and dedup the log so we
        // don't get a retry storm in business_log when the dispute-agent
        // cron loops over many users with the same unapproved template.
        const err = `template not yet approved`;
        const skipped = await logSkippedDispatch({
          templateName,
          userId: session.user_id,
        });
        if (!skipped.alreadyLogged) {
          await logWhatsAppDispatchOutcome({
            session,
            alertType,
            ok: false,
            error: err,
            templateName,
          });
        }
        return { ok: false, channel: 'whatsapp', error: err };
      }
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
      // 2026-04-30 — log every send to whatsapp_message_log so
      // future silence is visible. Previously only the
      // dispute_followup path wrote outbound rows, which is why
      // the founder's price_increase / renewal_imminent alerts
      // were never visible in the table even when they fired.
      await logWhatsAppOutbound({
        session,
        templateName,
        providerMessageId: result.providerMessageId,
        previewText: positional.join(' | '),
      });
      await logWhatsAppDispatchOutcome({
        session,
        alertType,
        ok: true,
        templateName,
        providerMessageId: result.providerMessageId,
      });
      return { ok: true, channel: 'whatsapp', messageId: result.providerMessageId };
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      // Twilio rejects sends for unapproved/paused Meta templates with
      // 4xx errors. Without this log line, the cron silently swallows
      // the failure and the founder gets nothing — which is exactly
      // what was happening on 2026-04-30. Surface every failure.
      await logWhatsAppDispatchOutcome({
        session,
        alertType,
        ok: false,
        error: errMsg,
        templateName,
      });
      return { ok: false, channel: 'whatsapp', error: errMsg };
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
/**
 * Best-effort write to whatsapp_message_log so every outbound
 * template send is visible in the table — not just dispute_followup.
 * Fire-and-forget. Uses its own admin Supabase client (the dispatch
 * helper is called from contexts where we don't have a Supabase
 * handle to thread through).
 */
async function logWhatsAppOutbound(args: {
  session: ActiveSession;
  templateName: string;
  providerMessageId?: string;
  previewText: string;
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const sb = createClient(url, key);
    await sb.from('whatsapp_message_log').insert({
      user_id: args.session.user_id,
      whatsapp_phone: String(args.session.destination),
      direction: 'outbound',
      message_type: 'template',
      template_name: args.templateName,
      message_text: `[Pocket Agent template: ${args.templateName}] ${args.previewText}`.slice(0, 500),
      provider: 'twilio',
      provider_message_id: args.providerMessageId ?? null,
    });
  } catch (e) {
    // Logging must never break the send path.
    console.warn('[pocket-agent/dispatch] whatsapp_message_log insert failed:', e);
  }
}

/**
 * Surface dispatch outcome (success + failure) in business_log so
 * the founder + alert-tester agent can spot silent regressions.
 *
 * Why: prior to 2026-04-30 the cron called sendWhatsAppTemplate, got
 * a Twilio 4xx for unapproved/paused templates, caught the exception,
 * returned ok=false — and nothing else. No business_log row, no
 * outbound row, no Telegram ping. Founder got zero alerts and didn't
 * know why. This helper closes the visibility gap.
 */
async function logWhatsAppDispatchOutcome(args: {
  session: ActiveSession;
  alertType: AlertType;
  ok: boolean;
  error?: string;
  templateName: string | null;
  providerMessageId?: string;
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const sb = createClient(url, key);
    const status = args.ok ? 'ok' : 'failed';
    const title = args.ok
      ? `WhatsApp template sent: ${args.templateName ?? args.alertType}`
      : `WhatsApp template send FAILED: ${args.templateName ?? args.alertType}`;
    const content = JSON.stringify({
      user_id: args.session.user_id,
      phone: String(args.session.destination),
      alert_type: args.alertType,
      template_name: args.templateName,
      provider_message_id: args.providerMessageId,
      error: args.error,
    });
    await sb.from('business_log').insert({
      category: `whatsapp_dispatch_${status}`,
      title,
      content,
    });
  } catch (e) {
    console.warn('[pocket-agent/dispatch] business_log insert failed:', e);
  }
}

/**
 * Dedup helper for "template not yet approved" skips. The dispute-agent
 * cron can loop over hundreds of disputes per tick — without dedup, every
 * loop iteration writes a business_log row for the same unapproved
 * template, producing the retry storm seen on 2026-04-29 (10 rows in 11s
 * for `paybacker_dispute_agent_action`). We piggyback on the existing
 * compliance_alerts_sent table — its UNIQUE alert_key gives us
 * one-log-per-(template, user, day) for free.
 *
 * Returns { alreadyLogged: true } when the (template_name, user_id, today)
 * skip is already recorded for the day — caller should suppress the
 * business_log write. Returns { alreadyLogged: false } on first write.
 */
async function logSkippedDispatch(args: {
  templateName: string;
  userId: string;
}): Promise<{ alreadyLogged: boolean }> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { alreadyLogged: false };
    const sb = createClient(url, key);
    const day = new Date().toISOString().slice(0, 10);
    const alertKey = `wa-skip:${args.templateName}:${args.userId}:${day}`;
    const { error } = await sb
      .from('compliance_alerts_sent')
      .insert({
        alert_key: alertKey,
        channel: 'whatsapp_skip',
        metadata: {
          template_name: args.templateName,
          user_id: args.userId,
          reason: 'template_not_approved',
        },
      });
    // 23505 = unique_violation → already logged today.
    if (error && (error.code === '23505' || /duplicate key/i.test(error.message))) {
      return { alreadyLogged: true };
    }
    return { alreadyLogged: false };
  } catch {
    // On dedup-helper failure, fall through to regular logging — better
    // to log twice than miss a real signal.
    return { alreadyLogged: false };
  }
}

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
    case 'dispute_agent_action':
      return 'paybacker_dispute_agent_action';
    case 'morning_summary':
      return 'paybacker_morning_summary';
    case 'weekly_digest':
      return 'paybacker_recovery_total_weekly';
    case 'savings_milestone':
      return 'paybacker_savings_goal_milestone';
    case 'reconnect_required':
      return 'paybacker_reconnect_required';
    case 'trial_ending':
      return 'paybacker_alert_trial_ending';
    case 'complaint_letter_ready':
      return 'paybacker_complaint_letter_ready';
    case 'outcome_check':
      return 'paybacker_outcome_check';
    case 'welcome':
      return 'paybacker_welcome';
    default:
      return null;
  }
}
