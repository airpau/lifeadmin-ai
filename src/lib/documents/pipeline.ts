/**
 * "Find my documents": walk every connected inbox for one user, pick out
 * receipts, invoices, bills, statements, certificates, policies,
 * contracts and letters, and file them into the vault.
 *
 * Shared by the manual route (/api/documents/find, every plan) and the
 * daily cron (/api/cron/document-filing, Essential and Pro).
 *
 * Built on stage one:
 *  - listActiveOAuthConnections / getScanAccessToken: every connection is
 *    handled on its own, tokens decrypted on read and refreshed per row
 *  - fetchWithRetry deadlines on every Gmail and Graph call
 *  - extractGmailBodyText / graphBodyToText for the classifier's context
 *
 * Guarantees:
 *  - a message is recorded in document_processed_messages once it has a
 *    final outcome, and is never downloaded or classified again
 *  - transient failures and quota stops are NOT recorded, so those
 *    messages are retried on the next run
 *  - the Free monthly cap is checked before every save
 *  - nothing is sent anywhere: the only writes are to the user's own
 *    vault and, for Pro with Drive connected, the user's own Drive
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getScanAccessToken,
  listActiveOAuthConnections,
  type OAuthConnectionRow,
  type OAuthScanProvider,
} from '@/lib/email/oauth-connections';
import { extractGmailBodyText, graphBodyToText } from '@/lib/email/body-text';
import {
  BODY_RECEIPT_SUBJECT_RE,
  attachmentSkipReason,
  gmailBodies,
  gmailHeader,
  listGmailAttachments,
  listGraphAttachments,
  type AttachmentCandidate,
} from '@/lib/documents/attachments';
import { buildEmailSnapshotHtml } from '@/lib/documents/snapshot';
import { classifyDocument, type ClassificationResult } from '@/lib/documents/classify';
import { storeDocument, type StoreOutcome } from '@/lib/documents/store';
import { DriveFilingContext } from '@/lib/documents/drive';
import type { DocumentEntitlements } from '@/lib/documents/plan';
import {
  downloadGmailAttachment,
  getGmailMessage,
  gmailRecency,
  GmailAuthError,
  searchGmailDocumentIds,
} from '@/lib/documents/gmail-docs';
import {
  downloadGraphAttachment,
  getGraphMessage,
  GraphAuthError,
  listGraphAttachmentMeta,
  searchGraphDocumentIds,
} from '@/lib/documents/graph-docs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/** Minimum confidence to keep an email body (no attachment) as a document. */
export const BODY_SNAPSHOT_MIN_CONFIDENCE = 0.6;

/** Do not start a new message with less than this left before the deadline. */
const MESSAGE_START_MARGIN_MS = 20_000;
/** Do not start a new inbox with less than this left. */
const CONNECTION_START_MARGIN_MS = 35_000;
/** Overlap for incremental runs so a late-arriving message is not missed. */
const INCREMENTAL_OVERLAP_MS = 2 * 24 * 60 * 60 * 1000;
/** Give up on an inbox after this many per-message errors in one run. */
const MAX_ERRORS_PER_CONNECTION = 5;

export interface FindOptions {
  userId: string;
  ent: DocumentEntitlements;
  trigger: 'manual' | 'cron';
  /** Absolute epoch ms by which the run must finish. */
  deadlineAt: number;
  /** Candidate messages looked at per inbox per run. */
  maxMessagesPerConnection: number;
  /** Most documents to save this run. null = no cap (quota is still enforced via ent). */
  maxSaves: number | null;
  /** Lookback for a full (non-incremental) run, days. */
  lookbackDays: number;
  /** For the cost ledger. */
  endpoint: string;
}

export interface ConnectionSummary {
  connectionId: string;
  email: string;
  provider: OAuthScanProvider;
  status: 'scanned' | 'partial' | 'needs_reauth' | 'error' | 'skipped';
  candidates: number;
  processed: number;
  saved: number;
  duplicates: number;
  error?: string;
}

