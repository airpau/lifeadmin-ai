/**
 * Meta WhatsApp Business API (Cloud API) provider.
 *
 * Use this once Meta verification + WhatsApp Business product approval are
 * complete (typically 2-6 weeks from a clean start). Cheaper at scale than
 * Twilio (~£0.012 per business-initiated conversation in the UK, with 1k
 * service conversations/month free) and gives direct access to interactive
 * message types (buttons, lists) without Twilio's middleware abstractions.
 *
 * Cloud API ref: https://developers.facebook.com/docs/whatsapp/cloud-api
 * Webhook signature ref: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */

import crypto from 'node:crypto';
import type {
  InboundMessage,
  SendTemplateOptions,
  SendTextOptions,
  WhatsAppMessageResult,
  WhatsAppProvider,
} from './types';

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[whatsapp/meta] missing env: ${name}`);
  return v;
}

function normalisePhone(phone: string): string {
  // Meta wants E.164 without the leading "+".
  return phone.replace(/^\+/, '');
}

async function postGraph(path: string, body: unknown): Promise<Response> {
  const token = requireEnv('WHATSAPP_API_TOKEN');
  return fetch(`${GRAPH_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

interface MetaSendResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta' as const;

  async sendText(opts: SendTextOptions): Promise<WhatsAppMessageResult> {
    const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
    const res = await postGraph(`/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: normalisePhone(opts.to),
      type: 'text',
      text: { body: opts.text, preview_url: false },
    });
    const data = (await res.json()) as MetaSendResponse;
    if (!res.ok || !data.messages?.[0]?.id) {
      throw new Error(
        `[whatsapp/meta] sendText failed ${res.status}: ${data.error?.message ?? 'unknown'}`,
      );
    }
    return {
      provider: 'meta',
      providerMessageId: data.messages[0].id,
      acceptedAt: new Date(),
    };
  }

  async sendTemplate(opts: SendTemplateOptions): Promise<WhatsAppMessageResult> {
    const phoneNumberId = requireEnv('WHATSAPP_PHONE_NUMBER_ID');
    const res = await postGraph(`/${phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      to: normalisePhone(opts.to),
      type: 'template',
      template: {
        name: opts.templateName,
        language: { code: opts.languageCode ?? 'en_GB' },
        components: opts.parameters.length
          ? [
              {
                type: 'body',
                parameters: opts.parameters.map((text) => ({ type: 'text', text })),
              },
            ]
          : undefined,
      },
    });
    const data = (await res.json()) as MetaSendResponse;
    if (!res.ok || !data.messages?.[0]?.id) {
      throw new Error(
        `[whatsapp/meta] sendTemplate failed ${res.status}: ${data.error?.message ?? 'unknown'}`,
      );
    }
    return {
      provider: 'meta',
      providerMessageId: data.messages[0].id,
      acceptedAt: new Date(),
    };
  }

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    // Meta signs webhooks with X-Hub-Signature-256: sha256=<hex>
    const sigHeader =
      headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];
    if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;

    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) return false;

    const expected = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody, 'utf-8')
      .digest('hex');

    const provided = sigHeader.slice('sha256='.length);
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
    } catch {
      return false;
    }
  }

  parseWebhook(rawBody: string): InboundMessage[] {
    // Meta sends JSON. Multiple messages possible per request.
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return [];
    }
    const messages: InboundMessage[] = [];
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const contactName: string | undefined = value?.contacts?.[0]?.profile?.name;
        for (const m of value?.messages ?? []) {
          if (m?.type !== 'text') continue; // ignore media for now
          messages.push({
            from: `+${m.from}`,
            displayName: contactName,
            text: m?.text?.body ?? '',
            providerMessageId: m.id,
            sentAt: new Date((Number(m.timestamp) || Date.now() / 1000) * 1000),
            provider: 'meta',
          });
        }
      }
    }
    return messages;
  }
}

/**
 * Webhook verification (GET) — Meta sends a challenge during initial setup.
 * Call this from the GET handler in /api/whatsapp/webhook/route.ts.
 */
export function verifyMetaWebhookChallenge(searchParams: URLSearchParams): string | null {
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return challenge;
  }
  return null;
}
