/**
 * Consumer abandonment nurture email templates (4-email sequence).
 *
 * Sequence:
 *   1. Soft reminder           ~T+1h     transactional-leaning
 *   2. Value nudge             ~T+24h    soft opt-in marketing
 *   3. 10% discount + code     ~T+72h    soft opt-in marketing
 *   4. Final / code expiring   ~T+7d     soft opt-in marketing
 *
 * Lawful basis: PECR reg. 22(3) "soft opt-in" — recipient gave details
 * during a sale-negotiation (Stripe checkout / pricing page subscribe),
 * marketing relates to similar products, one-click unsubscribe in every
 * footer.
 *
 * Visual style mirrors src/lib/email/dispute-reminders.ts so consumer
 * mail looks the same as transactional product mail.
 */

import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

const wrap = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;`;
const header = `background:#F9FAFB;padding:24px 32px;border-bottom:1px solid #F9FAFB;text-align:center;`;
const body = `padding:32px;`;
const h1 = `color:#0B1220;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;`;
const p = `color:#374151;font-size:15px;line-height:1.75;margin:0 0 16px;`;
const box = `background:#F9FAFB;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid #059669;`;
const codeBox = `background:#0B1220;color:#FFFFFF;border-radius:12px;padding:18px 24px;margin:20px 0;text-align:center;font-family:Menlo,Monaco,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:2px;`;
const cta = `display:inline-block;background:#059669;color:#FFFFFF;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;margin:8px 0;`;
const footerBox = `padding:20px 32px 28px;border-top:1px solid #F9FAFB;`;
const footerText = `color:#4B5563;font-size:12px;line-height:1.6;margin:0;text-align:center;`;
const unsubLink = `color:#059669;text-decoration:underline;font-weight:600;`;

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

const Logo = () => `
  <a href="${SITE}" style="text-decoration:none;">
    <span style="font-size:22px;font-weight:800;color:#0B1220;">Pay<span style="color:#059669;">backer</span></span>
  </a>
`;

function Footer(unsubscribeUrl: string): string {
  return `
    <div style="${footerBox}">
      <p style="${footerText}">
        You're receiving this because you started a checkout or signup on
        <a href="${SITE}" style="color:#059669;text-decoration:none;">paybacker.co.uk</a>.<br/>
        <a href="${unsubscribeUrl}" style="${unsubLink}">Unsubscribe in one click</a>
      </p>
      <p style="${footerText};margin-top:14px;">
        Paybacker LTD · ICO Registered · UK Company<br/>
        <a href="${SITE}/privacy-policy" style="color:#4B5563;text-decoration:none;">Privacy Policy</a> &nbsp;·&nbsp;
        <a href="${SITE}/legal/terms" style="color:#4B5563;text-decoration:none;">Terms</a>
      </p>
    </div>
  `;
}

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

function greet(name: string | null): string {
  if (!name) return 'Hi there,';
  const first = name.split(' ')[0];
  return `Hi ${first},`;
}

// ---------- Template 1 — soft reminder ----------

function template1(ctx: NurtureContext): { html: string; text: string } {
  const tn = tierName(ctx.intendedTier);
  const unsub = unsubUrl(ctx.unsubscribeToken);
  const html = `
    <div style="${wrap}">
      <div style="${header}">${Logo()}</div>
      <div style="${body}">
        <h1 style="${h1}">${greet(ctx.name).replace(',', '')} — did you forget something?</h1>
        <p style="${p}">You started signing up for <strong>${tn}</strong> on Paybacker but didn't quite finish. Totally understandable — life gets busy.</p>
        <p style="${p}">If you'd like to pick up where you left off, you can finish in under a minute:</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl(ctx)}" style="${cta}">Finish setting up ${tn}</a>
        </div>
        <p style="${p}">If this wasn't you, just ignore this email — no account was created.</p>
        <p style="${p}">— The Paybacker team</p>
      </div>
      ${Footer(unsub)}
    </div>
  `;
  const text = [
    `${greet(ctx.name)}`,
    ``,
    `You started signing up for ${tn} on Paybacker but didn't quite finish.`,
    `Pick up where you left off: ${ctaUrl(ctx)}`,
    ``,
    `If this wasn't you, just ignore this email — no account was created.`,
    ``,
    `— The Paybacker team`,
    `Unsubscribe: ${unsub}`,
  ].join('\n');
  return { html, text };
}

// ---------- Template 2 — value nudge ----------

function template2(ctx: NurtureContext): { html: string; text: string } {
  const tn = tierName(ctx.intendedTier);
  const unsub = unsubUrl(ctx.unsubscribeToken);
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
  const html = `
    <div style="${wrap}">
      <div style="${header}">${Logo()}</div>
      <div style="${body}">
        <h1 style="${h1}">${greet(ctx.name).replace(',', '')} — here's why ${tn} pays for itself</h1>
        <p style="${p}">When we ask paying members what made the difference, the same handful of things come up:</p>
        <div style="${box}">
          <ul style="color:#374151;margin:0;font-size:14px;line-height:1.8;padding-left:20px;">
            ${bullets.map((b) => `<li>${b}</li>`).join('')}
          </ul>
        </div>
        <p style="${p}">The average member recovers £${isPro ? '180' : '90'}+ in their first 90 days. ${tn} costs ${tierPrice(ctx.intendedTier)} — usually paid back inside a month.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl(ctx)}" style="${cta}">Get started with ${tn}</a>
        </div>
        <p style="${p}">Got a question first? Just reply — a real person reads every reply.</p>
        <p style="${p}">— The Paybacker team</p>
      </div>
      ${Footer(unsub)}
    </div>
  `;
  const text = [
    `${greet(ctx.name)}`,
    ``,
    `Here's why ${tn} pays for itself:`,
    ...bullets.map((b) => `  • ${b}`),
    ``,
    `Average member recovers £${isPro ? '180' : '90'}+ in their first 90 days.`,
    `${tn}: ${tierPrice(ctx.intendedTier)} — usually paid back inside a month.`,
    ``,
    `Get started: ${ctaUrl(ctx)}`,
    ``,
    `— The Paybacker team`,
    `Unsubscribe: ${unsub}`,
  ].join('\n');
  return { html, text };
}

