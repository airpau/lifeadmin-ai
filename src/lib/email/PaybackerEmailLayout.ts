/**
 * PaybackerEmailLayout — the SINGLE canonical layout for every outbound email.
 *
 * Every transactional, lifecycle, marketing, B2B, support and admin email in this
 * codebase MUST render through `renderPaybackerEmail()` (or the Resend wrapper
 * `sendPaybackerEmail()` in `./send.ts`). No exceptions.
 *
 * Why this file exists
 * --------------------
 * Before this file there were ~46 outbound email sites scattered across
 * `src/lib/email/*.ts`, `src/app/api/**`, `src/lib/notifications/dispatch.ts`,
 * `src/lib/loyalty.ts`, `src/lib/referrals.ts`, `src/lib/b2b/stripe-webhook.ts`,
 * `src/lib/support/confirmation-email.ts` and `src/lib/telegram/tool-handlers.ts`,
 * each with its own hand-rolled HTML string. Some were plain-text. Some were
 * half-styled. Some duplicated the same wrap/header/box/cta/footer tokens 12
 * times. The founder asked for ONE canonical layout, used by every sender.
 *
 * What this gives you
 * -------------------
 * - `renderPaybackerEmail({ preheader, heading, intro, body, cta, variant })`
 *   returns the inline-styled HTML string ready to pass to Resend.
 * - Helper builders for common body slot fragments:
 *     `card(...)`, `paragraph(...)`, `orderedList(...)`, `unorderedList(...)`,
 *     `button(...)`, `divider()`, `callout(...)`, `monospaceBlock(...)`.
 * - `variant: 'standard' | 'letter' | 'b2b' | 'marketing'` controls subtle
 *   chrome differences (footer copy, unsubscribe visibility, audience-aware
 *   sign-off). The visual frame is identical across variants.
 * - `variant: 'letter'` renders the heading + chrome but the body slot is
 *   forwarded VERBATIM as a monospace block — no preamble, no footer cards.
 *   This preserves the in-flight reply-formatting fix that letter-delivery
 *   emails must contain ONLY the literal letter text.
 *
 * Design tokens
 * -------------
 * Mirrors the existing onboarding-sequence.ts / dispute-reminders.ts style
 * (already proven across multiple production emails) so previously-styled
 * mail does not visually regress when migrated. White card on light page,
 * Paybacker green (#059669) accents, navy ink (#0B1220), 600px max-width,
 * mobile-safe, fully inline-styled (email clients strip <style>/classes).
 */

// ---------- Tokens ----------

const COLOR = {
  ink: '#0B1220',
  inkSoft: '#374151',
  inkMuted: '#6B7280',
  inkFaint: '#4B5563',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  border: '#E5E7EB',
  brand: '#059669',
  brandSoft: '#10B981',
  danger: '#EF4444',
  page: '#F3F4F6',
} as const;

const FONT_STACK = `-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONO_STACK = `Menlo,Monaco,Consolas,'Courier New',monospace`;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

const STYLE = {
  page: `background:${COLOR.page};padding:24px 0;margin:0;`,
  wrap: `font-family:${FONT_STACK};max-width:600px;margin:0 auto;background:${COLOR.surface};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);`,
  header: `background:${COLOR.surfaceAlt};padding:24px 32px;border-bottom:1px solid ${COLOR.border};text-align:center;`,
  body: `padding:32px;`,
  bodyLetter: `padding:32px;`,
  h1: `color:${COLOR.ink};font-size:26px;font-weight:700;margin:0 0 12px;line-height:1.25;letter-spacing:-0.01em;`,
  intro: `color:${COLOR.inkSoft};font-size:16px;line-height:1.65;margin:0 0 24px;`,
  paragraph: `color:${COLOR.inkSoft};font-size:15px;line-height:1.75;margin:0 0 16px;`,
  paragraphMuted: `color:${COLOR.inkMuted};font-size:14px;line-height:1.7;margin:0 0 16px;`,
  card: `background:${COLOR.surfaceAlt};border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid ${COLOR.brand};`,
  cardDanger: `background:${COLOR.surfaceAlt};border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid ${COLOR.danger};`,
  eyebrow: `color:${COLOR.brand};font-weight:700;margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;`,
  eyebrowDanger: `color:${COLOR.danger};font-weight:700;margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;`,
  list: `color:${COLOR.inkSoft};margin:0;font-size:15px;line-height:1.85;padding-left:20px;`,
  cta: `display:inline-block;background:${COLOR.brand};color:#FFFFFF;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;`,
  ctaWrap: `text-align:center;margin:28px 0;`,
  divider: `border:none;border-top:1px solid ${COLOR.border};margin:24px 0;`,
  mono: `background:${COLOR.ink};color:#E5E7EB;border-radius:12px;padding:24px;margin:0;font-family:${MONO_STACK};font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word;`,
  footer: `padding:20px 32px 28px;border-top:1px solid ${COLOR.border};`,
  footerText: `color:${COLOR.inkFaint};font-size:12px;line-height:1.6;margin:0;text-align:center;`,
  preheader: `display:none;font-size:1px;color:${COLOR.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;`,
} as const;

