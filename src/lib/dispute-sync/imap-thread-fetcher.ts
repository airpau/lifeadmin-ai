/**
 * IMAP-specific thread fetcher for the Watchdog feature.
 *
 * Uses imapflow to connect to the user's mailbox and fetch all messages in a
 * thread. Threads are identified by the Message-ID of the root message; reply
 * chains are followed via the References: and In-Reply-To: headers (per RFC 5322).
 *
 * Kept in its own file (rather than inside fetchers.ts) so the heavy imapflow
 * + mailparser dependencies are only required when IMAP is actually used.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decryptPassword } from '../imap-scanner';
import type { EmailConnection, FetchedMessage } from './types';

function parseFromField(raw: string): { address: string; name: string; domain: string } {
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
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search the user's IMAP INBOX for all messages in the thread rooted at
 * `rootMessageId`, received after `since`.
 *
 * IMAP doesn't have a native concept of a "thread" like Gmail. We use the
 * standard approach: find every message whose References: header contains the
 * root Message-ID, plus the root itself.
 */
export async function searchImapThread(
  conn: EmailConnection,
  rootMessageId: string,
  since: Date | null,
): Promise<FetchedMessage[]> {
  if (!conn.imap_host || !conn.imap_port || !conn.imap_username) {
    throw new Error(`IMAP connection ${conn.id} is missing host/port/username.`);
  }
  const encryptedPw = conn.app_password_encrypted ?? conn.imap_password_encrypted;
  if (!encryptedPw) {
    throw new Error(`IMAP connection ${conn.id} has no encrypted password.`);
  }

  const client = new ImapFlow({
    host: conn.imap_host,
    port: conn.imap_port,
    secure: true,
    auth: { user: conn.imap_username, pass: decryptPassword(encryptedPw) },
    logger: false,
  });

  await client.connect();
  const messages: FetchedMessage[] = [];
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // IMAP HEADER search — look for the root Message-ID in References OR the
      // message itself. We run two searches and union the UIDs.
      const ownAddr = conn.email_address.toLowerCase();
      const sinceDate = since ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // default: last 90d

      const refMatches = await client.search({
        header: { references: rootMessageId },
        since: sinceDate,
      }) || [];
      const selfMatches = await client.search({
        header: { 'message-id': rootMessageId },
        since: sinceDate,
      }) || [];
      const inReplyToMatches = await client.search({
        header: { 'in-reply-to': rootMessageId },
        since: sinceDate,
      }) || [];

      const uids = Array.from(new Set([...refMatches, ...selfMatches, ...inReplyToMatches]));
      if (uids.length === 0) return [];

      for await (const msg of client.fetch(uids, { source: true, envelope: true })) {
        if (!msg.source) continue;
        try {
          const parsed = await simpleParser(msg.source);
          const fromRaw =
            parsed.from?.text ??
            (parsed.from?.value?.[0]?.address ?? '');
          const parsedFrom = parseFromField(fromRaw);

          // Skip messages sent by the user themselves
          if (parsedFrom.address && parsedFrom.address === ownAddr) continue;

          const receivedAt = parsed.date ?? new Date();
          if (since && receivedAt <= since) continue;

          const bodyText = parsed.text
            ? parsed.text.slice(0, 8000)
            : parsed.html
            ? stripHtml(parsed.html).slice(0, 8000)
            : '';

          const messageId =
            parsed.messageId ??
            String(msg.envelope?.messageId ?? msg.uid);

          messages.push({
            messageId,
            threadId: rootMessageId,
            subject: parsed.subject ?? msg.envelope?.subject ?? '',
            fromRaw,
            fromAddress: parsedFrom.address,
            fromName: parsedFrom.name,
            fromDomain: parsedFrom.domain,
            receivedAt,
            snippet: bodyText.slice(0, 150),
            body: bodyText,
          });
        } catch {
          // Ignore parse errors on individual messages; keep going.
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return messages;
}
