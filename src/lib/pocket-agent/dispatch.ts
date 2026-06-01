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
  | 'dispute_agent_action';

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

  // WhatsApp path — smart-route by the 24h customer-service window.
  //
  // Inside the window (user texted us in the last 24h): we can send
  // free-form text — no Meta template needed, no approval gate. This
  // unblocks the long-tail "template pending Meta approval" gap that
  // was silently swallowing every non-morning-brief alert (price
  // increases, renewals, unusual charges, dispute-agent actions,
  // money-recovered, budget overruns, dispute-followups) for users
  // who chat with the Pocket Agent regularly. The morning brief
  // already had this fallback in src/lib/whatsapp/morning-brief.ts;
  // this is the same pattern applied uniformly.
  //
  // Outside the window: fall through to the existing template path.
  // If the in-window text send fails for any reason (e.g. the window
  // closed between our check and the send — Twilio returns 63016),
  // we ALSO fall through to template so the alert still has a path.
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

    // ── Intelligence layer: consult before firing ────────────────────
    // Phase 0 of the closed-loop architecture (see
    // docs/CLOSED_LOOP_ARCHITECTURE.md). If this alert template has been
    // emitted ≥ 30 times AND its precision is ≤ 15%, the intelligence
    // layer tells us to suppress. Critical alert types bypass this
    // automatically inside the SDK (matches EVENT_CATALOG critical=true).
    const { recordAction, consultLedger, logAutoSuppression } =
      await import('@/lib/intelligence');
    const intelCtx = {
      userId: session.user_id,
      actor: 'system' as const,
      actionKind: 'alert_sent',
      subjectKind: 'alert_template',
      subjectId: templateName,
      predicted: { alertType, detectedIssueId, hasWhatsappVars: !!whatsappVars },
      metadata: { dispatcher: 'pocket-agent', telegram_payload: !!telegram },
    };
    const decision = await consultLedger(intelCtx);
    if (!decision.emit) {
      await logAutoSuppression(intelCtx, decision);
      const err = `suppressed by intelligence layer (${decision.reason}, precision=${decision.precision_pct}%)`;
      await logWhatsAppDispatchOutcome({
        session,
        alertType,
        ok: false,
        error: err,
        templateName,
      });
      return { ok: false, channel: 'whatsapp', error: err };
    }
    // Phase 0 matches outcomes by (subject_kind, subject_id) so we don't
    // need to retain the event id here. Phase 2 will likely thread it
    // through to enable per-send outcome attribution.
    await recordAction(intelCtx);

    // ── In-window text attempt ───────────────────────────────────────
    const inWindow = await isInsideServiceWindow(session.user_id);
    if (inWindow) {
      const inWindowText = buildInWindowAlertText(alertType, telegram, whatsappVars);
      if (inWindowText) {
        try {
          const { sendWhatsAppText } = await import('@/lib/whatsapp');
          const result = await sendWhatsAppText({
            to: String(session.destination),
            text: inWindowText,
          });
          await logWhatsAppOutbound({
            session,
            templateName: null,
            providerMessageId: result.providerMessageId,
            previewText: inWindowText.slice(0, 200),
            messageType: 'text',
          });
          await logWhatsAppDispatchOutcome({
            session,
            alertType,
            ok: true,
            templateName: null,
            providerMessageId: result.providerMessageId,
          });
          return {
            ok: true,
            channel: 'whatsapp',
            messageId: result.providerMessageId,
          };
        } catch (e) {
          // Free-form text failed — typically Twilio 63016 if the 24h
          // window expired between our check and the send. Fall
          // through to template; we logged the failure cause is the
          // template branch will record its own outcome too.
          const errMsg = e instanceof Error ? e.message : String(e);
          console.warn(
            `[pocket-agent/dispatch] in-window text send failed for user ${session.user_id}, falling back to template:`,
            errMsg,
          );
        }
      }
    }

    // ── Template path (out-of-window OR in-window fallback) ──────────
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
  templateName: string | null;
  providerMessageId?: string;
  previewText: string;
  /** 'template' for templated sends, 'text' for in-window free-form sends.
   *  Defaults to 'template' for backward-compat with existing call sites. */
  messageType?: 'template' | 'text';
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const sb = createClient(url, key);
    const messageType = args.messageType ?? 'template';
    const prefix =
      messageType === 'text'
        ? '[Pocket Agent in-window text]'
        : `[Pocket Agent template: ${args.templateName ?? '—'}]`;
    await sb.from('whatsapp_message_log').insert({
      user_id: args.session.user_id,
      whatsapp_phone: String(args.session.destination),
      direction: 'outbound',
      message_type: messageType,
      template_name: args.templateName,
      message_text: `${prefix} ${args.previewText}`.slice(0, 500),
      provider: 'twilio',
      provider_message_id: args.providerMessageId ?? null,
    });
  } catch (e) {
    // Logging must never break the send path.
    console.warn('[pocket-agent/dispatch] whatsapp_message_log insert failed:', e);
  }
}

