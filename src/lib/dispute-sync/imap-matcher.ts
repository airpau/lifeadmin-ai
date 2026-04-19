/**
 * IMAP-specific candidate search for the matcher.
 *
 * Unlike Gmail/Graph, IMAP has no thread concept, so we search by From domain
 * and Subject keywords, then group by Subject prefix (stripping "Re:"/"Fwd:")
 * to approximate threads.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { decryptPassword } from '../imap-scanner';
import { domainsForProvider, hasExplicitDomains } from './provider-domains';
import type { EmailConnection, ThreadCandidate } from './types';

interface DisputeForMatching {
  id: string;
  provider_name: string;
  issue_type: string | null;
  issue_summary: string | null;
  created_at: string;
}

function normaliseSubject(raw: string): string {
  return raw
    .replace(/^\s*(re|fwd?|fw):\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export async function searchImapCandidates(
  conn: EmailConnection,
  dispute: DisputeForMatching,
): Promise<ThreadCandidate[]> {
  if (!conn.imap_host || !conn.imap_port || !conn.imap_username) {
    throw new Error(`IMAP connection ${conn.id} missing settings.`);
  }
  const encryptedPw = conn.app_password_encrypted ?? conn.imap_password_encrypted;
  if (!encryptedPw) throw new Error(`IMAP connection ${conn.id} has no password.`);

  const client = new ImapFlow({
    host: conn.imap_host,
    port: conn.imap_port,
    secure: true,
    auth: { user: conn.imap_username, pass: decryptPassword(encryptedPw) },
    logger: false,
  });

  await client.connect();
  const candidates: ThreadCandidate[] = [];
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const domains = domainsForProvider(dispute.provider_name);
      const explicit = hasExplicitDomains(dispute.provider_name);
      const subjectTerm = dispute.provider_name.split(/\s+/)[0].toLowerCase();
      const sinceDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

      // Search strategies
      const uidSet = new Set<number>();
      for (const domain of domains) {
        const uids = await client.search({ from: domain, since: sinceDate }) || [];
        uids.forEach((u) => uidSet.add(u));
      }
      // Subject-term fallback
      const subjectUids = await client.search({
        subject: subjectTerm,
        since: sinceDate,
      }) || [];
      subjectUids.forEach((u) => uidSet.add(u));

      if (uidSet.size === 0) return [];

      // Group by normalised subject (imitates thread grouping)
      const bySubject = new Map<
        string,
        {
          rootMessageId: string;
          subject: string;
          messages: Array<{
            from: string;
            domain: string;
            date: Date;
            subject: string;
            preview: string;
          }>;
        }
      >();

      const uids = Array.from(uidSet).slice(0, 50); // cap to avoid memory bloat
      for await (const msg of client.fetch(uids, { source: true, envelope: true })) {
        if (!msg.source) continue;
        try {
          const parsed = await simpleParser(msg.source);
          const fromRaw = parsed.from?.text ?? parsed.from?.value?.[0]?.address ?? '';
          const fromAddr =
            fromRaw.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0]?.toLowerCase() ?? '';
          const fromDomain = fromAddr.split('@')[1] ?? '';
          const subj = parsed.subject ?? msg.envelope?.subject ?? '';
          const normKey = normaliseSubject(subj);
          if (!normKey) continue;

          const existing = bySubject.get(normKey) ?? {
            rootMessageId: parsed.messageId ?? String(msg.uid),
            subject: subj,
            messages: [],
          };
          existing.messages.push({
            from: fromAddr,
            domain: fromDomain,
            date: parsed.date ?? new Date(),
            subject: subj,
            preview: String(parsed.text || parsed.html || '').slice(0, 150),
          });
          bySubject.set(normKey, existing);
        } catch {
          // skip parse errors
        }
      }

      for (const [, group] of bySubject) {
        group.messages.sort((a, b) => a.date.getTime() - b.date.getTime());
        const first = group.messages[0];
        const latest = group.messages[group.messages.length - 1];

        let confidence = 0.3;
        const reasons: string[] = [];
        const firstDomainMatches = domains.some(
          (d) => first.domain === d || first.domain.endsWith(`.${d}`),
        );
        if (explicit && firstDomainMatches) {
          confidence += 0.5;
          reasons.push(`sender domain matches ${dispute.provider_name}`);
        } else if (first.domain.includes(subjectTerm)) {
          confidence += 0.25;
          reasons.push(`sender domain contains '${subjectTerm}'`);
        }
        if (group.subject.toLowerCase().includes(subjectTerm)) {
          confidence += 0.1;
          reasons.push('subject mentions provider');
        }
        if (group.messages.length >= 2) {
          confidence += 0.1;
          reasons.push(`${group.messages.length} messages in thread`);
        }

        candidates.push({
          provider: 'imap',
          threadId: group.rootMessageId, // IMAP "threadId" = root Message-ID
          subject: group.subject,
          senderAddress: first.from,
          senderDomain: first.domain,
          latestDate: latest.date,
          messageCount: group.messages.length,
          snippet: first.preview,
          confidence: Math.min(1, confidence),
          reason: reasons.join('; ') || 'keyword match',
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return candidates;
}
