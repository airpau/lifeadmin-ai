/**
 * WhatsApp alert self-learning closed loop — glue layer.
 *
 * This module wires WhatsApp proactive alerts into the EXISTING intelligence
 * platform (src/lib/intelligence: recordAction / recordOutcome / consultLedger,
 * aggregated nightly by /api/cron/intelligence-rollup-daily into
 * intelligence_stats.precision_pct, which consultLedger then reads to suppress
 * low-value alerts). We are NOT building a parallel stats system — we feed and
 * consult the one that already runs.
 *
 *   send      → recordAlertSent()         (emit: subject_kind='alert_template')
 *   reply     → attributeInboundEngagement() (outcome: 'action_taken')
 *   STOP/mute → recordAlertDismissed()     (outcome: 'dismissed')
 *   receipt   → ingestStatusReceipt()      (delivered/read/failed telemetry)
 *   decide    → shouldSuppressAlert()       (consultLedger + learned mutes)
 *
 * Every function is fire-and-forget and NEVER throws — the loop is observably
 * additive and can never break a send or an inbound. Surface: B2C consumer
 * Pocket Agent only.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  recordAction,
  recordOutcome,
  consultLedger,
  CRITICAL_BYPASS,
} from '@/lib/intelligence';
import { logAlertInteraction } from '@/lib/alert-interactions';

/** How recently an alert must have been sent for an inbound reply to count as
 *  engagement with it. Beyond this we don't credit the alert. */
const ATTRIBUTION_WINDOW_HOURS = 72;

/**
 * Templates that are NOT proactive alerts (welcome, opt-out confirmation, OTP,
 * out-of-window agent reply). We don't measure these as alert_template — they'd
 * pollute the precision signal the suppression decision depends on.
 */
const NON_ALERT_TEMPLATES = new Set<string>([
  'paybacker_welcome',
  'paybacker_opted_out',
  'paybacker_login_code',
  'paybacker_pocket_agent_reply',
]);

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isAlertTemplate(name: string | undefined | null): boolean {
  return !!name && !NON_ALERT_TEMPLATES.has(name);
}

function londonHour(d: Date): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        hour12: false,
      }).format(d),
    );
  } catch {
    return d.getUTCHours();
  }
}

export interface AlertSendCtx {
  userId?: string | null;
  /** EVENT_CATALOG event name that triggered the send (e.g. 'unusual_charge'). */
  eventType?: string;
  /** Twilio SID / Meta message id returned by the provider. */
  providerMessageId?: string;
  phone: string;
  templateName: string;
  /**
   * true → INSERT a whatsapp_message_log row for this send (used by the unified
   * dispatcher, which otherwise logs nothing). Direct sendWhatsAppTemplate
   * callers that log their own row leave this false so we never double-log;
   * we just stamp their existing row by provider_message_id.
   */
  logMessage?: boolean;
  exploration?: boolean;
  client?: SupabaseClient;
}

/**
 * Record an alert send into the intelligence ledger + wire attribution pointers.
 * Returns the intelligence_events id (or null). Fire-and-forget — never throws.
 */
