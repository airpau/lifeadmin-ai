/**
 * Attachment listing for the documents vault. Pure functions only: no
 * network, so they can be unit tested against sample payloads.
 *
 * Ported from MailHub's lib/mailToDrive.ts (attachmentsOf, mimeFor and
 * the likely_signature_image heuristic), extended for Microsoft Graph
 * and for the file types the vault accepts.
 */

import { MAX_DOCUMENT_BYTES } from '@/lib/documents/types';

// ---------------------------------------------------------------------------
// MIME handling
// ---------------------------------------------------------------------------

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  txt: 'text/plain',
  html: 'text/html',
  htm: 'text/html',
};

/** MIME types the vault will store. */
export const ALLOWED_DOCUMENT_MIME = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv',
]);

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/**
 * Best MIME type for a file: trust the reported type unless it is the
 * generic octet-stream (common for PDFs sent from some billing systems),
 * then fall back to the extension.
 */
export function mimeFor(name: string, reported: string | null | undefined): string {
  const r = (reported || '').toLowerCase().split(';')[0].trim();
  if (r && r !== 'application/octet-stream' && r !== 'binary/octet-stream') {
    // image/jpg is not a real type but some senders use it
    return r === 'image/jpg' ? 'image/jpeg' : r;
  }
  return EXT_TO_MIME[extensionOf(name)] ?? 'application/octet-stream';
}

export function isAllowedDocumentMime(mime: string): boolean {
  return ALLOWED_DOCUMENT_MIME.has((mime || '').toLowerCase());
}

/** Extension to use when storing a file of this MIME type. */
export function extensionForMime(mime: string, fallbackName = ''): string {
  const fromName = extensionOf(fallbackName);
  if (fromName && EXT_TO_MIME[fromName] === mime) return fromName;
  for (const [ext, m] of Object.entries(EXT_TO_MIME)) {
    if (m === mime) return ext;
  }
  return fromName || 'bin';
}

/**
 * Make a filename safe for storage paths, Drive and Content-Disposition:
 * strip path separators and control characters, collapse whitespace,
 * cap the length while keeping the extension.
 */
