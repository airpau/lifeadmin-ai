/**
 * Email body snapshot for receipts and bills that arrive with no
 * attachment (Amazon, Uber, most app stores).
 *
 * Decision: store a self contained, sanitised HTML file rather than a
 * PDF. The repo's only PDF renderer is @react-pdf/renderer, which lays
 * out its own component tree and cannot render arbitrary email HTML, and
 * MailHub's approach (convert through a temporary Google Doc) needs a
 * Drive token we do not have for most users. HTML keeps the receipt
 * exactly as the sender laid it out, opens in every browser, and costs
 * nothing to produce.
 *
 * Safety: the snapshot is served from Supabase Storage through a signed
 * URL with a download disposition, so it is saved rather than rendered
 * on our origin. On top of that the file is sanitised (scripts, frames,
 * forms, event handlers, javascript: links and meta refresh removed) and
 * carries a Content-Security-Policy that blocks every script and every
 * remote load, so opening it later cannot run code or fire tracking
 * pixels.
 */

const esc = (s: string) =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Remove active content from email HTML. Conservative by design. */
export function sanitizeEmailHtml(html: string): string {
  if (!html) return '';
  return (
    html
      // whole elements that can run code, load documents or submit data
      .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
      .replace(/<script\b[^>]*\/?>/gi, '')
      .replace(/<(iframe|frame|frameset|object|embed|applet|form|svg|math|template)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|link|base|svg|math)\b[^>]*\/?>/gi, '')
      // meta refresh / redirects and any existing CSP we would be overriding
      .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
      // inline event handlers: onload=, onclick= ... quoted or bare
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      // javascript:, vbscript: and data:text/html URLs in attributes
      .replace(/\b(href|src|action|formaction|xlink:href)\s*=\s*("|')\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1="#"')
      .replace(/\b(href|src|action|formaction)\s*=\s*(javascript|vbscript):[^\s>]*/gi, '$1="#"')
  );
}

export interface SnapshotInput {
  from: string;
  to?: string;
  date: string;
  subject: string;
  html: string | null;
  text: string | null;
}

/** Build the HTML file stored for a body-only receipt. */
export function buildEmailSnapshotHtml(input: SnapshotInput): string {
  const csp =
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; form-action 'none'; base-uri 'none'";
  const header =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#333;border-bottom:1px solid #ccc;padding:12px 0;margin-bottom:16px">` +
    `<div style="font-size:11px;color:#777;margin-bottom:6px">Saved by Paybacker from your inbox. Remote images are blocked in this copy.</div>` +
    `<b>From:</b> ${esc(input.from)}<br>` +
    (input.to ? `<b>To:</b> ${esc(input.to)}<br>` : '') +
    `<b>Date:</b> ${esc(input.date)}<br>` +
    `<b>Subject:</b> ${esc(input.subject)}</div>`;

  let body: string;
  if (input.html && input.html.trim()) {
    // Keep only what is inside <body> when present, so the sender's
    // <head> (and anything in it) never reaches the snapshot.
    const m = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(input.html);
    body = sanitizeEmailHtml(m ? m[1] : input.html.replace(/<head[\s\S]*?<\/head\s*>/gi, ''));
  } else {
    body = `<pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif">${esc(input.text || '(no text in this email)')}</pre>`;
  }

  return (
    '<!DOCTYPE html>\n<html lang="en-GB"><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    '<meta name="referrer" content="no-referrer">' +
    `<title>${esc(input.subject || 'Email receipt')}</title></head>` +
    `<body style="max-width:800px;margin:0 auto;padding:16px">${header}${body}</body></html>\n`
  );
}
