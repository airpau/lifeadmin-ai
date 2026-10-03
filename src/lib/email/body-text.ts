/**
 * Email body extraction shared by the Gmail and Outlook scan paths.
 *
 * Gmail: the old extractor only ever looked for text/plain, so an
 * HTML-only message (very common for bills and receipts) produced an
 * empty body and the classifier only saw the subject and snippet.
 * extractGmailBodyText() walks the full MIME tree, prefers text/plain,
 * and falls back to text/html converted to readable text.
 */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  pound: '£',
  euro: '€',
  copy: '©',
  reg: '®',
  trade: '™',
  hellip: '…',
  mdash: '-',
  ndash: '-',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  zwnj: '',
  zwj: '',
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
      if (code === 0xa0) return ' ';
      if (code === 0x200b || code === 0x200c || code === 0x200d || code === 0xfeff || code === 0x34f) return '';
      try {
        return String.fromCodePoint(code);
      } catch {
        return '';
      }
    }
    const named = NAMED_ENTITIES[ent.toLowerCase()];
    return named !== undefined ? named : whole;
  });
}

/**
 * Convert an HTML email body to readable plain text: drop head, style,
 * script and comments, turn block boundaries into line breaks, strip the
 * remaining tags, decode entities, collapse whitespace.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|ul|ol|blockquote|section|article|header|footer)\s*>/gi, '\n')
    .replace(/<(td|th)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtmlEntities(text)
    .replace(/[​-‍﻿͏]/g, '')
    .replace(/ /g, ' ')
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  headers?: Array<{ name: string; value: string }>;
}

function decodePart(part: GmailPart): string {
  const data = part.body?.data;
  if (!data) return '';
  // Gmail uses base64url. Node's base64url decoder also tolerates padding.
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function isAttachment(part: GmailPart): boolean {
  if (part.filename && part.filename.length > 0) return true;
  const disp = part.headers?.find((h) => h.name.toLowerCase() === 'content-disposition')?.value || '';
  return /^\s*attachment/i.test(disp);
}

/** Depth-first search for the first inline part of a given MIME type. */
export function findGmailPart(part: GmailPart | undefined | null, mime: string, depth = 0): string {
  if (!part || depth > 20) return '';
  if ((part.mimeType || '').toLowerCase() === mime && !isAttachment(part)) {
    const decoded = decodePart(part);
    if (decoded.trim()) return decoded;
  }
  for (const child of part.parts ?? []) {
    const found = findGmailPart(child, mime, depth + 1);
    if (found) return found;
  }
  return '';
}

/**
 * Readable text from a Gmail `format=full` payload. Prefers text/plain,
 * falls back to text/html converted with htmlToText(). Returns '' when
 * neither exists (attachment-only message).
 */
export function extractGmailBodyText(payload: GmailPart | undefined | null): string {
  const plain = findGmailPart(payload, 'text/plain');
  if (plain.trim()) return plain;
  const html = findGmailPart(payload, 'text/html');
  if (html) return htmlToText(html);
  return '';
}

/** Readable text from a Graph message body ({contentType, content}). */
export function graphBodyToText(body: { contentType?: string; content?: string } | null | undefined): string {
  const content = body?.content || '';
  if (!content) return '';
  const type = (body?.contentType || '').toLowerCase();
  // Graph sometimes labels HTML as text; sniff for tags as a fallback.
  if (type === 'html' || /<(html|body|div|p|table|br)\b/i.test(content)) return htmlToText(content);
  return content;
}
