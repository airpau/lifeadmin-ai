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

/** Message ids matching any of the document queries, newest first, de-duplicated. */
export async function searchGmailDocumentIds(
  token: string,
  opts: { recency: string; max: number; deadlineAt?: number },
): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of gmailDocumentQueries(opts.recency)) {
    let pageToken: string | undefined;
    do {
      if (out.length >= opts.max) return out;
      if (opts.deadlineAt !== undefined && Date.now() >= opts.deadlineAt) return out;
      const params = new URLSearchParams({ q, maxResults: String(Math.min(100, opts.max)) });
      if (pageToken) params.set('pageToken', pageToken);
      const res = await gmailGet(token, `${GMAIL}/messages?${params}`, 'gmail docs list', opts.deadlineAt);
      if (res.status === 401 || res.status === 403) throw new GmailAuthError(`Gmail access denied (${res.status})`);
      if (!res.ok) throw new Error(`Gmail list failed (${res.status})`);
      const data = (await res.json()) as { messages?: Array<{ id: string }>; nextPageToken?: string };
      for (const m of data.messages ?? []) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          out.push(m.id);
          if (out.length >= opts.max) return out;
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  return out;
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
