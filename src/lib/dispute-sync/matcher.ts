/**
 * Thread candidate matcher for the Watchdog feature.
 *
 * When a user links a dispute to an email thread for the first time, this
 * module searches their connected inbox for threads that plausibly match the
 * dispute and ranks them. The top 3 are surfaced in the "Find thread" modal
 * for the user to confirm.
 *
 * Matching signals, in order of strength:
 *   1. Sender domain matches the dispute's provider (via provider-domains.ts)
 *   2. Subject contains provider name or key issue keywords
 *   3. Date within the dispute's active window
 *   4. Message count > 1 (actual correspondence, not a single marketing blast)
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §3
 */

import { refreshAccessToken as refreshGmailToken } from '../gmail';
import { refreshMicrosoftToken } from '../outlook';
import { matchProviderName } from '../provider-match';
import {
  domainsForProvider,
  addressMatchesProvider,
  hasExplicitDomains,
} from './provider-domains';
import type {
  EmailConnection,
  ThreadCandidate,
  EmailProvider,
} from './types';
import { providerFromConnection } from './types';

interface DisputeForMatching {
  id: string;
  provider_name: string;
  issue_type: string | null;
  issue_summary: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Token refresh helper
// -----------------------------------------------------------------------------

async function ensureFreshToken(conn: EmailConnection, provider: EmailProvider): Promise<string> {
  const expiresAt = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  if (conn.access_token && expiresAt - Date.now() > 60_000) return conn.access_token;
  if (!conn.refresh_token) {
    throw new Error(`No refresh token for ${provider} connection ${conn.id}`);
  }
  if (provider === 'gmail') {
    const r = await refreshGmailToken(conn.refresh_token);
    return r.access_token;
  }
  if (provider === 'outlook') {
    const r = await refreshMicrosoftToken(conn.refresh_token);
    return r.access_token;
  }
  throw new Error(`ensureFreshToken not applicable for ${provider}`);
}

// -----------------------------------------------------------------------------
// Gmail candidate search
// -----------------------------------------------------------------------------

async function findGmailCandidates(
  conn: EmailConnection,
  dispute: DisputeForMatching,
): Promise<ThreadCandidate[]> {
  const token = await ensureFreshToken(conn, 'gmail');
  const domains = domainsForProvider(dispute.provider_name);
  const explicit = hasExplicitDomains(dispute.provider_name);

  // Build a Gmail search query that biases toward the provider
  // e.g. "(from:onestream.co.uk OR subject:onestream) newer_than:180d"
  const fromClauses = domains.map((d) => `from:${d}`).join(' OR ');
  const subjectTerm = dispute.provider_name.split(/\s+/)[0].toLowerCase();
  const q = [
    fromClauses ? `(${fromClauses} OR subject:${subjectTerm})` : `subject:${subjectTerm}`,
    'newer_than:180d',
  ].join(' ');

  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
  listUrl.searchParams.set('q', q);
  listUrl.searchParams.set('maxResults', '20');

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    const body = await listRes.text();
    throw new Error(`Gmail threads.list failed (${listRes.status}): ${body.slice(0, 200)}`);
  }
  const { threads = [] } = await listRes.json();