export interface FindSummary {
  connections: ConnectionSummary[];
  saved: number;
  duplicates: number;
  classified: number;
  driveFiled: number;
  driveFailed: number;
  stoppedFor: 'quota' | 'time' | null;
  savedIds: string[];
}

type MessageOutcome =
  | { kind: 'final'; outcome: 'saved' | 'duplicate' | 'no_documents' | 'not_document' | 'skipped'; saved: number; duplicates: number; detail?: string }
  | { kind: 'retry'; reason: 'quota' | 'transient'; saved: number; duplicates: number; detail?: string };

interface RunState {
  opts: FindOptions;
  admin: Admin;
  summary: FindSummary;
  drive: DriveFilingContext | null;
}

function quotaLeft(s: RunState): boolean {
  return s.opts.maxSaves === null || s.summary.saved < s.opts.maxSaves;
}

async function afterStore(s: RunState, outcome: StoreOutcome, bytes: Buffer): Promise<'saved' | 'duplicate' | 'skipped' | 'error'> {
  if (outcome.status === 'saved') {
    s.summary.saved++;
    s.summary.savedIds.push(outcome.doc.id);
    if (s.drive) {
      const r = await s.drive.file({ ...outcome.doc, bytes });
      if (r === 'filed') s.summary.driveFiled++;
      else if (r === 'failed') s.summary.driveFailed++;
    }
    return 'saved';
  }
  if (outcome.status === 'duplicate') {
    s.summary.duplicates++;
    return 'duplicate';
  }
  if (outcome.status === 'skipped') return 'skipped';
  console.warn('[documents.pipeline] store failed:', outcome.message);
  return 'error';
}

