/**
 * Universal IMAP email scanner.
 *
 * Connects to any IMAP server via imapflow and searches for financial emails
 * (bills, invoices, subscriptions, renewals, receipts) from the last N days.
 * Groups results by sender for efficient Claude analysis.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';

// ---------------------------------------------------------------------------
// Provider auto-discovery
// ---------------------------------------------------------------------------

interface ImapSettings {
  host: string;
  port: number;
  secure: boolean;
  providerName: string;
  note?: string; // displayed in the UI (e.g. "Requires App Password")
}

const PROVIDER_MAP: Record<string, ImapSettings> = {
  'gmail.com':       { host: 'imap.gmail.com',           port: 993, secure: true, providerName: 'Gmail',       note: 'Requires an App Password if 2FA is enabled' },
  'googlemail.com':  { host: 'imap.gmail.com',           port: 993, secure: true, providerName: 'Gmail',       note: 'Requires an App Password if 2FA is enabled' },
  'outlook.com':     { host: 'outlook.office365.com',    port: 993, secure: true, providerName: 'Outlook' },
  'hotmail.com':     { host: 'outlook.office365.com',    port: 993, secure: true, providerName: 'Outlook' },
  'hotmail.co.uk':   { host: 'outlook.office365.com',    port: 993, secure: true, providerName: 'Outlook' },
  'live.com':        { host: 'outlook.office365.com',    port: 993, secure: true, providerName: 'Outlook' },
  'live.co.uk':      { host: 'outlook.office365.com',    port: 993, secure: true, providerName: 'Outlook' },
  'msn.com':         { host: 'outlook.office365.com',    port: 993, secure: true, providerName: 'Outlook' },
  'yahoo.com':       { host: 'imap.mail.yahoo.com',      port: 993, secure: true, providerName: 'Yahoo',       note: 'Requires an App Password' },
  'yahoo.co.uk':     { host: 'imap.mail.yahoo.com',      port: 993, secure: true, providerName: 'Yahoo',       note: 'Requires an App Password' },
  'icloud.com':      { host: 'imap.mail.me.com',         port: 993, secure: true, providerName: 'iCloud',      note: 'Requires an App-Specific Password' },
  'me.com':          { host: 'imap.mail.me.com',         port: 993, secure: true, providerName: 'iCloud',      note: 'Requires an App-Specific Password' },
  'mac.com':         { host: 'imap.mail.me.com',         port: 993, secure: true, providerName: 'iCloud',      note: 'Requires an App-Specific Password' },
  'aol.com':         { host: 'imap.aol.com',             port: 993, secure: true, providerName: 'AOL' },
  'zoho.com':        { host: 'imap.zoho.com',            port: 993, secure: true, providerName: 'Zoho' },
  'protonmail.com':  { host: 'imap.protonmail.ch',       port: 993, secure: true, providerName: 'ProtonMail',  note: 'Requires ProtonMail Bridge' },
  'proton.me':       { host: 'imap.protonmail.ch',       port: 993, secure: true, providerName: 'ProtonMail',  note: 'Requires ProtonMail Bridge' },
  'btinternet.com':  { host: 'mail.btinternet.com',      port: 993, secure: true, providerName: 'BT' },
  'sky.com':         { host: 'imap.tools.sky.com',       port: 993, secure: true, providerName: 'Sky' },
  'virginmedia.com': { host: 'imap.virginmedia.com',     port: 993, secure: true, providerName: 'Virgin Media' },
  'talktalk.net':    { host: 'imap.talktalk.net',        port: 993, secure: true, providerName: 'TalkTalk' },
};

export function discoverImapSettings(email: string): ImapSettings | null {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  return PROVIDER_MAP[domain] || null;
}

export function getProviderName(email: string): string {
  const settings = discoverImapSettings(email);
  return settings?.providerName || email.split('@')[1] || 'Email';
}

export function getProviderNote(email: string): string | undefined {
  return discoverImapSettings(email)?.note;
}

// ---------------------------------------------------------------------------
// IMAP scanning
// ---------------------------------------------------------------------------

export interface ScannedEmail {
  sender: string;
  subject: string;
  date: string;
  bodyPreview: string;
}

const MAX_EMAILS = 500;

/**
 * Connect to an IMAP server and fetch financial emails from the last `daysBack` days.
 */