export async function recordAlertSent(ctx: AlertSendCtx): Promise<string | null> {
  if (!isAlertTemplate(ctx.templateName)) return null;
  const sb = ctx.client ?? admin();
  try {
    let userId = ctx.userId ?? null;
    if (!userId && sb) {
      const { data } = await sb
        .from('whatsapp_sessions')
        .select('user_id')
        .eq('whatsapp_phone', ctx.phone)
        .maybeSingle();
      userId = (data?.user_id as string | undefined) ?? null;
    }

    const now = new Date();
    const eventId = await recordAction({
      userId,
      actor: 'system',
      actionKind: 'alert_sent',
      subjectKind: 'alert_template',
      subjectId: ctx.templateName,
      predicted: {
        event_type: ctx.eventType ?? null,
        hour_london: londonHour(now),
        dow: now.getUTCDay(),
        channel: 'whatsapp',
      },
      metadata: {
        provider_message_id: ctx.providerMessageId ?? null,
        phone: ctx.phone,
        exploration: ctx.exploration ?? false,
      },
    });

    if (!sb) return eventId;

    if (userId) {
      await sb
        .from('whatsapp_sessions')
        .update({
          last_alert_template: ctx.templateName,
          last_alert_event_id: eventId,
          last_alert_at: now.toISOString(),
        })
        .eq('whatsapp_phone', ctx.phone);
    }

    if (ctx.logMessage) {
      await sb.from('whatsapp_message_log').insert({
        user_id: userId,
        whatsapp_phone: ctx.phone,
        direction: 'outbound',
        message_type: 'template',
        template_name: ctx.templateName,
        provider: process.env.WHATSAPP_PROVIDER || 'twilio',
        provider_message_id: ctx.providerMessageId ?? null,
        alert_event_id: eventId,
        notification_type: ctx.eventType ?? null,
      });
    } else if (ctx.providerMessageId) {
      // Caller logged its own row — stamp it (best-effort, no double-log).
      await sb
        .from('whatsapp_message_log')
        .update({ alert_event_id: eventId, notification_type: ctx.eventType ?? null })
        .eq('provider_message_id', ctx.providerMessageId);
    }

    return eventId;
  } catch (e) {
    console.warn('[alert-loop] recordAlertSent failed:', (e as Error)?.message ?? e);
    return null;
  }
}

export interface SuppressDecision {
  suppress: boolean;
  reason: string;
  sample: number;
  precision: number | null;
  exploration: boolean;
}

/**
 * Decide whether a NON-CRITICAL WhatsApp alert should be suppressed, by
 * consulting (a) the user's learned dismissed_alert_types and (b) the
 * intelligence ledger's precision for this template. Critical alerts are never
 * suppressed (consultLedger enforces CRITICAL_BYPASS). Fail-open: any error
 * returns suppress=false so the user still gets the alert.
 */
export async function shouldSuppressAlert(args: {
  userId?: string | null;
  templateName: string;
  eventType?: string;
  client?: SupabaseClient;
}): Promise<SuppressDecision> {
  try {
    const critical =
      CRITICAL_BYPASS.has(args.templateName) ||
      (!!args.eventType && CRITICAL_BYPASS.has(args.eventType));

    if (!critical) {
      const sb = args.client ?? admin();
      if (sb && args.userId) {
        const { data } = await sb
          .from('user_intelligence_profile')
          .select('dismissed_alert_types')
          .eq('user_id', args.userId)
          .maybeSingle();
        const dismissed: string[] = (data?.dismissed_alert_types as string[] | null) ?? [];
        if (
          dismissed.includes(args.templateName) ||
          (args.eventType ? dismissed.includes(args.eventType) : false)
        ) {
          return { suppress: true, reason: 'user_muted', sample: 0, precision: null, exploration: false };
        }
      }
    }

    const decision = await consultLedger({
      userId: args.userId ?? null,
      actionKind: 'alert_sent',
      subjectKind: 'alert_template',
      subjectId: args.templateName,
    });
    return {
      suppress: !decision.emit,
      reason: decision.reason,
      sample: decision.sample,
      precision: decision.precision_pct,
      exploration: !!decision.exploration,
    };
  } catch (e) {
    console.warn('[alert-loop] shouldSuppressAlert failed (fail-open):', (e as Error)?.message ?? e);
    return { suppress: false, reason: 'error_fail_open', sample: 0, precision: null, exploration: false };
  }
}

/** Log an auto-suppression as its own ledger event so it's measurable. */
export async function recordAlertSuppressed(args: {
  userId?: string | null;
  templateName: string;
  eventType?: string;
  reason: string;
  sample: number;
  precision: number | null;
}): Promise<void> {
  try {
    await recordAction({
      userId: args.userId ?? null,
      actor: 'system',
      actionKind: 'alert_sent_suppressed',
      subjectKind: 'alert_template',
      subjectId: args.templateName,
      metadata: {
        decision_reason: args.reason,
        sample: args.sample,
        precision_pct: args.precision,
        event_type: args.eventType ?? null,
        channel: 'whatsapp',
      },
    });
  } catch {
    /* fire-and-forget */
  }
}

