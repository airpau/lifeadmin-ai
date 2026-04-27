/**
 * Provider-agnostic WhatsApp types.
 *
 * Both Twilio and Meta WhatsApp Business API implement the same surface so
 * callers (cron jobs, alert handlers, the user-bot) never need to know which
 * provider is in use. Switch via the WHATSAPP_PROVIDER env var.
 */

export type WhatsAppProviderName = 'twilio' | 'meta';

export interface WhatsAppMessageResult {
  /** Provider-specific message ID, persisted to whatsapp_message_log for delivery reconciliation. */
  providerMessageId: string;
  /** Which provider actually sent the message. */
  provider: WhatsAppProviderName;
  /** UTC timestamp of acceptance by the provider (not delivery confirmation). */
  acceptedAt: Date;
}

export interface SendTextOptions {
  /** Recipient in E.164 format, e.g. "+447700900123". */
  to: string;
  /** Plain-text body (max 4096 chars). */
  text: string;
  /** Optional: idempotency key so retries do not double-send. */
  idempotencyKey?: string;
}

export interface SendTemplateOptions {
  to: string;
  /** Template name as registered in whatsapp_message_templates. */
  templateName: string;
  /** Positional parameters that fill {{1}}, {{2}}, etc. in the template body. */
  parameters: string[];
  languageCode?: string; // defaults to 'en_GB'
  idempotencyKey?: string;
}

export interface InboundMessage {
  /** Sender phone in E.164 format. */
  from: string;
  /** WhatsApp display name (may be undefined for unsaved contacts). */
  displayName?: string;
  /** The message body (text only — media handled separately later). */
  text: string;
  /** Provider's message ID for the inbound message, used for read-receipts and dedupe. */
  providerMessageId: string;
  /** When the user actually sent the message (provider-reported, may lag). */
  sentAt: Date;
  /** Which provider received this message. */
  provider: WhatsAppProviderName;
}

export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  sendText(opts: SendTextOptions): Promise<WhatsAppMessageResult>;
  sendTemplate(opts: SendTemplateOptions): Promise<WhatsAppMessageResult>;
  /**
   * Verify an inbound webhook signature against the provider's secret.
   * Returns true if the signature is valid. Used by /api/whatsapp/webhook.
   */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean;
  /**
   * Parse a verified webhook payload into normalised InboundMessage objects.
   * Different providers have radically different payload shapes — this hides
   * that from the rest of the app.
   */
  parseWebhook(rawBody: string): InboundMessage[];
}
