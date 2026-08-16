/**
 * WhatsApp adapter — provider selector + thin convenience wrapper.
 *
 * Switch providers via the WHATSAPP_PROVIDER env var ('twilio' | 'meta').
 * Default is 'twilio' so the launch sprint works out of the box.
 *
 * Usage:
 *
 *   import { sendWhatsAppText, sendWhatsAppTemplate } from '@/lib/whatsapp';
 *   await sendWhatsAppText({ to: '+447700900123', text: 'Hello' });
 *
 * Callers never instantiate a provider. Switching from Twilio to Meta is a
 * single env-var flip and a redeploy — no code change needed.
 */

import { MetaCloudWhatsAppProvider } from './meta-provider';
import { TwilioWhatsAppProvider } from './twilio-provider';
import type {
  InboundMessage,
  SendInteractiveOptions,
  SendTemplateOptions,
  SendTextOptions,
  WhatsAppMessageResult,
  WhatsAppProvider,
  WhatsAppProviderName,
} from './types';
import {
  recordAlertSent,
  recordAlertSuppressed,
  shouldSuppressAlert,
} from './alert-loop';
import { decideSend, recordMarketingSend } from './send-policy';
import type { DigestSection } from './alert-queue';
import { createClient } from '@supabase/supabase-js';

let cached: WhatsAppProvider | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  if (cached) return cached;
  const name = (process.env.WHATSAPP_PROVIDER ?? 'twilio') as WhatsAppProviderName;
  cached = name === 'meta' ? new MetaCloudWhatsAppProvider() : new TwilioWhatsAppProvider();
  return cached;
}

/** Test-only: reset the cached provider so tests can inject env changes. */
export function _resetWhatsAppProviderForTesting(): void {
  cached = null;
}

export function sendWhatsAppText(opts: SendTextOptions): Promise<WhatsAppMessageResult> {
  return getWhatsAppProvider().sendText(opts);
}

/**
 * Optional self-learning context for a template send. When omitted,
 * sendWhatsAppTemplate behaves EXACTLY as before (no suppression, no extra
 * writes) — existing callers (Pocket Agent welcome/opt-out, link flow) are
 * unaffected. The unified dispatcher passes it for proactive alerts so the
 * send is measured and low-value non-critical alerts can be suppressed.
 */
export interface AlertContext {
  userId?: string | null;
  /** EVENT_CATALOG event name that triggered the send. */
  eventType?: string;
  /** true → consult the intelligence ledger and skip low-value non-critical
   *  alerts before paying for the send. Critical/cold-start never suppress. */
  suppressible?: boolean;
  /** true → the caller does NOT log its own whatsapp_message_log row (the
   *  unified dispatcher), so record one here for receipts + attribution. */
  logMessage?: boolean;
  /**
   * Plain-text equivalent of the template body. When supplied AND the
   * user is inside the 24h customer-service window we send this as a
   * FREE in-window text instead of paying Meta for the template.
   * Also used as the digest line when the send is deferred.
   */
  textFallback?: string;
  /**
   * Genuinely urgent — bypasses quiet hours and the daily paid-template
   * cap. Use sparingly (£500+ debits, trial about to auto-charge, the
   * consolidated briefs themselves).
   */
  allowUrgent?: boolean;
  /** Stable dedup key used if the send is deferred to the evening digest. */
  dedupKey?: string;
  /** Digest section override (derived from eventType otherwise). */
  digestSection?: DigestSection;
  /** £ magnitude used to rank "top items" within a digest section. */
  amount?: number;
}

function policyAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Record a send in whatsapp_message_log so the daily paid-template cap
 * has something to count. Several call sites also log their own row for
 * the same message; the counter dedups on provider_message_id, so a
 * duplicate row is harmless. Skipped when the unified dispatcher has
 * already been asked to log (ctx.logMessage).
 */
async function logFacadeSend(args: {
  userId: string | null;
  phone: string;
  messageType: 'template' | 'text';
  templateName: string | null;
  providerMessageId?: string;
  eventType?: string;
  preview?: string;
}): Promise<void> {
  const sb = policyAdmin();
  if (!sb) return;
  await sb
    .from('whatsapp_message_log')
    .insert({
      user_id: args.userId,
      whatsapp_phone: args.phone.replace(/^whatsapp:/, ''),
      direction: 'outbound',
      message_type: args.messageType,
      template_name: args.templateName,
      provider: process.env.WHATSAPP_PROVIDER || 'twilio',
      provider_message_id: args.providerMessageId ?? null,
      notification_type: args.eventType ?? null,
      message_text: args.preview ? args.preview.slice(0, 500) : null,
    })
    .then(undefined, () => {
      /* logging must never break the send path */
    });
}

/**
 * THE CHOKEPOINT. Every WhatsApp template send in the codebase goes
 * through here, so the cost/fatigue policy in ./send-policy.ts is
 * applied uniformly:
 *
 *   - free in-window text preferred over a paid template
 *   - max 2 paid templates per user per day (auth/OTP + allowUrgent exempt)
 *   - quiet hours 22:00-07:30 Europe/London deferred
 *   - MARKETING templates blocked without a recorded opt-in
 *
 * Deferred sends are queued for the 18:00 evening digest and return a
 * synthetic result with providerMessageId `deferred:<reason>` — callers
 * that treat a resolved promise as "delivered" keep working, because the
 * item genuinely will be delivered (batched) later the same day.
 */
