/**
 * Consumer abandonment nurture email templates — migrated to canonical
 * PaybackerEmailLayout (2026-05-01).
 *
 * Sequence:
 *   1. Soft reminder           ~T+1h     transactional-leaning
 *   2. Value nudge             ~T+24h    soft opt-in marketing
 *   3. 10% discount + code     ~T+72h    soft opt-in marketing
 *   4. Final / code expiring   ~T+7d     soft opt-in marketing
 *
 * Lawful basis: PECR reg. 22(3) "soft opt-in" — recipient gave details during
 * sale-negotiation (Stripe checkout / pricing page subscribe), marketing relates
 * to similar products, one-click unsubscribe in every footer (handled by the
 * canonical layout when `variant: 'marketing'` + `unsubscribeUrl` are set).
 */

import { sendPaybackerEmail } from './send';
import {
  renderPaybackerEmail,
  card,
  paragraph,
  unorderedList,
} from './PaybackerEmailLayout';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

export type NurtureTemplate =
  | 'email_1_soft_reminder'
  | 'email_2_value_nudge'
  | 'email_3_discount'
  | 'email_4_final';

export const SUBJECT_LINES: Record<NurtureTemplate, (tier: string) => string> = {
  email_1_soft_reminder: () => 'Did you forget something?',
  email_2_value_nudge:   (tier) => `Why most LifeAdmin users pick ${tier}`,
  email_3_discount:      () => 'A small thank-you: 10% off LifeAdmin (7 days)',
  email_4_final:         () => 'Last call — your 10% code expires soon',
};

export interface NurtureContext {
  email: string;
  name: string | null;
  intendedTier: 'essential' | 'pro' | null;
  intendedBillingInterval: 'monthly' | 'yearly' | null;
  unsubscribeToken: string;
  /** Only set for email_3 / email_4 */
  promoCode?: string;
  /** Only set for email_3 / email_4 */
  promoExpiresAt?: Date;
  /** Stripe-provided recovery URL if available, else generic /pricing */
  recoveryUrl?: string;
}

function tierName(t: 'essential' | 'pro' | null): string {
  if (t === 'pro') return 'Pro';
  if (t === 'essential') return 'Essential';
  return 'LifeAdmin';
}

function tierPrice(t: 'essential' | 'pro' | null): string {
  if (t === 'pro') return '£9.99/month';
  if (t === 'essential') return '£4.99/month';
  return 'a paid plan';
}

