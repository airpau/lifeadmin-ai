/**
 * Gmail calls for the documents vault. Every request goes through
 * fetchWithRetry (stage one) so 429 and 5xx are retried with backoff and
 * nothing outlives the caller's deadline.
 */

import { fetchWithRetry } from '@/lib/email/fetch-retry';
import type { GmailPayloadPart } from '@/lib/documents/attachments';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';

const EXCLUDE = '-in:chats -category:promotions -category:social';

/**
 * Three focused searches, the same approach as the inbox scanner's
 * parallel queries: attachments with a document-like subject,
 * attachments with a document-like filename, and attachment-free
 * receipts whose email body is the document.
 */
export function gmailDocumentQueries(recency: string): string[] {
  return [
    `has:attachment ${recency} ${EXCLUDE} subject:(receipt OR invoice OR bill OR statement OR renewal OR policy OR certificate OR contract OR agreement OR "order confirmation" OR "payment confirmation" OR tax OR VAT OR P60 OR payslip OR schedule OR documents OR warranty OR insurance OR tenancy OR MOT)`,
    `has:attachment ${recency} ${EXCLUDE} filename:(invoice OR receipt OR statement OR policy OR certificate OR bill OR contract OR schedule)`,
    `-has:attachment ${recency} ${EXCLUDE} subject:(receipt OR invoice OR "order confirmation" OR "payment confirmation" OR "payment received" OR "your bill" OR "tax invoice" OR "your statement")`,
  ];
}

/** Recency clause: incremental after a timestamp, else newer_than:Nd. */
export function gmailRecency(opts: { sinceEpochSeconds?: number | null; days: number }): string {
  if (opts.sinceEpochSeconds && opts.sinceEpochSeconds > 0) return `after:${Math.floor(opts.sinceEpochSeconds)}`;
  return `newer_than:${Math.max(1, Math.floor(opts.days))}d`;
}

async function gmailGet(token: string, url: string, label: string, deadlineAt?: number): Promise<Response> {
  return fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } }, { label, deadlineAt });
}

export class GmailAuthError extends Error {}

/** Returns the subset of `ids` already handled (so they are skipped while paging). */
export type HandledFilter = (ids: string[]) => Promise<Set<string>>;

/** Pages of 100 ids walked per query before giving up for this run. */
export const GMAIL_MAX_PAGES_PER_QUERY = 10;

/**
 * Up to `max` UNHANDLED message ids matching the document queries.
 *
 * Already handled ids are filtered out page by page (one batched lookup
 * per page through `isHandled`), and paging continues until enough
 * unhandled candidates are collected, the window is exhausted, the
 * deadline hits or the page cap is reached. Each query gets its own
 * share of `max` (unused share rolls forward to later queries), so the
 * attachment-free receipt search still runs when the attachment
 * searches have plenty.
 *
 * `complete` is true only when every query was walked to the end of its
 * results. It is false when the deadline, a page cap or a query's share
 * cut the walk short, so the caller knows unseen candidates may remain.
 */
export async function searchGmailDocumentIds(
  token: string,
  opts: {
    recency: string;
    max: number;
    isHandled: HandledFilter;
    deadlineAt?: number;
    maxPagesPerQuery?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<{ ids: string[]; complete: boolean }> {
  const queries = gmailDocumentQueries(opts.recency);
  const maxPages = opts.maxPagesPerQuery ?? GMAIL_MAX_PAGES_PER_QUERY;
  const seen = new Set<string>();
  const out: string[] = [];
  let complete = true;

  for (let qi = 0; qi < queries.length; qi++) {
    const share = Math.ceil(Math.max(0, opts.max - out.length) / (queries.length - qi));
    let collected = 0;
    let pages = 0;
    let pageToken: string | undefined;
    while (true) {
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) return { ids: out, complete: false };
      if (pages >= maxPages) {
        complete = false;
        break;
      }
      const params = new URLSearchParams({ q: queries[qi], maxResults: '100' });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await fetchWithRetry(
        `${GMAIL}/messages?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { label: 'gmail docs list', deadlineAt: opts.deadlineAt, fetchImpl: opts.fetchImpl },
      );
      pages++;
      if (res.status === 401 || res.status === 403) throw new GmailAuthError(`Gmail access denied (${res.status})`);
      if (!res.ok) throw new Error(`Gmail list failed (${res.status})`);
      const data = (await res.json()) as { messages?: Array<{ id: string }>; nextPageToken?: string };
      const pageIds = (data.messages ?? []).map((m) => m.id).filter((id) => !seen.has(id));
      pageIds.forEach((id) => seen.add(id));
      const handled = pageIds.length ? await opts.isHandled(pageIds) : new Set<string>();
      let overflow = false;
      for (const id of pageIds) {
        if (handled.has(id)) continue;
        if (collected >= share) {
          overflow = true;
          break;
        }
        out.push(id);
        collected++;
      }
      if (overflow) {
        complete = false;
        break;
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
  }
  return { ids: out, complete };
}

export interface GmailFullMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPayloadPart;
}

export async function getGmailMessage(token: string, id: string, deadlineAt?: number): Promise<GmailFullMessage> {
  const res = await gmailGet(token, `${GMAIL}/messages/${encodeURIComponent(id)}?format=full`, 'gmail docs get', deadlineAt);
  if (res.status === 401 || res.status === 403) throw new GmailAuthError(`Gmail access denied (${res.status})`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status})`);
  return (await res.json()) as GmailFullMessage;
}

export async function downloadGmailAttachment(
  token: string,
  messageId: string,
  attachmentId: string,
  deadlineAt?: number,
): Promise<Buffer> {
  const res = await fetchWithRetry(
    `${GMAIL}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    // Large attachments: allow a longer single attempt than list calls.
    { label: 'gmail docs attachment', deadlineAt, timeoutMs: 40_000, maxElapsedMs: 60_000 },
  );
  if (!res.ok) throw new Error(`Gmail attachment download failed (${res.status})`);
  const data = (await res.json()) as { data?: string };
  if (!data.data) throw new Error('Gmail attachment had no data');
  return Buffer.from(data.data, 'base64url');
}