/** Shared per-message logic once the provider details are in hand. */
async function handleMessage(
  s: RunState,
  conn: OAuthConnectionRow,
  provider: OAuthScanProvider,
  m: {
    id: string;
    subject: string;
    from: string;
    to: string;
    dateIso: string | null;
    bodyText: string;
    html: string | null;
    text: string | null;
    attachments: AttachmentCandidate[];
    download: (a: AttachmentCandidate) => Promise<Buffer>;
  },
): Promise<MessageOutcome> {
  const { opts } = s;
  const keep = m.attachments.filter((a) => attachmentSkipReason(a) === null);
  let saved = 0;
  let duplicates = 0;

  if (keep.length > 0) {
    let errors = 0;
    for (const a of keep) {
      if (!quotaLeft(s)) return { kind: 'retry', reason: 'quota', saved, duplicates };
      let bytes: Buffer;
      try {
        bytes = a.inlineData ? Buffer.from(a.inlineData, 'base64url') : await m.download(a);
      } catch (err) {
        errors++;
        console.warn('[documents.pipeline] download failed:', err instanceof Error ? err.message : err);
        continue;
      }
      let classifiedHere = false;
      const outcome = await storeDocument(s.admin, {
        userId: opts.userId,
        source: 'email',
        connectionId: conn.id,
        provider,
        messageId: m.id,
        partKey: a.partKey,
        emailSubject: m.subject,
        emailFrom: m.from,
        emailDate: m.dateIso,
        filename: a.filename,
        mimeType: a.mimeType,
        bytes,
        classify: async () => {
          classifiedHere = true;
          const r = await classifyDocument(
            { mode: 'attachment', sender: m.from, subject: m.subject, filename: a.filename, mimeType: a.mimeType, bodyText: m.bodyText, emailDate: m.dateIso },
            { userId: opts.userId, endpoint: opts.endpoint },
          );
          return { result: r.result, model: r.model };
        },
      });
      if (classifiedHere) s.summary.classified++;
      const r = await afterStore(s, outcome, bytes);
      if (r === 'saved') saved++;
      else if (r === 'duplicate') duplicates++;
      else if (r === 'error') errors++;
    }
    if (errors > 0 && saved === 0 && duplicates === 0) {
      return { kind: 'retry', reason: 'transient', saved, duplicates, detail: 'attachment errors' };
    }
    if (saved > 0) return { kind: 'final', outcome: 'saved', saved, duplicates };
    if (duplicates > 0) return { kind: 'final', outcome: 'duplicate', saved, duplicates };
    return { kind: 'final', outcome: 'skipped', saved, duplicates };
  }

  // No usable attachment: is the email itself the receipt?
  if (!BODY_RECEIPT_SUBJECT_RE.test(m.subject)) {
    return { kind: 'final', outcome: 'no_documents', saved: 0, duplicates: 0 };
  }
  if (!m.html && !m.text) return { kind: 'final', outcome: 'no_documents', saved: 0, duplicates: 0 };
  if (!quotaLeft(s)) return { kind: 'retry', reason: 'quota', saved: 0, duplicates: 0 };

  const c = await classifyDocument(
    { mode: 'email_body', sender: m.from, subject: m.subject, filename: 'email.html', mimeType: 'text/html', bodyText: m.bodyText, emailDate: m.dateIso },
    { userId: opts.userId, endpoint: opts.endpoint },
  );
  s.summary.classified++;
  if (c.apiError) return { kind: 'retry', reason: 'transient', saved: 0, duplicates: 0, detail: 'classifier unavailable' };
  if (!c.result.is_document || c.result.confidence < BODY_SNAPSHOT_MIN_CONFIDENCE) {
    return { kind: 'final', outcome: 'not_document', saved: 0, duplicates: 0 };
  }

  const html = buildEmailSnapshotHtml({ from: m.from, to: m.to, date: m.dateIso || '', subject: m.subject, html: m.html, text: m.text });
  const bytes = Buffer.from(html, 'utf8');
  const datePart = (m.dateIso || new Date().toISOString()).slice(0, 10);
  const precomputed: ClassificationResult = c.result;
  const outcome = await storeDocument(s.admin, {
    userId: opts.userId,
    source: 'email',
    connectionId: conn.id,
    provider,
    messageId: m.id,
    partKey: 'body',
    emailSubject: m.subject,
    emailFrom: m.from,
    emailDate: m.dateIso,
    filename: `${datePart} ${m.subject || 'Email receipt'}.html`,
    mimeType: 'text/html',
    bytes,
    classify: async () => ({ result: precomputed, model: c.model }),
  });
  const r = await afterStore(s, outcome, bytes);
  if (r === 'saved') return { kind: 'final', outcome: 'saved', saved: 1, duplicates: 0 };
  if (r === 'duplicate') return { kind: 'final', outcome: 'duplicate', saved: 0, duplicates: 1 };
  if (r === 'skipped') return { kind: 'final', outcome: 'skipped', saved: 0, duplicates: 0 };
  return { kind: 'retry', reason: 'transient', saved: 0, duplicates: 0, detail: 'store failed' };
}

async function alreadyProcessed(admin: Admin, userId: string, connectionId: string, ids: string[]): Promise<Set<string>> {
  const done = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await admin
      .from('document_processed_messages')
      .select('message_id')
      .eq('user_id', userId)
      .eq('connection_id', connectionId)
      .in('message_id', chunk);
    for (const r of data ?? []) done.add(r.message_id as string);
  }
  return done;
}

