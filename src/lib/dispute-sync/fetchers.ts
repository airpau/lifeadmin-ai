/**
 * Provider-specific fetchers for the Watchdog dispute-email-sync feature.
 *
 * Each fetcher pulls new messages from a linked thread since the last sync.
 * Returns a normalised FetchedMessage[] the cron can iterate over.
 *
 * Gmail scope is read-only (gmail.readonly). Outlook uses Microsoft Graph
 * Mail.Read. IMAP uses the existing encrypted-password flow from imap-scanner.ts.
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §6
 */

import { refreshAccessToken as refreshGmailToken } from '../gmail';
import { refreshMicrosoftToken } from '../outlook';
import type {
  EmailConnection,
  FetchedMessage,
  EmailProvider,
} from './types';
import { providerFromConnection } from './types';

// Local type mirroring the shape Microsoft Graph /me/messages returns with
// the $select we request. Kept inline so the outlook.ts public surface
// doesn't need to change.
interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  receivedDateTime: string;
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  body?: { contentType?: 'text' | 'html'; content?: string };
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parseFrom(raw: string): { address: string; name: string; domain: string } {
  if (!raw) return { address: '', name: '', domain: '' };
  const match = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)?<?([^<>\s]+@[^<>\s]+)>?\s*$/);
  if (!match) {
    const bare = raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? '';
    return {
      address: bare,
      name: '',
      domain: bare.split('@')[1]?.toLowerCase() ?? '',
    };
  }
  const address = match[2].toLowerCase();
  return {
    address,
    name: (match[1] ?? '').trim(),
    domain: address.split('@')[1] ?? '',
  };
}

function stripHtml(input: string): string {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSnippet(body: string, n = 150): string {
  return body.length > n ? body.slice(0, n).trim() + '…' : body.trim();
}

async function ensureFreshToken(conn: EmailConnection, provider: EmailProvider): Promise<string> {
  const expiresAt = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  const now = Date.now();
  if (conn.access_token && expiresAt - now > 60_000) return conn.access_token;

  if (!conn.refresh_token) {
    throw new Error(`No refresh token for connection ${conn.id}; user must reconnect ${provider}.`);
  }

  if (provider === 'gmail') {
    const refreshed = await refreshGmailToken(conn.refresh_token);
    return refreshed.access_token;
  }
  if (provider === 'outlook') {
    const refreshed = await refreshMicrosoftToken(conn.refresh_token);
    return refreshed.access_token;
  }
  throw new Error(`ensureFreshToken called for non-OAuth provider: ${provider}`);
}

// -----------------------------------------------------------------------------
// Gmail
// -----------------------------------------------------------------------------

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

function extractGmailBody(payload: GmailPart): string {
  // Prefer text/plain; fall back to text/html (stripped)
  const findByMime = (part: GmailPart, mime: string): string => {
    if (part.mimeType === mime && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
    for (const p of part.parts ?? []) {
      const v = findByMime(p, mime);
      if (v) return v;
    }
    return '';
  };
  const plain = findByMime(payload, 'text/plain');
  if (plain) return plain.trim().slice(0, 8000);
  const html = findByMime(payload, 'text/html');
  if (html) return stripHtml(html).slice(0, 8000);
  return '';
}

async function fetchGmailThread(
  conn: EmailConnection,
  threadId: string,
  since: Date | null,
): Promise<FetchedMessage[]> {
  const token = await ensureFreshToken(conn, 'gmail');
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return []; // thread deleted or archived in a way that hides it
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail threads.get failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const thread = await res.json();
  const messages: FetchedMessage[] = [];
  for (const msg of thread.messages ?? []) {
    const internalDate = new Date(Number(msg.internalDate));
    if (since && internalDate <= since) continue;

    const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
    const get = (h: string) =>
      headers.find((x) => x.name.toLowerCase() === h.toLowerCase())?.value ?? '';
    const from = parseFrom(get('From'));
    const body = extractGmailBody(msg.payload);

    messages.push({
      messageId: msg.id,
      threadId: msg.threadId,
      subject: get('Subject'),
      fromRaw: get('From'),
      fromAddress: from.address,
      fromName: from.name,
      fromDomain: from.domain,
      receivedAt: internalDate,
      snippet: makeSnippet(body || msg.snippet || ''),
      body,
    });
  }
  return messages;
}

// -----------------------------------------------------------------------------
// Outlook / Microsoft Graph
// -----------------------------------------------------------------------------

async function fetchOutlookConversation(
  conn: EmailConnection,
  conversationId: string,
  since: Date | null,
): Promise<FetchedMessage[]> {
  const token = await ensureFreshToken(conn, 'outlook');
  const filterParts = [`conversationId eq '${conversationId.replace(/'/g, "''")}'`];
  if (since) filterParts.push(`receivedDateTime gt ${since.toISOString()}`);

  const url = new URL('https://graph.microsoft.com/v1.0/me/messages');
  url.searchParams.set('$filter', filterParts.join(' and '));
  url.searchParams.set('$orderby', 'receivedDateTime asc');
  url.searchParams.set('$top', '50');
  url.searchParams.set(
    '$select',
    'id,conversationId,subject,from,receivedDateTime,bodyPreview,body',
  );

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph /me/messages failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const messages: FetchedMessage[] = [];
  for (const m of (data.value ?? []) as GraphMessage[]) {
    const raw = m.from?.emailAddress?.address ?? '';
    const name = m.from?.emailAddress?.name ?? '';
    const fromRaw = name ? `${name} <${raw}>` : raw;
    const parsed = parseFrom(fromRaw);
    const bodyText =
      m.body?.contentType === 'html'
        ? stripHtml(m.body.content ?? '')
        : (m.body?.content ?? '').trim();

    messages.push({
      messageId: m.id,
      threadId: m.conversationId ?? conversationId,
      subject: m.subject ?? '',
      fromRaw,
      fromAddress: parsed.address,
      fromName: parsed.name,
      fromDomain: parsed.domain,
      receivedAt: new Date(m.receivedDateTime),
      snippet: makeSnippet(bodyText || m.bodyPreview || ''),
      body: bodyText.slice(0, 8000),
    });
  }
  return messages;
}

// -----------------------------------------------------------------------------
// IMAP
// -----------------------------------------------------------------------------

async function fetchImapThread(
  conn: EmailConnection,
  rootMessageId: string,
  since: Date | null,
): Promise<FetchedMessage[]> {
  // Dynamic import so the heavy IMAP dependency is only loaded when we actually
  // use it (keeps cold-start time down on Vercel).
  const { searchImapThread } = await import('./imap-thread-fetcher');
  return searchImapThread(conn, rootMessageId, since);
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

/**
 * Fetch all messages in the given thread that are newer than `since`.
 *
 * - If `since` is null, returns the entire thread (used on first link).
 * - Filters out messages sent BY the user (matched on from-address === connection email).
 * - Returns messages in chronological order (oldest → newest).
 */
export async function fetchNewMessages(
  conn: EmailConnection,
  threadId: string,
  since: Date | null,
): Promise<FetchedMessage[]> {
  const provider = providerFromConnection(conn);
  let raw: FetchedMessage[];
  switch (provider) {
    case 'gmail':
      raw = await fetchGmailThread(conn, threadId, since);
      break;
    case 'outlook':
      raw = await fetchOutlookConversation(conn, threadId, since);
      break;
    case 'imap':
      raw = await fetchImapThread(conn, threadId, since);
      break;
  }
  const ownAddr = conn.email_address.toLowerCase().trim();
  return raw
    .filter((m) => m.fromAddress && m.fromAddress.toLowerCase() !== ownAddr)
    .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
}
