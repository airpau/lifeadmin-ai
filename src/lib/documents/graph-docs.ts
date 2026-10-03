/**
 * Microsoft Graph calls for the documents vault. Every request goes
 * through fetchWithRetry (stage one).
 *
 * Graph cannot combine $search with $filter, so the candidate list is a
 * date-bounded $filter over message headers only (no bodies), then a
 * subject match in code. That is cheap: headers are small and nothing
 * here costs an Anthropic call.
 */

import { fetchWithRetry } from '@/lib/email/fetch-retry';
import {
  BODY_RECEIPT_SUBJECT_RE,
  DOCUMENT_SUBJECT_RE,
  type GraphAttachmentMeta,
} from '@/lib/documents/attachments';

const GRAPH = 'https://graph.microsoft.com/v1.0/me';

export class GraphAuthError extends Error {}

export interface GraphHeader {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  hasAttachments?: boolean;
}

/** Pure: keep messages that look like documents. */
export function isGraphDocumentCandidate(m: GraphHeader): boolean {
  const subject = m.subject || '';
  if (m.hasAttachments) return DOCUMENT_SUBJECT_RE.test(subject);
  return BODY_RECEIPT_SUBJECT_RE.test(subject);
}

/** Returns the subset of `ids` already handled (so they are skipped while paging). */
export type HandledFilter = (ids: string[]) => Promise<Set<string>>;

/** Pages of 50 headers walked per run before stopping (2,000 headers). */
export const GRAPH_MAX_PAGES = 40;

/**
 * Up to `max` UNHANDLED document-like messages received since `sinceIso`.
 *
 * The walk is OLDEST FIRST, so progress is chronological: when it is cut
 * short (deadline, page cap, or `max` reached) `coveredUntil` is the
 * receivedDateTime of the last header that was fully examined, and every
 * candidate up to that point is either collected or already handled. The
 * caller can safely move its incremental cursor that far, which means a
 * busy inbox still makes progress run after run instead of being stuck
 * on a fixed lookback.
 *
 * Already handled ids are filtered page by page through `isHandled`.
 * `complete` is true only when the window was walked to its end.
 */
export async function searchGraphDocumentIds(
  token: string,
  opts: {
    sinceIso: string;
    max: number;
    isHandled: HandledFilter;
    deadlineAt?: number;
    maxPages?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<{ ids: string[]; complete: boolean; coveredUntil: string | null }> {
  const maxPages = opts.maxPages ?? GRAPH_MAX_PAGES;
  const out: string[] = [];
  let coveredUntil: string | null = null;
  let pages = 0;
  let url: string | null =
    `${GRAPH}/messages?` +
    new URLSearchParams({
      $filter: `receivedDateTime ge ${opts.sinceIso}`,
      $orderby: 'receivedDateTime asc',
      $select: 'id,subject,from,receivedDateTime,hasAttachments',
      $top: '50',
    }).toString();

  while (url) {
    if (pages >= maxPages || (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt)) {
      return { ids: out, complete: false, coveredUntil };
    }
    const res: Response = await fetchWithRetry(
      url,
      { headers: { Authorization: `Bearer ${token}` } },
      { label: 'graph docs list', deadlineAt: opts.deadlineAt, fetchImpl: opts.fetchImpl },
    );
    pages++;
    if (res.status === 401 || res.status === 403) throw new GraphAuthError(`Microsoft access denied (${res.status})`);
    if (!res.ok) throw new Error(`Graph list failed (${res.status})`);
    const data = (await res.json()) as { value?: GraphHeader[]; '@odata.nextLink'?: string };
    const page = data.value ?? [];
    const candidateIds = page.filter(isGraphDocumentCandidate).map((m) => m.id);
    const handled = candidateIds.length ? await opts.isHandled(candidateIds) : new Set<string>();
    for (const m of page) {
      if (isGraphDocumentCandidate(m) && !handled.has(m.id)) {
        if (out.length >= opts.max) return { ids: out, complete: false, coveredUntil };
        out.push(m.id);
      }
      if (m.receivedDateTime) coveredUntil = m.receivedDateTime;
    }
    url = data['@odata.nextLink'] || null;
  }
  return { ids: out, complete: true, coveredUntil };
}

export interface GraphFullMessage {
  id: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  body?: { contentType?: string; content?: string };
}

export async function getGraphMessage(token: string, id: string, deadlineAt?: number): Promise<GraphFullMessage> {
  const res = await fetchWithRetry(
    `${GRAPH}/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,receivedDateTime,hasAttachments,body`,
    { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' } },
    { label: 'graph docs get', deadlineAt },
  );
  if (res.status === 401 || res.status === 403) throw new GraphAuthError(`Microsoft access denied (${res.status})`);
  if (!res.ok) throw new Error(`Graph get failed (${res.status})`);
  return (await res.json()) as GraphFullMessage;
}

/** Attachment metadata only ($select keeps contentBytes out of the response). */
export async function listGraphAttachmentMeta(
  token: string,
  messageId: string,
  deadlineAt?: number,
): Promise<GraphAttachmentMeta[]> {
  const res = await fetchWithRetry(
    `${GRAPH}/messages/${encodeURIComponent(messageId)}/attachments?$select=id,name,contentType,size,isInline`,
    { headers: { Authorization: `Bearer ${token}` } },
    { label: 'graph docs attachments', deadlineAt },
  );
  if (!res.ok) throw new Error(`Graph attachments failed (${res.status})`);
  const data = (await res.json()) as { value?: GraphAttachmentMeta[] };
  return data.value ?? [];
}

/**
 * Raw bytes of one file attachment via /$value, which streams the file
 * itself instead of a base64 contentBytes field. Works for large
 * attachments (the vault's own 15 MB cap is checked on the listed size
 * before this is called, and again on the bytes received).
 */
export async function downloadGraphAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
  deadlineAt?: number,
): Promise<Buffer> {
  const res = await fetchWithRetry(
    `${GRAPH}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/$value`,
    { headers: { Authorization: `Bearer ${token}` } },
    { label: 'graph docs attachment', deadlineAt, timeoutMs: 40_000, maxElapsedMs: 60_000 },
  );
  if (!res.ok) throw new Error(`Graph attachment download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
