/**
 * Shared types for the Watchdog dispute-email-sync feature.
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md
 */

export type EmailProvider = 'gmail' | 'outlook' | 'imap';

/**
 * Normalised representation of an email message returned by the provider
 * fetchers. Fields are the union of what all three providers can deliver.
 */
export interface FetchedMessage {
  /** Provider-native message id (Gmail messageId / Graph id / IMAP Message-ID). */
  messageId: string;
  /** Thread identifier this message belongs to. */
  threadId: string;
  /** Subject line. */
  subject: string;
  /** Raw "From" header (e.g. 'Support <help@onestream.co.uk>'). */
  fromRaw: string;
  /** Extracted bare address (e.g. 'help@onestream.co.uk'). */
  fromAddress: string;
  /** Extracted display name (e.g. 'Support'), may be empty. */
  fromName: string;
  /** Sender's domain (e.g. 'onestream.co.uk'). */
  fromDomain: string;
  /** When the provider received the message. */
  receivedAt: Date;
  /** Short snippet / preview (first 150 chars of body). */
  snippet: string;
  /** Plain-text body, HTML stripped, capped to 8000 chars. */
  body: string;
  /** Deep-link to the message in the provider's web UI. Outlook/Graph
   *  populates this; Gmail/IMAP leave it undefined. */
  webLink?: string;
}

/**
 * Candidate thread returned by the matcher when the user is choosing which
 * thread to link to a dispute.
 */
export interface ThreadCandidate {
  provider: EmailProvider;
  threadId: string;
  subject: string;
  senderAddress: string;
  senderDomain: string;
  latestDate: Date;
  messageCount: number;
  snippet: string;
  /** 0.0 - 1.0. Higher = more confident this is the right thread. */
  confidence: number;
  /** Human-readable explanation of why this thread matched. */
  reason: string;
}

/**
 * Thin wrapper around email_connections rows used by the fetchers.
 *
 * provider_type values stored in DB (as set by the OAuth callbacks and the
 * IMAP connect route):
 *   'google'  - Gmail via Google OAuth
 *   'outlook' - Microsoft Graph via Microsoft OAuth
 *   'imap'    - Yahoo, iCloud, BT, Sky, etc. via app-password IMAP
 *
 * auth_method values: 'oauth' for the two OAuth providers, 'imap' for IMAP.
 */
export interface EmailConnection {
  id: string;
  user_id: string;
  email_address: string;
  provider_type: string; // 'google' | 'outlook' | 'imap' (plus legacy values)
  auth_method: string;   // 'oauth' | 'imap' (plus legacy 'gmail'/'outlook')
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  imap_host: string | null;
  imap_port: number | null;
  imap_username: string | null;
  imap_password_encrypted: string | null;
  app_password_encrypted: string | null;
  status: string;
}

/**
 * Which kind of thread id the fetchers should expect for each provider.
 *
 *   gmail   -> Gmail threadId
 *   outlook -> Graph conversationId
 *   imap    -> Message-ID of the first message in the thread
 *
 * NOTE: provider_type is the source of truth — OAuth callbacks write
 * provider_type='google'|'outlook' and auth_method='oauth'. We also handle
 * the legacy shape (auth_method='gmail'|'outlook') for older rows.
 */
export function providerFromConnection(conn: EmailConnection): EmailProvider {
  const pt = (conn.provider_type ?? '').toLowerCase();
  const am = (conn.auth_method ?? '').toLowerCase();

  if (pt === 'imap' || am === 'imap' || am === 'imap-password' || am === 'imap-app-password') {
    return 'imap';
  }
  if (pt === 'google' || pt === 'gmail' || am === 'gmail') return 'gmail';
  if (pt === 'outlook' || pt === 'microsoft' || am === 'outlook' || am === 'microsoft') {
    return 'outlook';
  }
  throw new Error(`Unknown provider for connection ${conn.id}: ${conn.provider_type}/${conn.auth_method}`);
}
