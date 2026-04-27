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

import { createClient } from '@supabase/supabase-js';
import { refreshAccessToken as refreshGmailToken } from '../gmail';
import { refreshMicrosoftToken } from '../outlook';
import type {
  EmailConnection,
  FetchedMessage,
  EmailProvider,
} from './types';
import { providerFromConnection } from './types';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Thrown when an OAuth refresh attempt fails and the connection needs a
 * human to reconnect. The caller should stop retrying and surface this via
 * the UI / business_log rather than keep polling on a dead token.
 */
export class EmailConnectionAuthError extends Error {
  constructor(
    message: string,
    readonly connectionId: string,
    readonly provider: EmailProvider,
  ) {
    super(message);
    this.name = 'EmailConnectionAuthError';
  }
}

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
  /** Ready-to-use OWA deep-link Graph issues per-message. */
  webLink?: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parseFrom(raw: string): { address: string; name: string; domain: string } {
  if (!raw) return { address: '', name: '', domain: '' };
  // Form 1: `Name <user@domain>` or `"Name" <user@domain>`. We match
  // this case explicitly so the bare-email path can fall through
  // cleanly. The previous combined regex was non-greedy on the name
  // capture but, when given a bare email like `autoresponse@aciuk.uk`
  // (no name, no angle brackets), backtracked into eating the first
  // letter as a "name" — leaving the address as `utoresponse@aciuk.uk`.
  // That broke the dedicated-auto-responder relevance bypass which
  // requires the local-part to begin with `autoresponse`.
  const angled = raw.match(/^\s*(?:"?([^"<]*?)"?\s*)<\s*([^<>\s@]+@[^<>\s]+)\s*>\s*$/);
  if (angled) {
    const address = angled[2].toLowerCase();
    return { address, name: (angled[1] ?? '').trim(), domain: address.split('@')[1] ?? '' };
  }
  // Form 2: bare email — extract the first email-shaped token.
  const bare = raw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? '';
  return {
    address: bare.toLowerCase(),
    name: '',
    domain: bare.split('@')[1]?.toLowerCase() ?? '',
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
  // HTML emails don\'t put newlines between block elements, so a naive
  // tag strip (plus collapsing all whitespace) ends up with every
  // sentence on a single line — unreadable. We convert block-level
  // tags to newlines BEFORE stripping so paragraphs, lists, rows and
  // headings keep their separation.
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    // Explicit line breaks → single newline
    .replace(/<br\s*\/?>/gi, '\n')
    // Paragraph / heading / list-item / table-row / div / blockquote /
    // section boundaries → double newline so the output gets proper
    // paragraph spacing once blank-line collapsing runs.
    .replace(/<\/(p|h[1-6]|li|tr|div|blockquote|section|article|header|footer|table|ul|ol)\s*>/gi, '\n\n')
    // Strip everything else
    .replace(/<[^>]+>/g, ' ')
    // HTML entities that commonly survive in mail bodies
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#8217;/g, '’')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    // Collapse horizontal whitespace (but keep newlines)
    .replace(/[ \t]+/g, ' ')
    // Trim whitespace at each line boundary
    .replace(/ *\n */g, '\n')
    // Collapse any run of 3+ newlines down to a paragraph gap
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeSnippet(body: string, n = 150): string {
  return body.length > n ? body.slice(0, n).trim() + '…' : body.trim();
}

async function markConnectionNeedsReauth(
  connectionId: string,
  provider: EmailProvider,
  message: string,
): Promise<void> {
  const db = admin();
  try {
    await db
      .from('email_connections')
      .update({
        status: 'needs_reauth',
        last_error: message.slice(0, 500),
        last_error_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    await db.from('business_log').insert({
      category: 'watchdog_error',
      title: `${provider} connection needs reauth`,
      content:
        `Email connection ${connectionId} (${provider}) failed to refresh its access token. ` +
        `User must reconnect via Profile. Error: ${message}`,
      created_by: 'dispute-sync-fetchers',
    });
  } catch {
    // Never let bookkeeping failures mask the real auth error.
  }
}

async function persistRefreshedToken(
  connectionId: string,
  accessToken: string,
  expiresInSeconds: number,
): Promise<void> {
  const db = admin();
  try {
    const expiry = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
    await db
      .from('email_connections')
      .update({
        access_token: accessToken,
        token_expiry: expiry,
        // If we were previously flagged, a successful refresh clears the flag.
        status: 'active',
        last_error: null,
        last_error_at: null,
      })
      .eq('id', connectionId);
  } catch {
    // Non-fatal — the in-memory token still works for this request.
  }
}

async function ensureFreshToken(conn: EmailConnection, provider: EmailProvider): Promise<string> {
  const expiresAt = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  const now = Date.now();
  if (conn.access_token && expiresAt - now > 60_000) return conn.access_token;

  if (!conn.refresh_token) {
    const msg = `No refresh token on file — user must reconnect ${provider}.`;
    await markConnectionNeedsReauth(conn.id, provider, msg);
    throw new EmailConnectionAuthError(msg, conn.id, provider);
  }

  try {
    if (provider === 'gmail') {
      const refreshed = await refreshGmailToken(conn.refresh_token);
      await persistRefreshedToken(conn.id, refreshed.access_token, refreshed.expires_in);
      return refreshed.access_token;
    }
    if (provider === 'outlook') {
      const refreshed = await refreshMicrosoftToken(conn.refresh_token);
      await persistRefreshedToken(conn.id, refreshed.access_token, refreshed.expires_in);
      return refreshed.access_token;
    }
    throw new Error(`ensureFreshToken called for non-OAuth provider: ${provider}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Token refresh failed';
    await markConnectionNeedsReauth(conn.id, provider, message);
    throw new EmailConnectionAuthError(message, conn.id, provider);
  }
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
    'id,conversationId,subject,from,receivedDateTime,bodyPreview,body,webLink',
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
      webLink: m.webLink,
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

/**
 * Fetch recent messages from a sender domain that ARE NOT in the currently-
 * linked thread. Catches auto-responses and follow-up replies that suppliers
 * send from a different address on the same domain
 * (e.g. an `autoresponse@aciuk.uk` ack after you wrote to `customer@aciuk.uk`)
 * which Gmail / Outlook treat as a brand-new thread.
 *
 * Returns messages in oldest → newest order. Caller is responsible for
 * deduping against already-imported correspondence via supplier_message_id.
 */
export async function fetchDomainMessages(
  conn: EmailConnection,
  senderDomain: string,
  since: Date | null,
  excludeThreadId: string,
): Promise<FetchedMessage[]> {
  if (!senderDomain) return [];
  const provider = providerFromConnection(conn);
  const ownAddr = conn.email_address.toLowerCase().trim();

  if (provider === 'gmail') {
    const token = await ensureFreshToken(conn, 'gmail');
    const afterTs = since ? `after:${Math.floor(since.getTime() / 1000)}` : 'newer_than:90d';
    // Use the documented `from:domain` form (no leading @) — `from:@domain`
    // works by fluke on some Gmail deployments but silently returns nothing
    // on others, which was hiding the 3:23am ACI autoresponse even though
    // it was in the inbox.
    const q = `from:${senderDomain} ${afterTs}`;
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('q', q);
    listUrl.searchParams.set('maxResults', '20');
    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) return [];
    const list = await listRes.json();
    const out: FetchedMessage[] = [];
    for (const m of (list.messages ?? []) as Array<{ id: string; threadId: string }>) {
      if (m.threadId === excludeThreadId) continue; // already covered by thread sync
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!detailRes.ok) continue;
      const msg = await detailRes.json();
      const headers: { name: string; value: string }[] = msg.payload?.headers ?? [];
      const get = (h: string) =>
        headers.find((x) => x.name.toLowerCase() === h.toLowerCase())?.value ?? '';
      const from = parseFrom(get('From'));
      if (!from.address || from.address.toLowerCase() === ownAddr) continue;
      const body = extractGmailBody(msg.payload);
      out.push({
        messageId: msg.id,
        threadId: msg.threadId,
        subject: get('Subject'),
        fromRaw: get('From'),
        fromAddress: from.address,
        fromName: from.name,
        fromDomain: from.domain,
        receivedAt: new Date(Number(msg.internalDate)),
        snippet: makeSnippet(body || msg.snippet || ''),
        body,
      });
    }
    return out.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  if (provider === 'outlook') {
    const token = await ensureFreshToken(conn, 'outlook');
    const sinceIso = (since ?? new Date(Date.now() - 90 * 86400_000)).toISOString();
    const url = new URL('https://graph.microsoft.com/v1.0/me/messages');
    // Graph doesn't expose `from:@domain` in $filter, but it does in $search
    // — which scans headers. We then exclude the current thread client-side.
    url.searchParams.set('$search', `"from:${senderDomain}"`);
    url.searchParams.set('$top', '20');
    url.searchParams.set(
      '$select',
      'id,conversationId,subject,from,receivedDateTime,bodyPreview,body,webLink',
    );
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const out: FetchedMessage[] = [];
    for (const m of (data.value ?? []) as GraphMessage[]) {
      if (m.conversationId === excludeThreadId) continue;
      const received = new Date(m.receivedDateTime);
      if (received < new Date(sinceIso)) continue;
      const raw = m.from?.emailAddress?.address ?? '';
      if (!raw || raw.toLowerCase() === ownAddr) continue;
      const name = m.from?.emailAddress?.name ?? '';
      const fromRaw = name ? `${name} <${raw}>` : raw;
      const parsed = parseFrom(fromRaw);
      if (!parsed.domain.toLowerCase().endsWith(senderDomain.toLowerCase())) continue;
      const bodyText =
        m.body?.contentType === 'html'
          ? stripHtml(m.body.content ?? '')
          : (m.body?.content ?? '').trim();
      out.push({
        messageId: m.id,
        threadId: m.conversationId ?? '',
        subject: m.subject ?? '',
        fromRaw,
        fromAddress: parsed.address,
        fromName: parsed.name,
        fromDomain: parsed.domain,
        receivedAt: received,
        snippet: makeSnippet(bodyText || m.bodyPreview || ''),
        body: bodyText.slice(0, 8000),
        webLink: m.webLink,
      });
    }
    return out.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  // IMAP domain-scan not implemented yet — uncommon on Watchdog right now.
  return [];
}