export async function scanEmailsViaImap(
  host: string,
  port: number,
  username: string,
  password: string,
  daysBack = 730,
): Promise<ScannedEmail[]> {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user: username, pass: password },
    logger: false as any, // suppress verbose logging
    tls: { rejectUnauthorized: true },
  });

  const results: ScannedEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - daysBack);

      // Financial search terms
      const searchTerms = [
        'bill', 'invoice', 'statement', 'renewal', 'price increase',
        'subscription', 'payment', 'receipt', 'direct debit', 'overdue',
        'tariff', 'your plan', 'your membership', 'annual review',
        'policy renewal', 'mortgage', 'loan', 'credit card', 'council tax',
        'compensation', 'refund', 'charge', 'balance',
      ];

      // IMAP OR search for financial keywords in subject
      // imapflow uses a structured search object
      const orClauses = searchTerms.map((term) => ({ subject: term }));

      let collected = 0;

      for (const clause of orClauses) {
        if (collected >= MAX_EMAILS) break;

        try {
          const uids: number[] = [];
          // Search with date filter and one subject keyword at a time
          for await (const msg of client.fetch(
            { and: [{ since: sinceDate }, clause] } as any,
            {
              uid: true,
              envelope: true,
              source: true,
            },
            { uid: true },
          )) {
            if (collected + uids.length >= MAX_EMAILS) break;

            const envelope = msg.envelope;
            const from = envelope?.from?.[0]
              ? `${envelope.from[0].name || ''} <${envelope.from[0].address || ''}>`
              : 'Unknown';

            let bodyPreview = '';
            if (msg.source) {
              try {
                const parsed: ParsedMail = await simpleParser(msg.source);
                const htmlText = typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '';
                const text = parsed.text || htmlText || '';
                bodyPreview = text.replace(/\s+/g, ' ').trim().slice(0, 200);
              } catch {
                bodyPreview = '';
              }
            }

            results.push({
              sender: from,
              subject: envelope?.subject || '(no subject)',
              date: envelope?.date?.toISOString() || new Date().toISOString(),
              bodyPreview,
            });

            collected++;
            if (collected >= MAX_EMAILS) break;
          }
        } catch (searchErr: any) {
          // Some IMAP servers don't support certain search criteria -- skip
          console.warn(`[imap] Search for "${clause.subject}" failed: ${searchErr.message}`);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }

  // Deduplicate by subject+date
  const seen = new Set<string>();
  const deduped = results.filter((e) => {
    const key = `${e.subject}::${e.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped;
}

/**
 * Test that IMAP credentials are valid by connecting and immediately disconnecting.
 */
export async function testImapConnection(
  host: string,
  port: number,
  username: string,
  password: string,
): Promise<{ success: boolean; error?: string }> {
  const client = new ImapFlow({
    host,
    port,
    secure: port === 993,
    auth: { user: username, pass: password },
    logger: false as any,
    tls: { rejectUnauthorized: true },
  });

  try {
    await client.connect();
    await client.logout();
    return { success: true };
  } catch (err: any) {
    const message = err.message || 'Connection failed';
    if (message.includes('AUTHENTICATIONFAILED') || message.includes('Invalid credentials')) {
      return { success: false, error: 'Invalid email or password. If you have 2FA enabled, use an App Password.' };
    }
    if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
      return { success: false, error: 'Could not reach mail server. Check your email domain is correct.' };
    }
    if (message.includes('ETIMEDOUT') || message.includes('ECONNREFUSED')) {
      return { success: false, error: 'Connection timed out. The mail server may be blocking connections.' };
    }
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Password encryption / decryption  (AES-256-GCM)
// ---------------------------------------------------------------------------

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.EMAIL_ENCRYPTION_KEY;
  if (!hex || hex.length < 64) {
    throw new Error('EMAIL_ENCRYPTION_KEY env var must be a 64-char hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptPassword(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Store as iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPassword(stored: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error('Invalid encrypted password format');

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
