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
  SendTemplateOptions,
  SendTextOptions,
  WhatsAppMessageResult,
  WhatsAppProvider,
  WhatsAppProviderName,
} from './types';

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

export function sendWhatsAppTemplate(
  opts: SendTemplateOptions,
): Promise<WhatsAppMessageResult> {
  return getWhatsAppProvider().sendTemplate(opts);
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

export type { InboundMessage, WhatsAppMessageResult, SendTextOptions, SendTemplateOptions };