// ---------- Public types ----------

export type EmailVariant = 'standard' | 'letter' | 'b2b' | 'marketing';

export interface EmailCta {
  /** Button label, e.g. "Go to your dashboard" */
  label: string;
  /** Absolute URL */
  href: string;
}

export interface RenderEmailInput {
  /** Hidden inbox preview text. Keep under 90 chars for Gmail/iOS. */
  preheader: string;
  /** The H1 — personalise with first name where possible. */
  heading: string;
  /** Optional sub-heading paragraph rendered immediately below the H1. */
  intro?: string;
  /** Pre-rendered HTML for the body slot. Use the helpers below to build. */
  body: string;
  /** Optional primary call-to-action button. */
  cta?: EmailCta;
  /** Variant controls footer + sign-off. Defaults to 'standard'. */
  variant?: EmailVariant;
  /** Required for marketing-variant emails (one-click unsubscribe URL). */
  unsubscribeUrl?: string;
  /** Optional small post-body footnote (e.g. plan/pricing fine print). */
  footnote?: string;
}

// ---------- Body-slot helpers ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function paragraph(html: string, opts?: { muted?: boolean }): string {
  return `<p style="${opts?.muted ? STYLE.paragraphMuted : STYLE.paragraph}">${html}</p>`;
}

export function divider(): string {
  return `<hr style="${STYLE.divider}" />`;
}

export interface CardOpts {
  /** Eyebrow label, e.g. "HOW IT WORKS". Rendered above contents. */
  eyebrow?: string;
  /** Visual treatment. */
  tone?: 'brand' | 'danger';
}

export function card(innerHtml: string, opts: CardOpts = {}): string {
  const tone = opts.tone === 'danger' ? STYLE.cardDanger : STYLE.card;
  const eyebrowStyle = opts.tone === 'danger' ? STYLE.eyebrowDanger : STYLE.eyebrow;
  const eyebrow = opts.eyebrow ? `<p style="${eyebrowStyle}">${escapeHtml(opts.eyebrow)}</p>` : '';
  return `<div style="${tone}">${eyebrow}${innerHtml}</div>`;
}