  const candidates: ThreadCandidate[] = [];
  for (const t of threads.slice(0, 10)) {
    const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`;
    const r = await fetch(detailUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) continue;
    const thr = await r.json();
    const msgs = thr.messages ?? [];
    if (msgs.length === 0) continue;

    const latest = msgs[msgs.length - 1];
    const firstMsg = msgs[0];
    const headers = (firstMsg.payload?.headers ?? []) as { name: string; value: string }[];
    const h = (name: string) =>
      headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const fromStr = h('From');
    const fromAddr = fromStr.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase() ?? '';
    const fromDomain = fromAddr.split('@')[1] ?? '';
    const latestInternal = Number(latest.internalDate ?? 0);

    let confidence = 0.3;
    const reasons: string[] = [];
    if (explicit && addressMatchesProvider(fromAddr, dispute.provider_name)) {
      confidence += 0.5;
      reasons.push(`sender domain matches ${dispute.provider_name}`);
    } else if (fromDomain.includes(subjectTerm)) {
      confidence += 0.25;
      reasons.push(`sender domain contains '${subjectTerm}'`);
    }
    const subj = h('Subject').toLowerCase();
    if (subj.includes(subjectTerm)) {
      confidence += 0.1;
      reasons.push('subject mentions provider');
    }
    if (msgs.length >= 2) {
      confidence += 0.1;
      reasons.push(`${msgs.length} messages in thread`);
    }

    candidates.push({
      provider: 'gmail',
      threadId: thr.id,
      subject: h('Subject'),
      senderAddress: fromAddr,
      senderDomain: fromDomain,
      latestDate: new Date(latestInternal),
      messageCount: msgs.length,
      snippet: thr.snippet ?? firstMsg.snippet ?? '',
      confidence: Math.min(1, confidence),
      reason: reasons.join('; ') || 'keyword match',
    });
  }
  return candidates;
}

// -----------------------------------------------------------------------------
// Outlook / Graph candidate search
// -----------------------------------------------------------------------------

async function findOutlookCandidates(
  conn: EmailConnection,
  dispute: DisputeForMatching,
): Promise<ThreadCandidate[]> {
  const token = await ensureFreshToken(conn, 'outlook');
  const domains = domainsForProvider(dispute.provider_name);
  const explicit = hasExplicitDomains(dispute.provider_name);
  const subjectTerm = dispute.provider_name.split(/\s+/)[0];

  // Graph search: use $search for full-text, fall back to $filter with domain
  const searchQuery = domains.length
    ? `"from:${domains[0]}" OR "${subjectTerm}"`
    : `"${subjectTerm}"`;

  const url = new URL('https://graph.microsoft.com/v1.0/me/messages');
  url.searchParams.set('$search', `"${searchQuery}"`);
  url.searchParams.set(
    '$select',
    'id,conversationId,subject,from,receivedDateTime,bodyPreview',
  );
  url.searchParams.set('$top', '25');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      // $search requires ConsistencyLevel: eventual on Graph
      ConsistencyLevel: 'eventual',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph search failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();

  // Group returned messages by conversationId
  interface ConvEntry {
    conversationId: string;
    subject: string;
    messages: Array<{ from: string; date: Date; preview: string }>;
  }
  const byConv = new Map<string, ConvEntry>();
  for (const m of data.value ?? []) {
    const cid = m.conversationId;
    if (!cid) continue;
    const entry: ConvEntry = byConv.get(cid) ?? {
      conversationId: cid,
      subject: m.subject ?? '',
      messages: [],
    };
    entry.messages.push({
      from: m.from?.emailAddress?.address ?? '',
      date: new Date(m.receivedDateTime),
      preview: m.bodyPreview ?? '',
    });
    byConv.set(cid, entry);
  }

  const candidates: ThreadCandidate[] = [];
  for (const [, entry] of byConv) {
    entry.messages.sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstMsg = entry.messages[0];
    const latestMsg = entry.messages[entry.messages.length - 1];
    const fromAddr = firstMsg.from.toLowerCase();
    const fromDomain = fromAddr.split('@')[1] ?? '';

    let confidence = 0.3;
    const reasons: string[] = [];
    if (explicit && addressMatchesProvider(fromAddr, dispute.provider_name)) {
      confidence += 0.5;
      reasons.push(`sender domain matches ${dispute.provider_name}`);
    } else if (fromDomain.includes(subjectTerm.toLowerCase())) {
      confidence += 0.25;
      reasons.push(`sender domain contains '${subjectTerm.toLowerCase()}'`);
    }
    if (entry.subject.toLowerCase().includes(subjectTerm.toLowerCase())) {
      confidence += 0.1;
      reasons.push('subject mentions provider');
    }
    if (entry.messages.length >= 2) {
      confidence += 0.1;
      reasons.push(`${entry.messages.length} messages in thread`);
    }

    candidates.push({
      provider: 'outlook',
      threadId: entry.conversationId,
      subject: entry.subject,
      senderAddress: fromAddr,
      senderDomain: fromDomain,
      latestDate: latestMsg.date,
      messageCount: entry.messages.length,
      snippet: firstMsg.preview.slice(0, 150),
      confidence: Math.min(1, confidence),
      reason: reasons.join('; ') || 'keyword match',
    });
  }
  return candidates;
}

// -----------------------------------------------------------------------------
// IMAP candidate search
// -----------------------------------------------------------------------------

async function findImapCandidates(
  conn: EmailConnection,
  dispute: DisputeForMatching,
): Promise<ThreadCandidate[]> {
  // Dynamic import to keep imapflow out of the hot path when unused
  const { searchImapCandidates } = await import('./imap-matcher');
  return searchImapCandidates(conn, dispute);
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

/**
 * Find the top `limit` candidate email threads from the user's inbox that
 * might correspond to the given dispute. Results sorted by confidence desc.
 */
export async function findThreadCandidates(
  conn: EmailConnection,
  dispute: DisputeForMatching,
  limit = 3,
): Promise<ThreadCandidate[]> {
  const provider = providerFromConnection(conn);
  let candidates: ThreadCandidate[];

  switch (provider) {
    case 'gmail':
      candidates = await findGmailCandidates(conn, dispute);
      break;
    case 'outlook':
      candidates = await findOutlookCandidates(conn, dispute);
      break;
    case 'imap':
      candidates = await findImapCandidates(conn, dispute);
      break;
  }

  return candidates
    .sort((a, b) => b.confidence - a.confidence || b.latestDate.getTime() - a.latestDate.getTime())
    .slice(0, limit);
}

/**
 * Best-effort auto-match: if exactly one high-confidence candidate exists,
 * return it. Otherwise return null so the UI falls back to user selection.
 *
 * Used when the user ticks "auto-match" or when we're in the background
 * fallback path (Option B in the plan).
 */
export function pickAutoMatch(candidates: ThreadCandidate[]): ThreadCandidate | null {
  if (candidates.length === 0) return null;
  const top = candidates[0];
  if (top.confidence < 0.8) return null;
  if (candidates.length > 1 && candidates[1].confidence > 0.7) return null; // ambiguous
  return top;
}

// Re-export so callers can use these without a separate import
export { matchProviderName };
