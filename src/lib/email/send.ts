/**
 * Canonical Resend send wrapper. Every outbound email goes through here.
 *
 * - Renders via `renderPaybackerEmail()` so visual chrome is identical everywhere.
 * - Picks the correct From / Reply-To based on `audience` (consumer vs B2B).
 * - Adds RFC 8058 one-click List-Unsubscribe headers automatically when
 *   `variant: 'marketing'` is requested and an `unsubscribeUrl` is provided.
 *
 * Direct callers of `resend.emails.send(...)` are being migrated to this helper.
 * If you find one that hasn't been, prefer migrating it over duplicating boilerplate.
 */

import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import {
  renderPaybackerEmail,
  type EmailCta,
  type EmailVariant,
  type RenderEmailInput,
} from './PaybackerEmailLayout';

const FROM_B2B = process.env.RESEND_FROM_EMAIL_B2B || 'Paybacker for Business <noreply@paybacker.co.uk>';
// IMPORTANT: per src/lib/resend.ts, the apex paybacker.co.uk domain is SEND-ONLY in
// Resend (receiving disabled). Replies routed to `business@paybacker.co.uk` would be
// silently dropped. The receiving-enabled domain is `mail.paybacker.co.uk`, so the
// B2B reply-to mirrors the consumer pattern (`support@mail.paybacker.co.uk`) and
// uses the `business@mail.paybacker.co.uk` mailbox there. Override at deploy-time
// via `RESEND_REPLY_TO_B2B` if the apex is ever flipped to receiving=enabled.
const REPLY_TO_B2B = process.env.RESEND_REPLY_TO_B2B || 'business@mail.paybacker.co.uk';

export type EmailAudience = 'consumer' | 'b2b';

export interface SendPaybackerEmailInput extends RenderEmailInput {
  to: string | string[];
  subject: string;
  audience?: EmailAudience;
  /** Override From for special senders (e.g. founder personal). */
  from?: string;
  /** Override Reply-To. */
  replyTo?: string;
  /** Optional plain-text alternative. Strongly recommended for marketing variant. */
  text?: string;
  /** Extra Resend headers (merged with auto-injected List-Unsubscribe). */
  headers?: Record<string, string>;
  /** Optional Resend tags for analytics. */
  tags?: { name: string; value: string }[];
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Thrown when a `variant: 'marketing'` send is attempted without an
 * `unsubscribeUrl`. Marketing emails MUST carry a tokenised one-click
 * unsubscribe URL — without it, the layout has no valid footer link and
 * the RFC 8058 `List-Unsubscribe` headers can't be set, which is both a
 * compliance break (PECR / CAN-SPAM) and a deliverability hit.
 */
export class MissingUnsubscribeUrlError extends Error {
  constructor() {
    super(
      'sendPaybackerEmail: variant "marketing" requires a tokenised unsubscribeUrl. ' +
        'Generate a per-recipient token (see src/app/api/unsubscribe/route.ts) and ' +
        'pass `${SITE}/api/unsubscribe?token=...`.',
    );
    this.name = 'MissingUnsubscribeUrlError';
  }
}

export async function sendPaybackerEmail(input: SendPaybackerEmailInput): Promise<SendResult> {
  const audience: EmailAudience = input.audience ?? (input.variant === 'b2b' ? 'b2b' : 'consumer');
  const variant: EmailVariant = input.variant ?? (audience === 'b2b' ? 'b2b' : 'standard');

  if (variant === 'marketing' && !input.unsubscribeUrl) {
    throw new MissingUnsubscribeUrlError();
  }

  const html = renderPaybackerEmail({
    preheader: input.preheader,
    heading: input.heading,
    intro: input.intro,
    body: input.body,
    cta: input.cta,
    variant,
    unsubscribeUrl: input.unsubscribeUrl,
    footnote: input.footnote,
  });

  const headers: Record<string, string> = { ...(input.headers ?? {}) };
  if (variant === 'marketing' && !headers['List-Unsubscribe']) {
    // unsubscribeUrl is guaranteed by the throw above for marketing variant.
    headers['List-Unsubscribe'] = `<${input.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  const from = input.from ?? (audience === 'b2b' ? FROM_B2B : FROM_EMAIL);
  const replyTo = input.replyTo ?? (audience === 'b2b' ? REPLY_TO_B2B : REPLY_TO);

  try {
    const result = await resend.emails.send({
      from,
      to: input.to,
      replyTo,
      subject: input.subject,
      html,
      ...(input.text ? { text: input.text } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    });
    const err = (result as { error?: { message?: string } }).error;
    if (err) return { ok: false, error: err.message };
    const messageId = (result as { data?: { id?: string } }).data?.id;
    return { ok: true, messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type { EmailCta };