export function orderedList(items: string[]): string {
  return `<ol style="${STYLE.list}">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
}

export function unorderedList(items: string[]): string {
  return `<ul style="${STYLE.list}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

export function button(cta: EmailCta): string {
  return `<div style="${STYLE.ctaWrap}"><a href="${cta.href}" style="${STYLE.cta}">${escapeHtml(cta.label)}</a></div>`;
}

export function callout(eyebrow: string, body: string, tone: 'brand' | 'danger' = 'brand'): string {
  return card(`<p style="margin:0;color:${COLOR.inkSoft};font-size:14px;line-height:1.7;">${body}</p>`, { eyebrow, tone });
}

export function monospaceBlock(text: string): string {
  return `<pre style="${STYLE.mono}">${escapeHtml(text)}</pre>`;
}

// ---------- Footer ----------

function footerHtml(variant: EmailVariant, unsubscribeUrl?: string): string {
  const unsub = (() => {
    if (variant === 'marketing') {
      // Marketing footer MUST render the caller-supplied tokenised unsubscribe URL
      // verbatim. There is no fallback — `/unsubscribe` is the success status page
      // and accepts no token, so falling back there silently breaks one-click
      // unsubscribe (PECR + RFC 8058). `sendPaybackerEmail` enforces this by
      // throwing `MissingUnsubscribeUrlError` before we get here.
      if (!unsubscribeUrl) {
        throw new Error(
          'PaybackerEmailLayout: marketing variant requires an unsubscribeUrl ' +
            '(use sendPaybackerEmail which enforces this).',
        );
      }
      return `<a href="${unsubscribeUrl}" style="color:${COLOR.brand};text-decoration:underline;font-weight:600;">Unsubscribe in one click</a>`;
    }
    if (variant === 'b2b') {
      return `<a href="mailto:business@paybacker.co.uk" style="color:${COLOR.inkFaint};text-decoration:none;">business@paybacker.co.uk</a>`;
    }
    return `<a href="mailto:support@paybacker.co.uk?subject=Unsubscribe" style="color:${COLOR.inkFaint};text-decoration:none;">Unsubscribe</a>`;
  })();

  const tagline =
    variant === 'b2b'
      ? 'UK Consumer Rights API for fintechs, insurers and energy retailers'
      : 'AI-powered money recovery for UK consumers';

  return `
    <div style="${STYLE.footer}">
      <p style="${STYLE.footerText}">
        <a href="${SITE}" style="color:${COLOR.brand};text-decoration:none;font-weight:600;">Paybacker LTD</a> &middot; ICO Registered &middot; UK Company<br/>
        ${tagline}<br/><br/>
        <a href="${SITE}/privacy-policy" style="color:${COLOR.inkFaint};text-decoration:none;">Privacy</a> &nbsp;&middot;&nbsp;
        <a href="${SITE}/legal/terms" style="color:${COLOR.inkFaint};text-decoration:none;">Terms</a> &nbsp;&middot;&nbsp;
        ${unsub}
      </p>
    </div>
  `;
}

// ---------- Main render ----------

const LOGO_HTML = `
  <a href="${SITE}" style="text-decoration:none;">
    <span style="font-size:22px;font-weight:800;color:${COLOR.ink};letter-spacing:-0.01em;">Pay<span style="color:${COLOR.brand};">backer</span></span>
  </a>
`;

export function renderPaybackerEmail(input: RenderEmailInput): string {
  const variant: EmailVariant = input.variant ?? 'standard';

  const introHtml = input.intro ? `<p style="${STYLE.intro}">${input.intro}</p>` : '';
  const ctaHtml = input.cta ? button(input.cta) : '';
  const footnoteHtml = input.footnote
    ? `<p style="color:${COLOR.inkMuted};font-size:13px;line-height:1.6;margin:0;text-align:center;">${input.footnote}</p>`
    : '';

  // Letter variant: heading + chrome, body forwarded verbatim (already a monospace block).
  // No instructional preamble, no save-confirmation card. This carve-out exists for the
  // dispute-reply / draft-letter delivery emails — see PR #411 lineage.
  const bodyHtml =
    variant === 'letter'
      ? input.body
      : `${introHtml}${input.body}${ctaHtml}${footnoteHtml}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>${escapeHtml(input.heading)}</title>
  </head>
  <body style="${STYLE.page}">
    <span style="${STYLE.preheader}">${escapeHtml(input.preheader)}</span>
    <div style="${STYLE.wrap}">
      <div style="${STYLE.header}">${LOGO_HTML}</div>
      <div style="${variant === 'letter' ? STYLE.bodyLetter : STYLE.body}">
        <h1 style="${STYLE.h1}">${escapeHtml(input.heading)}</h1>
        ${bodyHtml}
      </div>
      ${footerHtml(variant, input.unsubscribeUrl)}
    </div>
  </body>
</html>`;
}

export const __testing = { STYLE, COLOR };
