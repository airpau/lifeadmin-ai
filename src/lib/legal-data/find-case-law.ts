/**
 * src/lib/legal-data/find-case-law.ts
 *
 * Typed client for The National Archives' Find Case Law service.
 * Public Atom feed: https://caselaw.nationalarchives.gov.uk/atom.xml
 * Programmatic re-use is governed by a free transactional licence
 * (5-yr term, ~10 working-day approval). The licence governs
 * COMPUTATIONAL re-use, not copyright (the data itself is OGL v3.0).
 *
 * IMPORTANT — DORMANT UNTIL LICENCE IS APPROVED:
 *   The founder has not yet completed the Find Case Law transactional
 *   licence application. Until that licence is granted AND the env
 *   var `FIND_CASE_LAW_LICENCE_ACCEPTED=true` is set, the production
 *   wiring (discovery cron leg, dispute-engine grounding) MUST NOT
 *   call this client. The `isProductionEnabled()` guard below is the
 *   single source of truth for that gate.
 *
 *   The client itself, the parsers, and the tests are built so that
 *   the moment the licence lands, flipping the env var enables the
 *   pipeline without a redeploy of new code.
 *
 * To apply for the licence:
 *   email caselawlicence@nationalarchives.gov.uk
 *   https://caselaw.nationalarchives.gov.uk/licence-application-process
 *
 * Output rights:
 *   Judgments and decisions are © Crown copyright, OGL v3.0. Always
 *   retain the canonical `uri` for citation use.
 */

const ATOM_HOST = 'https://caselaw.nationalarchives.gov.uk';
const ATOM_PATH = '/atom.xml';

const USER_AGENT = 'paybacker-compliance-bot/1.0 (+https://paybacker.co.uk)';

export interface CaseLawHit {
  /** Canonical URI on caselaw.nationalarchives.gov.uk. */
  uri: string;
  /** Plain-language title (court + parties). */
  title: string;
  /** Court / tribunal label, e.g. "EWCA-Civil". */
  court: string | null;
  /** Date judgment was handed down (ISO). */
  publishedAt: string | null;
  /** Short summary / catchword block where present. */
  summary: string | null;
}

/**
 * Production gate. `false` whenever the env var is unset OR set to
 * anything other than the literal string "true". This is intentionally
 * strict so a misconfiguration ("yes" / "1") fails closed.
 *
 * Callers in production (cron legs, dispute engine) MUST guard every
 * call to this client with `isProductionEnabled()`. Test callers can
 * use the parsers + low-level fetcher freely — only the public
 * `searchAtom` wrapper enforces the gate.
 */
export function isProductionEnabled(): boolean {
  return process.env.FIND_CASE_LAW_LICENCE_ACCEPTED === 'true';
}

/**
 * Build the Atom search URL for a given query.
 * Example: searchUrl('PPI mis-selling') →
 *   https://caselaw.nationalarchives.gov.uk/atom.xml?query=PPI+mis-selling
 */
export function searchUrl(query: string): string {
  const params = new URLSearchParams();
  if (query && query.trim().length > 0) params.set('query', query.trim());
  const qs = params.toString();
  return qs ? `${ATOM_HOST}${ATOM_PATH}?${qs}` : `${ATOM_HOST}${ATOM_PATH}`;
}

/**
 * Parse an Atom feed from Find Case Law. Exported for tests.
 * Tolerant to the slight schema differences between the global
 * "recent judgments" feed and the per-query search feeds.
 */
export function parseAtomFeed(xml: string): CaseLawHit[] {
  if (!xml) return [];
  const out: CaseLawHit[] = [];
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const title = firstTagText(block, 'title') || '';
    // <link rel="alternate" href="..." /> takes precedence; fall back
    // to <id> which on Find Case Law is the same canonical URI.
    const link =
      firstAttr(block, 'link', 'href') || firstTagText(block, 'id') || '';
    if (!title || !link) continue;
    const published =
      firstTagText(block, 'published') || firstTagText(block, 'updated');
    const court =
      firstTagText(block, 'tna:court') ||
      firstAttr(block, 'category', 'term') ||
      null;
    const summary =
      firstTagText(block, 'summary') || firstTagText(block, 'content') || null;
    out.push({
      uri: link,
      title: title.trim(),
      court,
      publishedAt: published || null,
      summary: summary ? summary.replace(/\s+/g, ' ').trim() : null,
    });
  }
  return out;
}

function firstTagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const mm = xml.match(re);
  if (!mm) return null;
  return mm[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function firstAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(
    `<${tag}\\b[^>]*\\b${attr}=("([^"]*)"|'([^']*)')`,
    'i',
  );
  const mm = xml.match(re);
  if (!mm) return null;
  return (mm[2] ?? mm[3] ?? null) || null;
}

/**
 * Public search wrapper.
 *
 * GUARDED by the licence env var. Returns an empty array — and logs a
 * single info-level note — whenever the licence has not been accepted.
 * That keeps the calling cron/dispute-engine paths green during the
 * 10-day approval window without requiring caller code changes.
 *
 * For tests, call `fetchAtomRaw` + `parseAtomFeed` directly.
 */
export async function searchAtom(
  query: string,
  opts: { signal?: AbortSignal; bypassLicenceGate?: boolean } = {},
): Promise<CaseLawHit[]> {
  if (!opts.bypassLicenceGate && !isProductionEnabled()) {
    console.info(
      '[find-case-law] dormant — FIND_CASE_LAW_LICENCE_ACCEPTED is not "true". ' +
        'Apply via caselawlicence@nationalarchives.gov.uk; expect ~10 working days.',
    );
    return [];
  }
  const xml = await fetchAtomRaw(query, opts.signal);
  if (!xml) return [];
  return parseAtomFeed(xml);
}

/**
 * Low-level fetcher exposed for tests + tooling. Returns the raw Atom
 * XML or `null` on network/HTTP error. Does NOT enforce the licence
 * gate — `searchAtom` is the gated public wrapper.
 */
export async function fetchAtomRaw(
  query: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(searchUrl(query), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/atom+xml, application/xml',
      },
      signal,
    });
    if (!res.ok) return null;
    const xml = await res.text();
    return xml || null;
  } catch (err) {
    console.warn(
      '[find-case-law] fetch failed',
      query,
      (err as Error)?.message,
    );
    return null;
  }
}

/**
 * Returns true if the URL is hosted on caselaw.nationalarchives.gov.uk.
 * Useful for the discovery pipeline's source-typing branch.
 */
export function isFindCaseLawUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === 'caselaw.nationalarchives.gov.uk';
  } catch {
    return false;
  }
}

/**
 * Backward-compat alias for the discovery cron — searches the Atom
 * feed by query string. Wraps `searchAtom` and so respects the same
 * licence env-gate.
 */
export async function searchByQuery(
  query: string,
  opts: { signal?: AbortSignal; bypassLicenceGate?: boolean } = {},
): Promise<CaseLawHit[]> {
  return searchAtom(query, opts);
}

/**
 * Hash a Find Case Law judgment (or atom-feed hit) for drift
 * detection. Includes the canonical URI, title, court, and any
 * summary excerpt. The Atom feed itself is the only stable
 * fingerprint surface — the full HTML pages get republished with
 * navigation chrome changes that we don't want to false-positive on.
 * SHA-256 lowercase hex.
 */
export async function hashFindCaseLawDoc(
  doc: Pick<CaseLawHit, 'uri' | 'title' | 'court' | 'summary'>,
): Promise<string> {
  const summary = (doc.summary || '').replace(/\s+/g, ' ').trim();
  const payload = [
    `uri:${doc.uri}`,
    `title:${(doc.title || '').trim()}`,
    `court:${doc.court || ''}`,
    `summary:${summary}`,
  ].join('\n');
  return sha256Hex(payload);
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (subtle) {
    const buf = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const nodeCrypto: typeof import('node:crypto') = await import('node:crypto');
  return nodeCrypto.createHash('sha256').update(data).digest('hex');
}
