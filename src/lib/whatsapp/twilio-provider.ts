/**
 * Twilio WhatsApp provider.
 *
 * Use this in the 14-day launch sprint because Twilio's WhatsApp sandbox is
 * usable in 30 minutes (no Meta App Review). Production-ready Twilio numbers
 * cost ~$0.005 per message and require a one-time $1k registration via Twilio
 * Senders, but the sandbox is free and fine for the first 10 beta users.
 *
 * REST API ref: https://www.twilio.com/docs/whatsapp/api
 * Webhook signature ref: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */

import crypto from 'node:crypto';
import { TEMPLATES, type TemplateName } from './template-registry';
import type {
  InboundMessage,
  SendTemplateOptions,
  SendTextOptions,
  WhatsAppMessageResult,
  WhatsAppProvider,
} from './types';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[whatsapp/twilio] missing env: ${name}`);
  return v;
}

function toWhatsAppAddress(phone: string): string {
  // Twilio expects "whatsapp:+447700900123" format on both sides.
  return phone.startsWith('whatsapp:') ? phone : `whatsapp:${phone}`;
}

function fromWhatsAppAddress(addr: string): string {
  return addr.replace(/^whatsapp:/, '');
}

async function postForm(path: string, params: Record<string, string>): Promise<Response> {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  return fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
}

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'twilio' as const;

  async sendText(opts: SendTextOptions): Promise<WhatsAppMessageResult> {
    const from = requireEnv('TWILIO_WHATSAPP_FROM'); // e.g. "whatsapp:+14155238886" sandbox
    const params: Record<string, string> = {
      From: toWhatsAppAddress(from),
      To: toWhatsAppAddress(opts.to),
      Body: opts.text,
    };
    const res = await postForm('/Messages.json', params);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[whatsapp/twilio] sendText failed ${res.status}: ${body}`);
    }
    const data = (await res.json()) as { sid: string; date_created: string };
    return {
      provider: 'twilio',
      providerMessageId: data.sid,
      acceptedAt: new Date(data.date_created || Date.now()),
    };
  }

  async sendTemplate(opts: SendTemplateOptions): Promise<WhatsAppMessageResult> {
    // SID resolution order:
    //   1. Env-var override (TWILIO_TEMPLATE_<NAME>) — lets ops pin to a
    //      specific SID without a code deploy if Meta force-resubmits one.
    //   2. The template-registry — the 16 approved templates' canonical SIDs
    //      live there. Without this fallback every new caller needed an env
    //      var, which silently broke production sends.
    const envOverride = process.env[`TWILIO_TEMPLATE_${opts.templateName.toUpperCase()}`];
    const registry = (TEMPLATES as Record<string, { sid: string }>)[opts.templateName as TemplateName];
    const contentSid = envOverride || registry?.sid;
    const from = requireEnv('TWILIO_WHATSAPP_FROM');

    if (contentSid) {
      const params: Record<string, string> = {
        From: toWhatsAppAddress(from),
        To: toWhatsAppAddress(opts.to),
        ContentSid: contentSid,
        ContentVariables: JSON.stringify(
          opts.parameters.reduce<Record<string, string>>((acc, val, i) => {
            acc[String(i + 1)] = val;
            return acc;
          }, {}),
        ),
      };
      const res = await postForm('/Messages.json', params);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`[whatsapp/twilio] sendTemplate failed ${res.status}: ${body}`);
      }
      const data = (await res.json()) as { sid: string; date_created: string };
      return {
        provider: 'twilio',
        providerMessageId: data.sid,
        acceptedAt: new Date(data.date_created || Date.now()),
      };
    }

    // Sandbox fallback: literal substitution
    let body = opts.templateName;
    opts.parameters.forEach((val, i) => {
      body = body.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val);
    });
    return this.sendText({ to: opts.to, text: body, idempotencyKey: opts.idempotencyKey });
  }

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    // Twilio signs webhooks via X-Twilio-Signature: HMAC-SHA1 of (url + sorted body params), base64.
    // For form-encoded webhook bodies. We accept either x-twilio-signature or X-Twilio-Signature.
    const signature =
      headers['x-twilio-signature'] || headers['X-Twilio-Signature'];
    if (!signature) return false;

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const webhookUrl = process.env.TWILIO_WEBHOOK_URL; // full https URL to /api/whatsapp/webhook
    if (!authToken || !webhookUrl) return false;

    // Parse the form body into a sorted key=value concatenation appended to URL.
    const params = new URLSearchParams(rawBody);
    const sortedKeys = [...params.keys()].sort();
    const data =
      webhookUrl + sortedKeys.map((k) => `${k}${params.get(k) ?? ''}`).join('');

    const expected = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    // Constant-time compare
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  parseWebhook(rawBody: string): InboundMessage[] {
    // Twilio inbound is form-encoded. One message per request.
    const params = new URLSearchParams(rawBody);
    const from = params.get('From');
    const text = params.get('Body');
    const sid = params.get('MessageSid');
    if (!from || !sid) return [];
    return [
      {
        from: fromWhatsAppAddress(from),
        displayName: params.get('ProfileName') ?? undefined,
        text: text ?? '',
        providerMessageId: sid,
        sentAt: new Date(),
        provider: 'twilio',
      },
    ];
  }
}
