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
}

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

  const result = await getWhatsAppProvider().sendTemplate(opts);

  // Measure the send (fire-and-forget; never blocks or throws). Non-alert
  // templates (welcome/opt-out/OTP/agent-reply) are ignored inside the helper.
  void recordAlertSent({
    userId: ctx?.userId ?? null,
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
