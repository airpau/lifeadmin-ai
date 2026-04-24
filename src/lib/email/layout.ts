/**
 * Shared transactional email chrome.
 *
 * Every Paybacker email should funnel through `renderEmail()` so the palette,
 * typography, and Gmail dark-mode guard stay consistent. Inner templates
 * supply the body HTML and a preheader; this module handles the
 * outer `<html>`, meta tags, header logo, and footer.
 *
 * Why a shared layout: the old ad-hoc templates mixed dark-theme text colours
 * (`#E5E7EB`) onto white backgrounds, so body copy was effectively invisible
 * — and without a `color-scheme` meta, Gmail iOS force-inverted the whole
 * email to dark mode, making headings hard to read too (see screenshot
 * Paul sent 2026-04-23).
 *
 * Import `renderEmail()`, `emailTokens`, and `emailStyles` from here.
 */

export interface EmailLayoutOptions {
  /** Short preview text shown by most inbox clients under the subject line. */
  preheader?: string;
  /** HTML for the inner body card — styled text, boxes, CTA buttons. */
  body: string;
}

/** Brand tokens — hex values only, since email clients don't honour CSS vars. */
export const emailTokens = {
  pageBg: '#F3F4F6',
  cardBg: '#FFFFFF',
  cardBgMuted: '#F9FAFB',
  cardBorder: '#E5E7EB',
  divider: '#F3F4F6',

  text: '#374151',
  textMuted: '#6B7280',
  textStrong: '#0B1220',
  textFaint: '#9CA3AF',

  mint: '#059669',
  mintDeep: '#047857',
  mintWash: '#D1FAE5',
  orange: '#F59E0B',
  orangeDeep: '#B45309',
  red: '#DC2626',
  amber: '#D97706',
  blue: '#2563EB',
} as const;

/** Reusable inline-style strings that emails can drop into `style="..."`. */
export const emailStyles = {
  h1: `color:${emailTokens.textStrong};font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;letter-spacing:-0.01em;`,
  h2: `color:${emailTokens.textStrong};font-size:18px;font-weight:700;margin:0 0 12px;line-height:1.35;`,
  h3: `color:${emailTokens.textStrong};font-size:15px;font-weight:600;margin:0 0 8px;`,
  p: `color:${emailTokens.text};font-size:15px;line-height:1.65;margin:0 0 16px;`,
  pMuted: `color:${emailTokens.textMuted};font-size:14px;line-height:1.65;margin:0 0 16px;`,
  pSmall: `color:${emailTokens.textMuted};font-size:13px;line-height:1.55;margin:0 0 10px;`,
  strong: `color:${emailTokens.textStrong};font-weight:600;`,
  link: `color:${emailTokens.mint};text-decoration:underline;font-weight:600;`,
  cta: `display:inline-block;background:${emailTokens.mint};color:#FFFFFF !important;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;line-height:1;`,
  ctaSecondary: `display:inline-block;background:${emailTokens.cardBgMuted};color:${emailTokens.textStrong} !important;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none;border:1px solid ${emailTokens.cardBorder};line-height:1;`,
  box: `background:${emailTokens.cardBgMuted};border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid ${emailTokens.mint};`,
  tipBox: `background:${emailTokens.mintWash};border-radius:12px;padding:18px 22px;margin:20px 0;border:1px solid ${emailTokens.mintWash};`,
  warnBox: `background:#FEF3C7;border-radius:12px;padding:18px 22px;margin:20px 0;border:1px solid #FDE68A;`,
  dangerBox: `background:#FEE2E2;border-radius:12px;padding:18px 22px;margin:20px 0;border:1px solid #FECACA;`,
  stepNum: `display:inline-block;width:28px;height:28px;background:${emailTokens.mint};color:#FFFFFF;font-weight:700;font-size:14px;border-radius:50%;text-align:center;line-height:28px;margin-right:10px;`,
  badge: `display:inline-block;background:${emailTokens.mintWash};color:${emailTokens.mintDeep};font-weight:700;font-size:11px;padding:4px 10px;border-radius:6px;letter-spacing:0.05em;text-transform:uppercase;`,
} as const;

/**
 * Wrap body HTML in the full document chrome. Always use this instead of
 * hand-rolling <html>/<body> — it pins the palette, font stack, and the
 * color-scheme meta tags that stop Gmail iOS from force-inverting emails.
 */
export function renderEmail({ preheader = '', body }: EmailLayoutOptions): string {
  const preheaderHtml = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>Paybacker</title>
  <style>
    :root { color-scheme: light only; }
    body { margin: 0; padding: 0; background: ${emailTokens.pageBg}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
    a { color: ${emailTokens.mint}; }
    /* Gmail iOS respects color-scheme when explicitly set. Belt-and-braces: force our palette in any dark-mode render. */
    @media (prefers-color-scheme: dark) {
      body, table, td { background: ${emailTokens.pageBg} !important; color: ${emailTokens.text} !important; }
    }
    /* iOS auto-links (phone numbers, dates) shouldn't invert. */
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:${emailTokens.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${emailTokens.text};">
  ${preheaderHtml}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${emailTokens.pageBg};padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${emailTokens.cardBg};border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(11,18,32,0.04);">
          <tr>
            <td style="padding:28px 32px 20px;border-bottom:1px solid ${emailTokens.divider};text-align:center;">
              <a href="https://paybacker.co.uk" style="text-decoration:none;">
                <span style="font-size:24px;font-weight:800;color:${emailTokens.textStrong};letter-spacing:-0.02em;">Pay<span style="color:${emailTokens.mint};">backer</span></span>
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:${emailTokens.text};font-size:15px;line-height:1.65;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px;border-top:1px solid ${emailTokens.divider};background:${emailTokens.cardBgMuted};text-align:center;">
              <p style="margin:0 0 8px;color:${emailTokens.textMuted};font-size:12px;line-height:1.6;">
                <a href="https://paybacker.co.uk" style="color:${emailTokens.mint};text-decoration:none;font-weight:600;">Paybacker LTD</a> &middot; ICO registered &middot; UK company
              </p>
              <p style="margin:0;color:${emailTokens.textFaint};font-size:11px;line-height:1.6;">
                <a href="https://paybacker.co.uk/legal/privacy" style="color:${emailTokens.textFaint};text-decoration:underline;">Privacy</a>
                &nbsp;&middot;&nbsp;
                <a href="https://paybacker.co.uk/legal/terms" style="color:${emailTokens.textFaint};text-decoration:underline;">Terms</a>
                &nbsp;&middot;&nbsp;
                <a href="mailto:support@paybacker.co.uk?subject=Unsubscribe" style="color:${emailTokens.textFaint};text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
