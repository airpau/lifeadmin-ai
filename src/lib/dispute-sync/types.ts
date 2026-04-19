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
 */
export interface EmailConnection {
  id: string;
  user_id: string;
  email_address: string;
  provider_type: 'oauth' | 'imap';
  auth_method: string; // 'gmail' | 'outlook' | 'imap-password' | 'imap-app-password'
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
 */
export function providerFromConnection(conn: EmailConnection): EmailProvider {
  if (conn.provider_type === 'imap') return 'imap';
  if (conn.auth_method === 'gmail') return 'gmail';
  if (conn.auth_method === 'outlook') return 'outlook';
  throw new Error(`Unknown provider for connection ${conn.id}: ${conn.provider_type}/${conn.auth_method}`);
}