async function recordProcessed(
  admin: Admin,
  userId: string,
  conn: OAuthConnectionRow,
  provider: OAuthScanProvider,
  messageId: string,
  o: Extract<MessageOutcome, { kind: 'final' }>,
): Promise<void> {
  try {
    await admin.from('document_processed_messages').upsert(
      {
        user_id: userId,
        connection_id: conn.id,
        provider,
        message_id: messageId,
        outcome: o.outcome,
        documents_saved: o.saved,
        detail: o.detail ?? null,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,connection_id,message_id', ignoreDuplicates: true },
    );
  } catch {
    // Bookkeeping: worst case the message is looked at again next run,
    // where the SHA-256 check stops it being saved twice.
  }
}

async function processConnection(s: RunState, conn: OAuthConnectionRow, provider: OAuthScanProvider, lastDocScanAt: string | null): Promise<ConnectionSummary> {
  const { opts, admin } = s;
  const summary: ConnectionSummary = {
    connectionId: conn.id,
    email: conn.email_address,
    provider,
    status: 'scanned',
    candidates: 0,
    processed: 0,
    saved: 0,
    duplicates: 0,
  };
  const runStartedAt = new Date().toISOString();

  const tok = await getScanAccessToken(admin, conn, { alwaysRefresh: false });
  if (!tok.ok) {
    summary.status = tok.reason === 'needs_reauth' ? 'needs_reauth' : 'error';
    summary.error = tok.message;
    return summary;
  }
  const token = tok.accessToken;

  // Incremental for the cron once an inbox has had a documents run; a
  // full lookback otherwise (and always for the manual button).
  const incrementalSince =
    opts.trigger === 'cron' && lastDocScanAt ? new Date(new Date(lastDocScanAt).getTime() - INCREMENTAL_OVERLAP_MS) : null;
  const fetchDeadline = opts.deadlineAt - MESSAGE_START_MARGIN_MS;

  let ids: string[];
  let searchTruncated = false;
  try {
    if (provider === 'google') {
      const found = await searchGmailDocumentIds(token, {
        recency: gmailRecency({ sinceEpochSeconds: incrementalSince ? incrementalSince.getTime() / 1000 : null, days: opts.lookbackDays }),
        max: opts.maxMessagesPerConnection * 2,
        deadlineAt: fetchDeadline,
      });
      ids = found.ids;
      searchTruncated = found.truncated;
    } else {
      const since = incrementalSince ?? new Date(Date.now() - opts.lookbackDays * 86_400_000);
      const found = await searchGraphDocumentIds(token, {
        sinceIso: since.toISOString(),
        max: opts.maxMessagesPerConnection * 2,
        deadlineAt: fetchDeadline,
      });
      ids = found.headers.map((h) => h.id);
      searchTruncated = found.truncated;
    }
  } catch (err) {
    summary.status = 'error';
    summary.error = err instanceof GmailAuthError || err instanceof GraphAuthError ? 'Inbox access was refused. Please reconnect it.' : (err instanceof Error ? err.message : 'Search failed');
    return summary;
  }

  const done = await alreadyProcessed(admin, opts.userId, conn.id, ids);
  const todo = ids.filter((id) => !done.has(id)).slice(0, opts.maxMessagesPerConnection);
  summary.candidates = todo.length;
  let errors = 0;
  // Incomplete when the search itself was cut short, or when more
  // unhandled messages were found than this run will look at. Either way
  // the incremental cursor must not move past them.
  let incomplete = searchTruncated || ids.length - done.size > todo.length;

  for (const id of todo) {
    if (Date.now() > opts.deadlineAt - MESSAGE_START_MARGIN_MS) {
      s.summary.stoppedFor = s.summary.stoppedFor ?? 'time';
      incomplete = true;
      break;
    }
    if (!quotaLeft(s)) {
      s.summary.stoppedFor = 'quota';
      incomplete = true;
      break;
    }
    let outcome: MessageOutcome;
    try {
      if (provider === 'google') {
        const msg = await getGmailMessage(token, id, opts.deadlineAt);
        const p = msg.payload;
        const bodies = gmailBodies(p);
        outcome = await handleMessage(s, conn, provider, {
          id,
          subject: gmailHeader(p, 'Subject'),
          from: gmailHeader(p, 'From'),
          to: gmailHeader(p, 'To'),
          dateIso: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
          bodyText: extractGmailBodyText(p),
          html: bodies.html,
          text: bodies.text,
          attachments: listGmailAttachments(p),
          download: (a) => downloadGmailAttachment(token, id, a.downloadId as string, opts.deadlineAt),
        });
      } else {
        const msg = await getGraphMessage(token, id, opts.deadlineAt);
        const metas = msg.hasAttachments ? await listGraphAttachmentMeta(token, id, opts.deadlineAt) : [];
        const isHtml = (msg.body?.contentType || '').toLowerCase() === 'html';
        outcome = await handleMessage(s, conn, provider, {
          id,
          subject: msg.subject || '',
          from: msg.from?.emailAddress?.address || msg.from?.emailAddress?.name || '',
          to: (msg.toRecipients ?? []).map((r) => r.emailAddress?.address).filter(Boolean).join(', '),
          dateIso: msg.receivedDateTime || null,
          bodyText: graphBodyToText(msg.body),
          html: isHtml ? msg.body?.content || null : null,
          text: isHtml ? null : msg.body?.content || null,
          attachments: listGraphAttachments(metas),
          download: (a) => downloadGraphAttachment(token, id, a.downloadId as string, opts.deadlineAt),
        });
      }
    } catch (err) {
      errors++;
      console.warn(`[documents.pipeline] message ${id} failed:`, err instanceof Error ? err.message : err);
      if (err instanceof GmailAuthError || err instanceof GraphAuthError || errors >= MAX_ERRORS_PER_CONNECTION) {
        summary.status = 'error';
        summary.error = 'Too many errors reading this inbox. We will try again later.';
        incomplete = true;
        break;
      }
      incomplete = true;
      continue;
    }

    summary.saved += outcome.saved;
    summary.duplicates += outcome.duplicates;
    if (outcome.kind === 'final') {
      summary.processed++;
      await recordProcessed(admin, opts.userId, conn, provider, id, outcome);
    } else {
      incomplete = true;
      if (outcome.reason === 'quota') {
        s.summary.stoppedFor = 'quota';
        break;
      }
    }
  }

  if (summary.status === 'scanned' && incomplete) summary.status = 'partial';
  if (summary.status === 'scanned') {
    // Only a complete pass moves the incremental cursor forward.
    await admin.from('email_connections').update({ documents_scanned_at: runStartedAt }).eq('id', conn.id);
  }
  return summary;
}

/** Run "Find my documents" for one user across every connected inbox. */
export async function findDocumentsForUser(admin: Admin, opts: FindOptions): Promise<FindSummary> {
  const s: RunState = {
    opts,
    admin,
    summary: { connections: [], saved: 0, duplicates: 0, classified: 0, driveFiled: 0, driveFailed: 0, stoppedFor: null, savedIds: [] },
    drive: opts.ent.driveDocumentFiling ? new DriveFilingContext(admin, opts.userId) : null,
  };

  const conns: Array<{ row: OAuthConnectionRow; provider: OAuthScanProvider }> = [];
  for (const provider of ['google', 'outlook'] as const) {
    const { rows } = await listActiveOAuthConnections(admin, opts.userId, provider);
    for (const row of rows) conns.push({ row, provider });
  }
  if (conns.length === 0) return s.summary;

  // documents_scanned_at is this feature's own cursor (additive column).
  const cursor = new Map<string, string | null>();
  const { data: cursorRows } = await admin
    .from('email_connections')
    .select('id, documents_scanned_at')
    .in('id', conns.map((c) => c.row.id));
  for (const r of cursorRows ?? []) cursor.set(r.id as string, (r.documents_scanned_at as string | null) ?? null);

  // Least recently filed inbox first, so a run that hits its time budget
  // does not starve the same inbox every day.
  conns.sort((a, b) => (cursor.get(a.row.id) || '').localeCompare(cursor.get(b.row.id) || ''));

  for (const { row, provider } of conns) {
    if (Date.now() > opts.deadlineAt - CONNECTION_START_MARGIN_MS) {
      s.summary.connections.push({ connectionId: row.id, email: row.email_address, provider, status: 'skipped', candidates: 0, processed: 0, saved: 0, duplicates: 0 });
      s.summary.stoppedFor = s.summary.stoppedFor ?? 'time';
      continue;
    }
    if (!quotaLeft(s)) {
      s.summary.connections.push({ connectionId: row.id, email: row.email_address, provider, status: 'skipped', candidates: 0, processed: 0, saved: 0, duplicates: 0 });
      s.summary.stoppedFor = 'quota';
      continue;
    }
    s.summary.connections.push(await processConnection(s, row, provider, cursor.get(row.id) ?? null));
  }
  return s.summary;
}