/**
 * A Pro user sent us an inbound message — credit it as engagement with their
 * most recent alert (within the attribution window). Closes the ledger event
 * with 'action_taken' and logs a whatsapp-surface alert_interaction.
 */
export async function attributeInboundEngagement(args: {
  phone: string;
  userId?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  const sb = args.client ?? admin();
  if (!sb) return;
  try {
    const { data: sess } = await sb
      .from('whatsapp_sessions')
      .select('user_id, last_alert_event_id, last_alert_template, last_alert_at')
      .eq('whatsapp_phone', args.phone)
      .maybeSingle();
    if (!sess?.last_alert_event_id || !sess.last_alert_at) return;
    const ageH = (Date.now() - new Date(sess.last_alert_at as string).getTime()) / 3.6e6;
    if (ageH > ATTRIBUTION_WINDOW_HOURS) return;

    const userId = args.userId ?? (sess.user_id as string | undefined) ?? null;
    await recordOutcome({
      eventId: sess.last_alert_event_id as string,
      userId,
      outcomeKind: 'action_taken',
      outcome: { via: 'whatsapp_inbound' },
    });
    if (userId) {
      void logAlertInteraction({
        userId,
        alertType: (sess.last_alert_template as string) || 'notification',
        alertKey: sess.last_alert_event_id as string,
        action: 'acted',
        surface: 'whatsapp',
        metadata: { event_id: sess.last_alert_event_id },
        client: sb,
      });
    }
  } catch (e) {
    console.warn('[alert-loop] attributeInboundEngagement failed:', (e as Error)?.message ?? e);
  }
}

/** The user opted out (STOP) — record the most recent alert as 'dismissed'. */
export async function recordAlertDismissed(args: {
  phone: string;
  userId?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  const sb = args.client ?? admin();
  if (!sb) return;
  try {
    const { data: sess } = await sb
      .from('whatsapp_sessions')
      .select('user_id, last_alert_event_id, last_alert_template')
      .eq('whatsapp_phone', args.phone)
      .maybeSingle();
    const userId = args.userId ?? (sess?.user_id as string | undefined) ?? null;
    if (sess?.last_alert_event_id) {
      await recordOutcome({
        eventId: sess.last_alert_event_id as string,
        userId,
        outcomeKind: 'dismissed',
        outcome: { via: 'whatsapp_stop' },
      });
    }
    if (userId) {
      void logAlertInteraction({
        userId,
        alertType: (sess?.last_alert_template as string) || 'notification',
        action: 'dismissed',
        surface: 'whatsapp',
        client: sb,
      });
    }
  } catch (e) {
    console.warn('[alert-loop] recordAlertDismissed failed:', (e as Error)?.message ?? e);
  }
}

/** Ingest a Twilio/Meta delivery-status callback into whatsapp_message_log. */
export async function ingestStatusReceipt(args: {
  providerMessageId: string;
  status: string;
  errorCode?: string | null;
  client?: SupabaseClient;
}): Promise<void> {
  const sb = args.client ?? admin();
  if (!sb || !args.providerMessageId) return;
  const now = new Date().toISOString();
  const s = (args.status || '').toLowerCase();
  const patch: Record<string, unknown> = { delivery_status: s };
  if (s === 'delivered') patch.delivered_at = now;
  else if (s === 'read') patch.read_at = now;
  else if (s === 'failed' || s === 'undelivered') {
    patch.failed_at = now;
    if (args.errorCode) patch.error_code = args.errorCode;
  }
  try {
    await sb
      .from('whatsapp_message_log')
      .update(patch)
      .eq('provider_message_id', args.providerMessageId);
  } catch (e) {
    console.warn('[alert-loop] ingestStatusReceipt failed:', (e as Error)?.message ?? e);
  }
}