export async function sendWhatsAppTemplate(
  opts: SendTemplateOptions,
  ctx?: AlertContext,
): Promise<WhatsAppMessageResult> {
  // Self-learning suppression: skip a non-critical alert the ledger has
  // learned is low-value for this template, before we pay Meta for it.
  // consultLedger is conservative — cold-start (<30 sends) and critical
  // templates never suppress. Fail-open inside shouldSuppressAlert.
  if (ctx?.suppressible && ctx.userId) {
    const decision = await shouldSuppressAlert({
      userId: ctx.userId,
      templateName: opts.templateName,
      eventType: ctx.eventType,
    });
    if (decision.suppress) {
      void recordAlertSuppressed({
        userId: ctx.userId,
        templateName: opts.templateName,
        eventType: ctx.eventType,
        reason: decision.reason,
        sample: decision.sample,
        precision: decision.precision,
      });
      return {
        provider: (process.env.WHATSAPP_PROVIDER ?? 'twilio') as WhatsAppProviderName,
        providerMessageId: `suppressed:${decision.reason}`,
        acceptedAt: new Date(),
      };
    }
  }

  // Cost / fatigue policy — window-first, daily cap, quiet hours, marketing.
  const providerName = (process.env.WHATSAPP_PROVIDER ?? 'twilio') as WhatsAppProviderName;
  const decision = await decideSend({
    phone: opts.to,
    templateName: opts.templateName,
    parameters: opts.parameters ?? [],
    userId: ctx?.userId ?? null,
    eventType: ctx?.eventType,
    textFallback: ctx?.textFallback,
    allowUrgent: ctx?.allowUrgent,
    dedupKey: ctx?.dedupKey,
    digestSection: ctx?.digestSection,
    amount: ctx?.amount,
  });

  if (decision.action === 'block') {
    console.warn(
      `[whatsapp] blocked ${opts.templateName} for ${decision.userId ?? 'unknown user'}: ${decision.reason}`,
    );
    return {
      provider: providerName,
      providerMessageId: `blocked:${decision.reason}`,
      acceptedAt: new Date(),
    };
  }

  if (decision.action === 'defer') {
    return {
      provider: providerName,
      providerMessageId: `deferred:${decision.reason}`,
      acceptedAt: new Date(),
    };
  }

  if (decision.action === 'text' && decision.text) {
    // FREE send inside the 24h customer-service window — no Meta fee and
    // it does NOT count against the daily paid-template cap.
    const textResult = await getWhatsAppProvider().sendText({
      to: opts.to,
      text: decision.text,
    });
    await logFacadeSend({
      userId: decision.userId,
      phone: opts.to,
      messageType: 'text',
      templateName: null,
      providerMessageId: textResult.providerMessageId,
      eventType: ctx?.eventType,
      preview: decision.text,
    });
    // Still measured by the self-learning loop. logMessage stays false so
    // recordAlertSent doesn't write a 'template' row for a free text send.
    void recordAlertSent({
      userId: decision.userId,
      eventType: ctx?.eventType,
      providerMessageId: textResult.providerMessageId,
      phone: opts.to,
      templateName: opts.templateName,
      logMessage: false,
    });
    return textResult;
  }

  const result = await getWhatsAppProvider().sendTemplate(opts);

  if (!ctx?.logMessage) {
    // Nobody else is guaranteed to log this paid send — record it so the
    // daily cap can count it. Duplicate rows from callers that log their
    // own are deduped by provider_message_id in the counter.
    await logFacadeSend({
      userId: decision.userId,
      phone: opts.to,
      messageType: 'template',
      templateName: opts.templateName,
      providerMessageId: result.providerMessageId,
      eventType: ctx?.eventType,
      preview: (opts.parameters ?? []).join(' | '),
    });
  }

  if (decision.userId && decision.reason.startsWith('marketing')) {
    void recordMarketingSend(decision.userId);
  }

  // Measure the send (fire-and-forget; never blocks or throws). Non-alert
  // templates (welcome/opt-out/OTP/agent-reply) are ignored inside the helper.
  void recordAlertSent({
    userId: ctx?.userId ?? decision.userId,
    eventType: ctx?.eventType,
    providerMessageId: result.providerMessageId,
    phone: opts.to,
    templateName: opts.templateName,
    logMessage: ctx?.logMessage ?? false,
  });

  return result;
}

/**
 * Send a free-form interactive message with up to 3 quick-reply buttons.
 *
 * 24h window only — callers must check via `isWithinSessionWindow(userId)`
 * before invoking this for an outbound that isn't an immediate reply to
 * an inbound. The Pocket Agent calling sites are all within the window by
 * construction (responding seconds after an inbound), so they don't need
 * the check; cron alert sites do.
 *
 * Tap payloads come back through the webhook as `kind='interactive'` with
 * the button title lifted into `text` and the button id in
 * `interactivePayload` — same routing as a normal user message, no
 * special handling needed in the agent.
 */
export function sendWhatsAppInteractive(
  opts: SendInteractiveOptions,
): Promise<WhatsAppMessageResult> {
  return getWhatsAppProvider().sendInteractive(opts);
}

export function verifyWhatsAppWebhook(
  rawBody: string,
  headers: Record<string, string>,
): boolean {
  return getWhatsAppProvider().verifyWebhookSignature(rawBody, headers);
}

export function parseWhatsAppWebhook(rawBody: string): InboundMessage[] {
  return getWhatsAppProvider().parseWebhook(rawBody);
}

export type {
  InboundMessage,
  WhatsAppMessageResult,
  SendTextOptions,
  SendTemplateOptions,
  SendInteractiveOptions,
};
