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

/**
 * What kind of inbound this is. The webhook routes on `kind`:
 *   - 'text'         — plain user text, hand off to the Claude tool-use brain.
 *   - 'interactive'  — the user tapped a quick-reply button or list item on a
 *                      previous template. Twilio collapses both into a text
 *                      payload (`ButtonText` / `OriginalRepliedMessage`); Meta
 *                      sends `interactive.button_reply` / `list_reply`. Either
 *                      way we lift the human-readable label into `text` and
 *                      route through the agent — the agent treats it like the
 *                      user typed the label themselves, which is exactly the
 *                      semantics we want.
 *   - 'media'        — photo / video / document / audio / sticker. We don't
 *                      yet parse bills from images, so the webhook sends a
 *                      polite "I can't read attachments yet" reply and logs
 *                      the media URL + mime for later analysis. Captions, if
 *                      present, are still surfaced as `text`.
 *   - 'location'     — a shared pin. Same handling as media for now.
 *   - 'unsupported'  — provider parsed the envelope but we don't know the
 *                      type (sticker reaction, contact card, etc.). Reply
 *                      with the same fallback, never crash.
 */
export type InboundMessageKind =
  | 'text'
  | 'interactive'
  | 'media'
  | 'location'
  | 'unsupported';

/** Sub-type of a media inbound, used to pick the right fallback wording. */
export type InboundMediaType =
  | 'image'
  | 'video'
  | 'audio' // includes voice notes (Meta calls them 'voice', Twilio reports audio/ogg)
  | 'document'
  | 'sticker';

export interface InboundMessage {
  /** Sender phone in E.164 format. */
  from: string;
  /** WhatsApp display name (may be undefined for unsaved contacts). */
  displayName?: string;
  /**
   * The message body. For text/interactive this is what the user said (or the
   * label they tapped). For media this is the caption, if any (empty string
   * otherwise — the webhook decides what fallback to send).
   */
  text: string;
  /** Provider's message ID for the inbound message, used for read-receipts and dedupe. */
  providerMessageId: string;
  /** When the user actually sent the message (provider-reported, may lag). */
  sentAt: Date;
  /** Which provider received this message. */
  provider: WhatsAppProviderName;

  /** What kind of inbound this is. Defaults to 'text' for back-compat. */
  kind?: InboundMessageKind;
  /** For kind='media': the specific media sub-type. */
  mediaType?: InboundMediaType;
  /**
   * For kind='media': URL to the media. Twilio serves it directly behind
   * Basic auth (use the account creds); Meta returns a media ID that needs a
   * second Graph API round-trip — we store the ID here and dereference lazily
   * if/when we wire OCR.
   */
  mediaUrl?: string;
  /** For kind='media': MIME type as reported by the provider. */
  mediaMimeType?: string;
  /** For kind='interactive': the payload/ID behind the button (Meta only). */
  interactivePayload?: string;
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
