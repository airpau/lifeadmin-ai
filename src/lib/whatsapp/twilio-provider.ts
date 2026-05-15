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
import { TEMPLATES, PENDING_RESUBMISSION, type TemplateName } from './template-registry';
import type {
  InboundMediaType,
  InboundMessage,
  InboundMessageKind,
  SendInteractiveOptions,
  SendTemplateOptions,
  SendTextOptions,
  WhatsAppMessageResult,
  WhatsAppProvider,
} from './types';

// Twilio's quick-reply Content type caps button titles at 25 chars; we
// clip below this so we never bounce the create-content API.
const TWILIO_BUTTON_TITLE_MAX = 24;
const TWILIO_MAX_BUTTONS = 3;

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
    // Runtime-mutable DB SID (whatsapp_template_sids) takes priority over the
    // registry's compile-time fallback. Returns null when the template isn't
    // approved — in which case we still try the registry as a last-ditch
    // fallback (covers templates approved before the dynamic-SID layer).
    const { getTemplateSid } = await import('./template-sids');
    const dbSid = await getTemplateSid(opts.templateName);
    const registry = (TEMPLATES as Record<string, { sid: string }>)[opts.templateName as TemplateName];
    // Reject the registry's `PENDING_RESUBMISSION` placeholder — it's not a
    // valid Twilio ContentSid. Without this guard the provider would POST the
    // literal string "PENDING_RESUBMISSION" and Twilio would 400. Callers
    // upstream rely on this throwing a clean error rather than skipping
    // pre-emptively, so we never attempt the send when the only candidate
    // SID is the placeholder.
    const registrySid =
      registry?.sid && registry.sid !== PENDING_RESUBMISSION ? registry.sid : undefined;
    const contentSid = envOverride || dbSid || registrySid;
    const from = requireEnv('TWILIO_WHATSAPP_FROM');

    if (!contentSid && registry?.sid === PENDING_RESUBMISSION) {
      throw new Error(
        `[whatsapp/twilio] template "${opts.templateName}" is pending Meta resubmission — set TWILIO_TEMPLATE_${opts.templateName.toUpperCase()} or update whatsapp_template_sids to send.`,
      );
    }

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

  async sendInteractive(
    opts: SendInteractiveOptions,
  ): Promise<WhatsAppMessageResult> {
    // Twilio doesn't let us send arbitrary inline buttons — every quick-
    // reply set lives behind a pre-created Content SID (`twilio/quick-reply`
    // type). SID resolution order:
    //   1. Explicit opts.interactiveContentSid (caller supplied)
    //   2. Env override TWILIO_INTERACTIVE_<NAME> (lets ops swap SIDs
    //      without a deploy, e.g. when a button label changes)
    //   3. Numbered-text fallback (no SID configured yet)
    //
    // The fallback is what makes this useful in practice: the cron alerts
    // that *should* carry buttons (price-increase, outcome-check) often
    // run before ops has created the matching Content SID. Numbered text
    // still gets the choices in front of the user, and the agent's
    // numbered-reply intelligence (793a345c on master) maps "1" / "2" /
    // "3" back to the right action.
    const buttons = opts.buttons.slice(0, TWILIO_MAX_BUTTONS);
    if (buttons.length === 0) {
      throw new Error('[whatsapp/twilio] sendInteractive requires at least one button');
    }
    const envOverride = opts.interactiveName
      ? process.env[`TWILIO_INTERACTIVE_${opts.interactiveName.toUpperCase()}`]
      : undefined;
    const contentSid = opts.interactiveContentSid || envOverride;
    const from = requireEnv('TWILIO_WHATSAPP_FROM');

    if (contentSid) {
      // Content variables shape: {{1}} = body, {{2..N+1}} = button titles
      // in declaration order. This must match the Content shape ops
      // configured at content.twilio.com.
      const vars: Record<string, string> = { '1': opts.text };
      buttons.forEach((b, i) => {
        vars[String(i + 2)] = b.title.slice(0, TWILIO_BUTTON_TITLE_MAX);
      });
      const params: Record<string, string> = {
        From: toWhatsAppAddress(from),
        To: toWhatsAppAddress(opts.to),
        ContentSid: contentSid,
        ContentVariables: JSON.stringify(vars),
      };
      const res = await postForm('/Messages.json', params);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `[whatsapp/twilio] sendInteractive failed ${res.status}: ${body}`,
        );
      }
      const data = (await res.json()) as { sid: string; date_created: string };
      return {
        provider: 'twilio',
        providerMessageId: data.sid,
        acceptedAt: new Date(data.date_created || Date.now()),
      };
    }

    // Numbered-text fallback. Inbound parser tags `text` taps as kind='text',
    // so the agent's existing brain handles "1" / "2" naturally.
    const numbered = buttons
      .map(
        (b, i) => `${i + 1}. ${b.title.slice(0, TWILIO_BUTTON_TITLE_MAX)}`,
      )
      .join('\n');
    return this.sendText({
      to: opts.to,
      text: `${opts.text}\n\n${numbered}\n\nReply with the number.`,
      idempotencyKey: opts.idempotencyKey,
    });
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
    // Twilio inbound is form-encoded. One message per request. The shape varies
    // by content type:
    //   - Plain text:           Body
    //   - Media (image/audio):  Body (caption, may be empty) + NumMedia=N +
    //                           MediaUrl0..N-1 + MediaContentType0..N-1
    //   - Quick reply button:   Body=<button label> + ButtonText=<same> +
    //                           OriginalRepliedMessageSid (the template msg
    //                           the button was attached to). Twilio collapses
    //                           the tap into a normal text inbound — we still
    //                           tag it as 'interactive' so the webhook can log
    //                           it accurately and we have a hook for future
    //                           payload-aware routing.
    const params = new URLSearchParams(rawBody);
    const from = params.get('From');
    const sid = params.get('MessageSid');
    if (!from || !sid) return [];

    const text = params.get('Body') ?? '';
    const numMedia = parseInt(params.get('NumMedia') ?? '0', 10);
    const buttonText = params.get('ButtonText');
    const originalReplied = params.get('OriginalRepliedMessageSid');

    const base = {
      from: fromWhatsAppAddress(from),
      displayName: params.get('ProfileName') ?? undefined,
      providerMessageId: sid,
      sentAt: new Date(),
      provider: 'twilio' as const,
    };

    if (numMedia > 0) {
      // We only inspect the first media item — Twilio supports up to 10
      // per message but the agent can't process any of them yet, so the
      // count doesn't matter; we just need enough metadata to log it and
      // tell the user.
      const mediaUrl = params.get('MediaUrl0') ?? undefined;
      const mime = params.get('MediaContentType0') ?? undefined;
      const mediaType = mediaTypeFromMime(mime);
      return [
        {
          ...base,
          text, // caption, may be empty
          kind: 'media' as InboundMessageKind,
          mediaType,
          mediaUrl,
          mediaMimeType: mime,
        },
      ];
    }

    // Interactive: Twilio sets ButtonText when a quick-reply was tapped, and
    // OriginalRepliedMessageSid when the user replied to a specific message.
    // Either signal is enough to mark this as interactive — we still pass the
    // label through `text` so the Claude brain sees what the user "said".
    if (buttonText || originalReplied) {
      return [
        {
          ...base,
          text: text || buttonText || '',
          kind: 'interactive' as InboundMessageKind,
          interactivePayload: buttonText ?? undefined,
        },
      ];
    }

    return [
      {
        ...base,
        text,
        kind: 'text' as InboundMessageKind,
      },
    ];
  }
}

function mediaTypeFromMime(mime?: string | null): InboundMediaType | undefined {
  if (!mime) return undefined;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  // application/pdf, application/msword, text/plain, etc.
  return 'document';
}