export function sanitizeFilename(name: string, fallback = 'document'): string {
  let n = (name || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!n || /^\.+$/.test(n)) n = fallback;
  if (n.length > 150) {
    const ext = extensionOf(n);
    const base = n.slice(0, 150 - (ext ? ext.length + 1 : 0)).trim();
    n = ext ? `${base}.${ext}` : base;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Signature image heuristic (ported from MailHub, then widened)
// ---------------------------------------------------------------------------

const SIGNATURE_NAME_RE =
  /^(image\d{3}|outlook-|logo|signature|sig[_-]|icon|banner|spacer|pixel|facebook|twitter|linkedin|instagram|youtube|tiktok|x-logo)/i;

/**
 * True when an attachment is almost certainly an email signature logo,
 * social icon or tracking pixel rather than a document.
 *
 * MailHub's rule: an INLINE image under 40 KB. Added here: any image
 * under 10 KB (icons are tiny even when attached), and the usual logo
 * and Outlook auto names under 100 KB.
 */
export function isLikelySignatureImage(c: {
  filename: string;
  mimeType: string;
  size: number;
  inline: boolean;
}): boolean {
  if (!(c.mimeType || '').toLowerCase().startsWith('image/')) return false;
  const size = c.size || 0;
  if (c.inline && size < 40_000) return true;
  if (size > 0 && size < 10_000) return true;
  if (SIGNATURE_NAME_RE.test(c.filename || '') && size < 100_000) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Candidate shape shared by both providers
// ---------------------------------------------------------------------------

export interface AttachmentCandidate {
  /** Stable handle for this attachment within its message. */
  partKey: string;
  /** Gmail attachmentId or Graph attachment id, used to download. */
  downloadId: string | null;
  /** Gmail only: small attachments can carry their bytes inline (base64url). */
  inlineData: string | null;
  filename: string;
  mimeType: string;
  size: number;
  inline: boolean;
  likelySignatureImage: boolean;
}

export type SkipReason = 'signature_image' | 'unsupported_type' | 'too_large' | 'empty';

/** Decide whether to keep an attachment. Returns null to keep, or why it was skipped. */
export function attachmentSkipReason(c: AttachmentCandidate, maxBytes = MAX_DOCUMENT_BYTES): SkipReason | null {
  if (c.likelySignatureImage) return 'signature_image';
  if (!isAllowedDocumentMime(c.mimeType)) return 'unsupported_type';
  if (c.size > maxBytes) return 'too_large';
  if (c.size === 0 && !c.inlineData && !c.downloadId) return 'empty';
  return null;
}

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

export interface GmailPayloadPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPayloadPart[];
}

export function gmailHeader(p: GmailPayloadPart | undefined | null, name: string): string {
  return p?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function walkGmail(p: GmailPayloadPart | undefined | null, out: GmailPayloadPart[], depth = 0): void {
  if (!p || depth > 25) return;
  out.push(p);
  for (const c of p.parts ?? []) walkGmail(c, out, depth + 1);
}

/**
 * Every attachment in a Gmail `format=full` payload. The part id (for
 * example "1" or "1.2") is used as the stable key: Gmail attachment ids
 * change on every fetch of the same message, part ids do not.
 */
export function listGmailAttachments(payload: GmailPayloadPart | undefined | null): AttachmentCandidate[] {
  const all: GmailPayloadPart[] = [];
  walkGmail(payload, all);
  return all
    .filter((p) => !!p.filename && (!!p.body?.attachmentId || !!p.body?.data))
    .map((p, i) => {
      const filename = p.filename || `attachment-${i + 1}`;
      const disp = gmailHeader(p, 'Content-Disposition').toLowerCase();
      const inline = disp.startsWith('inline') || !!gmailHeader(p, 'Content-ID');
      const mimeType = mimeFor(filename, p.mimeType);
      const size = p.body?.size ?? 0;
      return {
        partKey: p.partId || p.body?.attachmentId?.slice(0, 64) || filename,
        downloadId: p.body?.attachmentId ?? null,
        inlineData: p.body?.data ?? null,
        filename,
        mimeType,
        size,
        inline,
        likelySignatureImage: isLikelySignatureImage({ filename, mimeType, size, inline }),
      };
    });
}

/** First non-attachment text/html and text/plain bodies of a Gmail payload. */
export function gmailBodies(payload: GmailPayloadPart | undefined | null): { html: string | null; text: string | null } {
  const all: GmailPayloadPart[] = [];
  walkGmail(payload, all);
  const dec = (d?: string) => (d ? Buffer.from(d, 'base64url').toString('utf8') : null);
  const html = all.find((p) => (p.mimeType || '').toLowerCase() === 'text/html' && p.body?.data && !p.filename);
  const text = all.find((p) => (p.mimeType || '').toLowerCase() === 'text/plain' && p.body?.data && !p.filename);
  return { html: dec(html?.body?.data), text: dec(text?.body?.data) };
}

// ---------------------------------------------------------------------------
// Microsoft Graph
// ---------------------------------------------------------------------------

export interface GraphAttachmentMeta {
  '@odata.type'?: string;
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
}

/**
 * File attachments from GET /me/messages/{id}/attachments. Item
 * attachments (attached emails or events) and reference attachments
 * (OneDrive links) are skipped: they are not files we can store.
 */
export function listGraphAttachments(value: GraphAttachmentMeta[] | null | undefined): AttachmentCandidate[] {
  return (value ?? [])
    .filter((a) => {
      const t = (a['@odata.type'] || '#microsoft.graph.fileAttachment').toLowerCase();
      return t.endsWith('fileattachment') && !!a.id;
    })
    .map((a, i) => {
      const filename = a.name || `attachment-${i + 1}`;
      const mimeType = mimeFor(filename, a.contentType);
      const size = a.size ?? 0;
      const inline = a.isInline === true;
      return {
        partKey: a.id as string,
        downloadId: a.id as string,
        inlineData: null,
        filename,
        mimeType,
        size,
        inline,
        likelySignatureImage: isLikelySignatureImage({ filename, mimeType, size, inline }),
      };
    });
}

// ---------------------------------------------------------------------------
// Which emails are worth looking at
// ---------------------------------------------------------------------------

/** Subjects that suggest an attachment is a document worth keeping. */
export const DOCUMENT_SUBJECT_RE =
  /\b(receipts?|invoices?|bills?|statements?|renewals?|renew(s|ing)?|polic(y|ies)|certificates?|contracts?|agreements?|order confirmation|payment confirmation|tax|vat|p60|p45|p11d|payslips?|schedule|documents?|quotes?|estimate|booking confirmation|warranty|guarantee|mot|insurance|tenancy|lease)\b/i;

/** Subjects that suggest an email with no attachment is itself a receipt or bill. */
export const BODY_RECEIPT_SUBJECT_RE =
  /\b(receipt|invoice|order confirmation|order confirmed|payment confirmation|payment received|thanks for your (order|payment|purchase)|your (bill|statement)|tax invoice|booking confirmation)\b/i;