// ---------- Template 3 — 10% discount ----------

function template3(ctx: NurtureContext): { html: string; text: string } {
  const tn = tierName(ctx.intendedTier);
  const unsub = unsubUrl(ctx.unsubscribeToken);
  const code = ctx.promoCode ?? '';
  const exp = ctx.promoExpiresAt ? ctx.promoExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '7 days';
  const html = `
    <div style="${wrap}">
      <div style="${header}">${Logo()}</div>
      <div style="${body}">
        <h1 style="${h1}">${greet(ctx.name).replace(',', '')} — a small thank-you</h1>
        <p style="${p}">We don't normally do discounts, but you've been on our list for a few days and we'd love to have you on board. Here's <strong>10% off your first month of ${tn}</strong>:</p>
        <div style="${codeBox}">${code || 'WELCOME10'}</div>
        <p style="${p}" style="text-align:center;color:#6B7280;font-size:13px;">Paste this code on the checkout page. Expires ${exp}.</p>
        <div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl(ctx)}" style="${cta}">Redeem 10% off</a>
        </div>
        <p style="${p}">This is a one-time, single-use code — once redeemed it's gone. No catches, no auto-renewing premium-tier nonsense.</p>
        <p style="${p}">— The Paybacker team</p>
      </div>
      ${Footer(unsub)}
    </div>
  `;
  const text = [
    `${greet(ctx.name)}`,
    ``,
    `Here's 10% off your first month of ${tn}:`,
    ``,
    `   ${code || 'WELCOME10'}`,
    ``,
    `Paste this code on the checkout page. Expires ${exp}.`,
    `Single-use, one-time code.`,
    ``,
    `Redeem: ${ctaUrl(ctx)}`,
    ``,
    `— The Paybacker team`,
    `Unsubscribe: ${unsub}`,
  ].join('\n');
  return { html, text };
}

// ---------- Template 4 — final / expiring ----------

function template4(ctx: NurtureContext): { html: string; text: string } {
  const tn = tierName(ctx.intendedTier);
  const unsub = unsubUrl(ctx.unsubscribeToken);
  const code = ctx.promoCode ?? '';
  const exp = ctx.promoExpiresAt ? ctx.promoExpiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : 'tomorrow';
  const html = `
    <div style="${wrap}">
      <div style="${header}">${Logo()}</div>
      <div style="${body}">
        <h1 style="${h1}">${greet(ctx.name).replace(',', '')} — your 10% code expires ${exp}</h1>
        <p style="${p}">Just a quick heads-up: the 10% code we sent you is about to expire. After that, it's gone for good.</p>
        <div style="${codeBox}">${code || 'WELCOME10'}</div>
        <div style="text-align:center;margin:28px 0;">
          <a href="${ctaUrl(ctx)}" style="${cta}">Use my code</a>
        </div>
        <p style="${p}">If ${tn} isn't right for you, no worries — this is the last we'll email you about it. We won't keep nagging.</p>
        <p style="${p}">— The Paybacker team</p>
      </div>
      ${Footer(unsub)}
    </div>
  `;
  const text = [
    `${greet(ctx.name)}`,
    ``,
    `Your 10% code expires ${exp}:`,
    ``,
    `   ${code || 'WELCOME10'}`,
    ``,
    `Use it: ${ctaUrl(ctx)}`,
    ``,
    `If ${tn} isn't right for you, no worries — this is the last we'll email you about it.`,
    ``,
    `— The Paybacker team`,
    `Unsubscribe: ${unsub}`,
  ].join('\n');
  return { html, text };
}

const TEMPLATE_BUILDERS: Record<NurtureTemplate, (ctx: NurtureContext) => { html: string; text: string }> = {
  email_1_soft_reminder: template1,
  email_2_value_nudge:   template2,
  email_3_discount:      template3,
  email_4_final:         template4,
};

export interface SendResult {
  ok: boolean;
  messageId?: string;
  subject: string;
  reason?: string;
}

/**
 * Render + send a nurture email. Returns the Resend message id on success.
 * Caller (the cron) is responsible for writing the audit log row.
 */
export async function sendNurtureEmail(
  template: NurtureTemplate,
  ctx: NurtureContext,
): Promise<SendResult> {
  const subject = SUBJECT_LINES[template](tierName(ctx.intendedTier));
  const { html, text } = TEMPLATE_BUILDERS[template](ctx);
  try {
    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to: ctx.email,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
      headers: {
        // RFC 8058 one-click unsubscribe — Gmail/Outlook native unsub button.
        'List-Unsubscribe': `<${unsubUrl(ctx.unsubscribeToken)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if ((result as { error?: { message?: string } }).error) {
      return { ok: false, subject, reason: (result as { error?: { message?: string } }).error?.message };
    }
    const messageId = (result as { data?: { id?: string } }).data?.id;
    return { ok: true, messageId, subject };
  } catch (err) {
    return { ok: false, subject, reason: err instanceof Error ? err.message : String(err) };
  }
}