function unsubUrl(token: string): string {
  return `${SITE}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

function ctaUrl(ctx: NurtureContext): string {
  return ctx.recoveryUrl || `${SITE}/pricing`;
}

function firstName(name: string | null): string {
  if (!name) return 'there';
  return name.split(' ')[0];
}

const codeBoxStyle = `background:#0B1220;color:#FFFFFF;border-radius:12px;padding:18px 24px;margin:20px 0;text-align:center;font-family:Menlo,Monaco,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:2px;`;

interface BuiltEmail {
  preheader: string;
  heading: string;
  intro?: string;
  body: string;
  cta?: { label: string; href: string };
  text: string;
}

function build(template: NurtureTemplate, ctx: NurtureContext): BuiltEmail {
  const tn = tierName(ctx.intendedTier);
  const fn = firstName(ctx.name);
  const url = ctaUrl(ctx);
  const unsub = unsubUrl(ctx.unsubscribeToken);

  if (template === 'email_1_soft_reminder') {
    return {
      preheader: 'Pick up where you left off',
      heading: `Hi ${fn} — did you forget something?`,
      intro: `You started signing up for <strong>${tn}</strong> on Paybacker but didn't quite finish. Totally understandable — life gets busy.`,
      body: [
        paragraph("If you'd like to pick up where you left off, you can finish in under a minute."),
        paragraph("If this wasn't you, just ignore this email — no account was created.", { muted: true }),
        paragraph('— The Paybacker team'),
      ].join('\n'),
      cta: { label: `Finish setting up ${tn}`, href: url },
      text: [
        `Hi ${fn},`,
        ``,
        `You started signing up for ${tn} on Paybacker but didn't quite finish.`,
        `Pick up where you left off: ${url}`,
        ``,
        `If this wasn't you, just ignore this email — no account was created.`,
        ``,
        `— The Paybacker team`,
        `Unsubscribe: ${unsub}`,
      ].join('\n'),
    };
  }

  if (template === 'email_2_value_nudge') {
    const isPro = ctx.intendedTier === 'pro';
    const bullets = isPro
      ? [
          'Unlimited bill scanning and complaint letters',
          'AI-drafted ombudsman escalations when companies ignore you',
          'Auto-cancellation emails for unused subscriptions',
          'Bank-linked overcharge detection across every direct debit',
        ]
      : [
          'Unlimited bill scanning — never miss a refund opportunity',
          'AI complaint letters drafted in your voice',
          'Subscription tracker that flags price hikes and unused services',
          'UK consumer-rights references baked into every letter',
        ];
    return {
      preheader: `Why ${tn} pays for itself`,
      heading: `Hi ${fn} — here's why ${tn} pays for itself`,
      intro: 'When we ask paying members what made the difference, the same handful of things come up:',
      body: [
        card(unorderedList(bullets), { eyebrow: 'What members value most' }),
        paragraph(
          `The average member recovers £${isPro ? '180' : '90'}+ in their first 90 days. ${tn} costs ${tierPrice(ctx.intendedTier)} — usually paid back inside a month.`,
        ),
        paragraph('Got a question first? Just reply — a real person reads every reply.', { muted: true }),
        paragraph('— The Paybacker team'),
      ].join('\n'),
      cta: { label: `Get started with ${tn}`, href: url },
      text: [
        `Hi ${fn},`,
        ``,
        `Here's why ${tn} pays for itself:`,
        ...bullets.map((b) => `  • ${b}`),
        ``,
        `Average member recovers £${isPro ? '180' : '90'}+ in their first 90 days.`,
        `${tn}: ${tierPrice(ctx.intendedTier)} — usually paid back inside a month.`,
        ``,
        `Get started: ${url}`,
        ``,
        `— The Paybacker team`,
        `Unsubscribe: ${unsub}`,
      ].join('\n'),
    };
  }

  if (template === 'email_3_discount') {
    const code = ctx.promoCode ?? 'WELCOME10';
    const exp = ctx.promoExpiresAt
      ? ctx.promoExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
      : '7 days';
    return {
      preheader: `10% off ${tn}, single-use, expires ${exp}`,
      heading: `Hi ${fn} — a small thank-you`,
      intro: `We don't normally do discounts, but you've been on our list for a few days and we'd love to have you on board. Here's <strong>10% off your first month of ${tn}</strong>:`,
      body: [
        `<div style="${codeBoxStyle}">${code}</div>`,
        paragraph(`Paste this code on the checkout page. Expires ${exp}.`, { muted: true }),
        paragraph(
          "This is a one-time, single-use code — once redeemed it's gone. No catches, no auto-renewing premium-tier nonsense.",
        ),
        paragraph('— The Paybacker team'),
      ].join('\n'),
      cta: { label: 'Redeem 10% off', href: url },
      text: [
        `Hi ${fn},`,
        ``,
        `Here's 10% off your first month of ${tn}:`,
        ``,
        `   ${code}`,
        ``,
        `Paste this code on the checkout page. Expires ${exp}.`,
        `Single-use, one-time code.`,
        ``,
        `Redeem: ${url}`,
        ``,
        `— The Paybacker team`,
        `Unsubscribe: ${unsub}`,
      ].join('\n'),
    };
  }

  // email_4_final
  const code = ctx.promoCode ?? 'WELCOME10';
  const exp = ctx.promoExpiresAt
    ? ctx.promoExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    : 'tomorrow';
  return {
    preheader: `Your 10% code expires ${exp}`,
    heading: `Hi ${fn} — your 10% code expires ${exp}`,
    intro: "Just a quick heads-up: the 10% code we sent you is about to expire. After that, it's gone for good.",
    body: [
      `<div style="${codeBoxStyle}">${code}</div>`,
      paragraph(
        `If ${tn} isn't right for you, no worries — this is the last we'll email you about it. We won't keep nagging.`,
      ),
      paragraph('— The Paybacker team'),
    ].join('\n'),
    cta: { label: 'Use my code', href: url },
    text: [
      `Hi ${fn},`,
      ``,
      `Your 10% code expires ${exp}:`,
      ``,
      `   ${code}`,
      ``,
      `Use it: ${url}`,
      ``,
      `If ${tn} isn't right for you, no worries — this is the last we'll email you about it.`,
      ``,
      `— The Paybacker team`,
      `Unsubscribe: ${unsub}`,
    ].join('\n'),
  };
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  subject: string;
  reason?: string;
}

/**
 * Render + send a nurture email through the canonical layout.
 * Caller (the cron) is responsible for writing the audit log row.
 */
export async function sendNurtureEmail(
  template: NurtureTemplate,
  ctx: NurtureContext,
): Promise<SendResult> {
  const subject = SUBJECT_LINES[template](tierName(ctx.intendedTier));
  const built = build(template, ctx);
  const result = await sendPaybackerEmail({
    to: ctx.email,
    subject,
    preheader: built.preheader,
    heading: built.heading,
    intro: built.intro,
    body: built.body,
    cta: built.cta,
    variant: 'marketing',
    unsubscribeUrl: unsubUrl(ctx.unsubscribeToken),
    text: built.text,
  });
  if (!result.ok) return { ok: false, subject, reason: result.error };
  return { ok: true, messageId: result.messageId, subject };
}

/** Back-compat helper: render-only (used by previews / tests). */
export function renderNurtureHtml(template: NurtureTemplate, ctx: NurtureContext): string {
  const built = build(template, ctx);
  return renderPaybackerEmail({
    preheader: built.preheader,
    heading: built.heading,
    intro: built.intro,
    body: built.body,
    cta: built.cta,
    variant: 'marketing',
    unsubscribeUrl: unsubUrl(ctx.unsubscribeToken),
  });
}