/**
 * Best-effort 24h customer-service window check, mirroring
 * `isInsideWhatsAppServiceWindow` in src/lib/whatsapp/morning-brief.ts.
 *
 * Inside the window we can send free-form text without a Meta-approved
 * template. The morning brief already uses this primitive; we lift it
 * here so the alert dispatcher uses the same heuristic.
 *
 * Returns false on any error — we'd rather fall through to the template
 * path than silently drop a send because the lookup failed.
 */
async function isInsideServiceWindow(userId: string): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;
    const sb = createClient(url, key);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await sb
      .from('whatsapp_message_log')
      .select('id')
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .gte('created_at', since)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Render an alert as plain WhatsApp text for in-window delivery.
 *
 * Prefers the `telegram` payload when present — it's already richly
 * formatted by the cron (title + detail + recommendation), so we
 * just join the parts. Falls back to a per-alert-type formatter that
 * builds copy from `whatsappVars` so callers that only supply
 * template vars still get an in-window send.
 *
 * Returns null when neither input is sufficient — caller will fall
 * through to the template path.
 *
 * Wording deliberately mirrors the template bodies (reply-keyword
 * CTAs in particular) so the user sees the same shape whether the
 * alert lands in-window or out-of-window. The free-form text strips
 * the Meta variable-position constraints, so we can be a touch more
 * natural with phrasing.
 */
function buildInWindowAlertText(
  alertType: AlertType,
  telegram?: {
    title: string;
    detail: string;
    recommendation?: string | null;
    amount_impact?: number;
  },
  whatsappVars?: Record<string, string | number>,
): string | null {
  if (telegram) {
    const parts = [telegram.title.trim(), telegram.detail.trim()];
    if (telegram.recommendation && telegram.recommendation.trim()) {
      parts.push(telegram.recommendation.trim());
    }
    return parts.filter(Boolean).join('\n\n');
  }
  if (!whatsappVars) return null;
  const v = (k: string): string | null =>
    whatsappVars[k] != null ? String(whatsappVars[k]) : null;
  switch (alertType) {
    case 'price_increase': {
      const merchant = v('merchant') ?? 'a merchant';
      const sub = v('subscription_name') ?? 'your subscription';
      const oldP = v('old_price') ?? v('old_amount') ?? '?';
      const newP = v('new_price') ?? v('new_amount') ?? '?';
      const pct = v('pct_increase') ?? v('percent_higher');
      return `Price alert — ${merchant} has increased ${sub} from £${oldP} to £${newP}${pct ? ` — a ${pct}% rise` : ''}. Reply DISPUTE to challenge it or DISMISS to ignore.`;
    }
    case 'contract_expiring':
    case 'subscription_renewing': {
      const merchant = v('merchant') ?? v('service') ?? 'your contract';
      const date = v('renewal_date');
      const days = v('days_left');
      const amount = v('amount') ?? v('monthly_cost') ?? '?';
      const when = date ? `on ${date}` : days ? `in ${days} days` : 'soon';
      return `Heads up — ${merchant} renews ${when} for £${amount}. Reply CANCEL if you want to stop it, or KEEP to leave it running.`;
    }
    case 'unusual_charge': {
      const merchant = v('merchant') ?? 'a merchant';
      const amount = v('amount') ?? v('current_amount') ?? '?';
      const date = v('date');
      return `Unusual charge spotted: £${amount} from ${merchant}${date ? ` on ${date}` : ''}. Reply DISPUTE to challenge it or EXPLAIN if you know what it is.`;
    }
    case 'money_recovered': {
      const amount = v('amount_recovered') ?? v('amount') ?? '?';
      const supplier = v('supplier') ?? v('merchant') ?? 'a supplier';
      const total = v('total_recovered') ?? v('lifetime_total');
      const totalLine = total ? ` Your total recovered with Paybacker is now £${total}.` : '';
      return `Great news — £${amount} recovered from ${supplier}!${totalLine} Reply DISPUTES to see all your cases.`;
    }
    case 'budget_overrun': {
      const pct = v('pct_used') ?? v('percent_used') ?? '?';
      const category = v('category') ?? 'category';
      const spent = v('spent') ?? '?';
      const limit = v('limit') ?? v('amount_left') ?? '?';
      const days = v('days_remaining');
      return `Budget alert: you've used ${pct}% of your ${category} budget this month (£${spent} of £${limit}).${days ? ` ${days} days left.` : ''} Reply BUDGET for a full breakdown.`;
    }
    case 'dispute_followup': {
      const merchant = v('merchant') ?? 'A supplier';
      const summary = v('summary') ?? 'replied to your dispute';
      const url = v('thread_url');
      return `${merchant} replied to your dispute: "${summary}".${url ? `\n\nOpen the thread: ${url}` : ''}\n\nReply REPLY to draft a response.`;
    }
    case 'dispute_agent_action': {
      const type = v('dispute_type') ?? 'your';
      const supplier = v('supplier') ?? v('merchant') ?? 'a supplier';
      const amount = v('amount') ?? '?';
      const action = v('action_description') ?? v('action_summary') ?? 'an action is needed';
      const keyword = v('reply_keyword') ?? v('cta') ?? 'GO';
      return `Your ${type} dispute with ${supplier} for £${amount} needs attention — ${action}. Reply ${keyword} to proceed or SKIP to leave it for now.`;
    }
    default:
      return null;
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
    default:
      return null;
  }
}
