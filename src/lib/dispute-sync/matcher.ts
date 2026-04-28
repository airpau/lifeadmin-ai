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

  // Cascading query strategy — start narrow, broaden if nothing found.
  // 2026-04-28 — broadened to include sent emails (`to:` matches) so a
  // user who just sent a complaint and CC'd themselves can link THAT
  // outbound thread before the supplier replies. Previously we only
  // matched `from:supplier` which structurally excluded the just-sent
  // case Paul hit on the Nuki dispute.
  const providerPhrase = dispute.provider_name.trim();
  const subjectTerm = providerPhrase.split(/\s+/)[0].toLowerCase();
  const fromClauses = domains.map((d) => `from:${d}`).join(' OR ');
  // Same domains, but matched on the recipient side. `to:` in Gmail
  // covers both To: and Cc: at the message level, so this catches
  // user-sent-and-CC'd-self complaint letters.
  const toClauses = domains.map((d) => `to:${d}`).join(' OR ');

  const queries: string[] = [];
  if (fromClauses && toClauses) {
    // Prefer the broader "from OR to" query first — it picks up both
    // supplier-initiated threads AND user-initiated threads in one
    // shot, which avoids the older "from:supplier dominates" ranking
    // problem that bumped Paul's just-sent Nuki letter off the list.
    queries.push(`(${fromClauses} OR ${toClauses}) newer_than:365d`);
  } else if (fromClauses) {
    queries.push(`(${fromClauses}) newer_than:365d`);
  }
  // Broad full-text fallback: catches emails that mention the provider
  // anywhere in headers/body, even if the from/to domain isn't in our
  // allowlist (the case for new providers Paybacker doesn't yet have
  // a domain mapping for).
  queries.push(`"${providerPhrase}" newer_than:365d`);
  if (providerPhrase.toLowerCase() !== subjectTerm) {
    queries.push(`"${subjectTerm}" newer_than:365d`);
  }

  let threads: Array<{ id: string }> = [];
  for (const q of queries) {
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
    listUrl.searchParams.set('q', q);
    listUrl.searchParams.set('maxResults', '30');
    const listRes = await fetch(listUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) {
      const body = await listRes.text();
      throw new Error(`Gmail threads.list failed (${listRes.status}): ${body.slice(0, 200)}`);
    }
    const json = await listRes.json();
    if (json.threads?.length) {
      threads = json.threads;
      break;
    }
  }

  // The connected inbox's own address — used to identify user-sent
  // (outbound) threads when the user has CC'd themselves into a
  // letter to the supplier and we want to surface it as a candidate
  // before the supplier has replied. See the "outbound" boost below.
  const ownAddr = (conn.email_address || '').toLowerCase().trim();

  const candidates: ThreadCandidate[] = [];
  // Pull metadata in parallel — Gmail's per-thread fetch is the
  // dominant latency cost, and we now scan up to 30 threads (was 10)
  // because the broadened query may surface both inbound and
  // outbound matches together.
  const detailUrls = threads.slice(0, 30).map(
    (t) =>
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
  );
  const detailFetches = await Promise.all(
    detailUrls.map((url) =>
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ),
  );

  for (const thr of detailFetches) {
    if (!thr) continue;
    const msgs = thr.messages ?? [];
    if (msgs.length === 0) continue;

    const latest = msgs[msgs.length - 1];
    const firstMsg = msgs[0];
    const headers = (firstMsg.payload?.headers ?? []) as { name: string; value: string }[];
    const h = (name: string) =>
      headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? '';

    const fromStr = h('From');
    const toStr = h('To');
    const ccStr = h('Cc');
    const fromAddr = fromStr.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase() ?? '';
    const fromDomain = fromAddr.split('@')[1] ?? '';
    const recipientAddrs = `${toStr} ${ccStr}`
      .toLowerCase()
      .match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [];

    // Did the USER initiate this thread? Yes if the first message's
    // From: matches the connected inbox's address, AND a recipient
    // address belongs to a supplier domain. This is the "I just sent
    // a complaint and CC'd myself" pattern — Paul's Nuki case.
    const userInitiated =
      ownAddr.length > 0 && fromAddr === ownAddr;

    // Recipient match: prefer explicit domain mapping, fall back to a
    // fuzzy "recipient domain contains the provider's first token"
    // check so the outbound flow works for providers we don't yet
    // have in provider-domains.ts (e.g. nuki.io for "Nuki Home
    // Solutions" before the explicit mapping landed).
    const recipientMatchesProvider = recipientAddrs.some((addr) => {
      if (addressMatchesProvider(addr, dispute.provider_name)) return true;
      const recipDomain = (addr.split('@')[1] ?? '').toLowerCase();
      return (
        subjectTerm.length >= 3 &&
        recipDomain.length > 0 &&
        recipDomain.includes(subjectTerm)
      );
    });

    const latestInternal = Number(latest.internalDate ?? 0);
    const ageMs = Date.now() - latestInternal;
    const isFresh = ageMs >= 0 && ageMs < 7 * 86_400_000;

    let confidence = 0.3;
    const reasons: string[] = [];

    if (userInitiated && recipientMatchesProvider) {
      // User just sent a letter to this supplier (and CC'd themselves
      // OR the message landed in All Mail). Surface near the top so
      // they can adopt this thread for tracking — this is the
      // outbound-track flow.
      confidence += 0.55;
      reasons.push(`outbound — you sent this to ${dispute.provider_name}`);
      if (isFresh) {
        confidence += 0.1;
        reasons.push('sent within last 7 days');
      }
    } else if (explicit && addressMatchesProvider(fromAddr, dispute.provider_name)) {
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
      // For outbound threads, surface the supplier address as the
      // "sender" the UI shows — that's what the user expects to see in
      // the candidate row, not their own email.
      senderAddress: (() => {
        if (userInitiated && recipientAddrs.length > 0) {
          return recipientAddrs.find((a) => addressMatchesProvider(a, dispute.provider_name))
            ?? recipientAddrs[0]
            ?? fromAddr;
        }
        return fromAddr;
      })(),
      senderDomain: (() => {
        if (userInitiated && recipientAddrs.length > 0) {
          const supplierAddr = recipientAddrs.find((a) => addressMatchesProvider(a, dispute.provider_name))
            ?? recipientAddrs[0];
          if (supplierAddr) {
            return supplierAddr.split('@')[1] ?? fromDomain;
          }
        }
        return fromDomain;
      })(),
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
  const providerPhrase = dispute.provider_name.trim();
  const subjectTerm = providerPhrase.split(/\s+/)[0];

  // Cascading Outlook search: full-text on provider phrase first, then domain
  // fallback. Graph's $search does body+headers so it's more forgiving than
  // Gmail's default which is why we lead with it here.
  const searches: string[] = [`"${providerPhrase}"`];
  if (domains.length) searches.push(`"${domains[0]}"`);
  if (providerPhrase.toLowerCase() !== subjectTerm.toLowerCase()) {
    searches.push(`"${subjectTerm}"`);
  }

  let data: { value?: Array<{
    conversationId?: string;
    subject?: string;
    from?: { emailAddress?: { address?: string } };
    receivedDateTime?: string;
    bodyPreview?: string;
  }> } = {};
  for (const searchQuery of searches) {
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
    data = await res.json();
    if (data.value?.length) break;
  }

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
      date: new Date(m.receivedDateTime ?? Date.now()),
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
