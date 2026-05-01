/**
 * src/lib/legal-data/legislation-gov-uk.ts
 *
 * Typed client for legislation.gov.uk — the PRIMARY canonical source for
 * every UK statute we cite. See `docs/legal-data-api-research-2026-05-01.md`
 * for the full integration plan.
 *
 * Why this exists:
 *   Until now, every `legal_references` row was re-grounded by Perplexity
 *   (sonar-pro). That worked, but Perplexity is (a) paid per call, (b) a
 *   probabilistic re-statement of authoritative text rather than the text
 *   itself, and (c) prone to citing commentary sites unless tightly
 *   constrained. legislation.gov.uk publishes the same statutes as
 *   Akoma-Ntoso XML at a deterministic URL — content negotiation is just
 *   "append `/data.xml`". This client fetches and parses that XML so the
 *   compliance pipeline can use canonical text first and fall back to
 *   Perplexity only when no statute hit exists.
 *
 * Output rights:
 *   All content from legislation.gov.uk is Crown Copyright, available
 *   under the Open Government Licence v3.0. Any caller surfacing this
 *   data MUST attribute the source (we always retain `sourceUrl` and
 *   surface it in the UI; that satisfies OGL v3.0 attribution).
 *
 * No external XML parser dependency:
 *   We parse only a small, well-known subset of the Akoma-Ntoso /
 *   `<ukm:Metadata>` envelope. A regex extractor over the
 *   `<Section>` / `<P1para>` block is sufficient and avoids adding a
 *   new runtime dep. If we later need full schema-aware parsing we can
 *   swap in fast-xml-parser without changing this module's surface.
 */
// We deliberately don't import from `legal-refs-authority` here:
//   - The compliance authority allowlist is broader than this client
//     needs (it accepts gov.uk, fca.org.uk, etc.).
//   - Avoiding the import keeps this module dependency-free, which lets
//     it run under `node --test` without a path-alias resolver.
// Host gating is done locally via HOST_ALLOW below; callers that need
// the broader UK legal-authority gate should run `checkUkLegalAuthority`
// from `legal-refs-authority` themselves before/after invoking us.

export interface LegislationDoc {
  /** Canonical title from `<dc:title>` or `<FRBRname>`. */
  title: string;
  /** Best-guess full citation, e.g. "Consumer Rights Act 2015, section 9". */
  fullCitation: string;
  /** Plain-text body of the requested section, if a section was addressed. */
  sectionText: string | null;
  /** Numeric/alphanumeric section identifier (e.g. "9", "9A"), if any. */
  sectionNumber: string | null;
  /** Date the section is in force on (`<ukm:UnappliedEffects>` aware). */
  inForceOn: string | null;
  /** Last amendment timestamp from `<ukm:Modified>` if present. */
  lastAmended: string | null;
  /** Canonical https://www.legislation.gov.uk URL the doc was fetched from. */
  sourceUrl: string;
  /** Whether `<ukm:UnappliedEffects>` flagged a pending change not yet applied. */
  hasUnappliedEffects: boolean;
  /** Raw XML body for downstream hashing / diffing. */
  raw: string;
}

export interface LegislationSearchResult {
  title: string;
  url: string;
  documentType: string | null;
  year: number | null;
  number: number | null;
  published: string | null;
}

const HOST_ALLOW = new Set(['www.legislation.gov.uk', 'legislation.gov.uk']);

/**
 * Per-request in-memory cache. We deliberately do NOT use a module-scoped
 * Map here because Vercel reuses module state across requests — that would
 * leak cache between users / cron runs. Callers can pass their own cache
 * via the `cache` arg if they want short-lived dedup.
 */
export type FetchCache = Map<string, LegislationDoc | null>;

/**
 * Normalise any legislation.gov.uk URL or Akoma-Ntoso URI into the canonical
 * XML representation by appending `/data.xml`. Idempotent.
 */
export function toXmlUri(uriOrUrl: string): string | null {
  if (!uriOrUrl) return null;
  let u: URL;
  try {
    // Accept Akoma-Ntoso bare URIs ("/ukpga/2015/15/section/9") too.
    if (uriOrUrl.startsWith('/')) {
      u = new URL(`https://www.legislation.gov.uk${uriOrUrl}`);
    } else {
      u = new URL(uriOrUrl);
    }
  } catch {
    return null;
  }
  if (!HOST_ALLOW.has(u.hostname)) return null;
  // Strip any trailing slash.
  let path = u.pathname.replace(/\/+$/, '');
  // Already pointing at /data.xml ?
  if (path.endsWith('/data.xml')) return `https://${u.hostname}${path}`;
  // Strip a trailing /data.feed or /data.htm if a caller mixed up content
  // negotiation suffixes.
  path = path.replace(/\/data\.(feed|htm|html|rdf|akn)$/i, '');
  return `https://${u.hostname}${path}/data.xml`;
}

/**
 * Pull a single tag's text content (first match only). The Akoma-Ntoso
 * documents we care about are well-formed and don't nest the tags we
 * extract here — a regex is sufficient and keeps us dep-free.
 */
function firstTagText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return decodeXmlEntities(stripTags(m[1])).trim() || null;
}

function firstAttr(xml: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${attr}=("([^"]*)"|'([^']*)')`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  return (m[2] ?? m[3] ?? null) || null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

/**
 * Extract the section block matching the given URL's `/section/<n>` segment.
 * Handles both `<Section ...>` and `<P1para ...>` Akoma-Ntoso shapes.
 */
function extractSection(xml: string, sectionNumber: string | null): string | null {
  if (!sectionNumber) return null;
  // Try <Section> with matching <Number>N</Number>
  const sectionRe = new RegExp(
    `<Section\\b[^>]*>[\\s\\S]*?<Number>\\s*${escapeRe(sectionNumber)}\\s*<\\/Number>[\\s\\S]*?<\\/Section>`,
    'i',
  );
  const sm = xml.match(sectionRe);
  if (sm) {
    return decodeXmlEntities(stripTags(sm[0])).replace(/\s+/g, ' ').trim() || null;
  }
  // Try <P1para> wrapper used in some SI documents.
  const paraRe = new RegExp(
    `<P1para\\b[^>]*\\bid=("|')[^"']*-${escapeRe(sectionNumber)}\\1[^>]*>[\\s\\S]*?<\\/P1para>`,
    'i',
  );
  const pm = xml.match(paraRe);
  if (pm) {
    return decodeXmlEntities(stripTags(pm[0])).replace(/\s+/g, ' ').trim() || null;
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseSectionNumberFromUrl(url: string): string | null {
  const m = url.match(/\/section\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/**
 * Parse a legislation.gov.uk XML document into a LegislationDoc.
 * Exported for tests; production callers should use `fetchStatuteByUri`.
 */
export function parseLegislationXml(xml: string, sourceUrl: string): LegislationDoc {
  const title =
    firstTagText(xml, 'dc:title') ||
    firstTagText(xml, 'FRBRname') ||
    firstAttr(xml, 'FRBRname', 'value') ||
    firstTagText(xml, 'ukm:Title') ||
    'Untitled UK legislation';

  const sectionNumber = parseSectionNumberFromUrl(sourceUrl);
  const sectionText = extractSection(xml, sectionNumber);

  // Best-effort metadata extraction. Several dialects of the metadata
  // header exist; we try the most common ones.
  const inForceOn =
    firstAttr(xml, 'ukm:DocumentVersion', 'date') ||
    firstAttr(xml, 'FRBRdate', 'date') ||
    null;
  const lastAmended =
    firstAttr(xml, 'ukm:Modified', 'Date') ||
    firstAttr(xml, 'ukm:Modified', 'date') ||
    null;

  // <ukm:UnappliedEffects> presence indicates that the visible XML may be
  // pre-amendment text with a known pending effect. Surface this so the
  // pipeline can flag the citation rather than paper over it.
  const hasUnappliedEffects = /<ukm:UnappliedEffects\b[^>]*>[\s\S]*?<\/ukm:UnappliedEffects>/i.test(xml)
    || /<ukm:UnappliedEffects\b[^>]*\/>/i.test(xml);

  const fullCitation = sectionNumber
    ? `${title}, section ${sectionNumber}`
    : title;

  return {
    title,
    fullCitation,
    sectionText,
    sectionNumber,
    inForceOn,
    lastAmended,
    sourceUrl,
    hasUnappliedEffects,
    raw: xml,
  };
}

/**
 * Fetch a single statute (or section thereof) from legislation.gov.uk.
 *
 * @param uri  Either a full https URL or an Akoma-Ntoso path. Anything
 *             not on legislation.gov.uk returns `null` immediately —
 *             we never proxy non-authority hosts through this client.
 * @param opts Optional cache + abort signal. Cache is per-call: pass the
 *             same Map across multiple invocations within a single
 *             request to dedupe.
 */
export async function fetchStatuteByUri(
  uri: string,
  opts: { cache?: FetchCache; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<LegislationDoc | null> {
  const xmlUrl = toXmlUri(uri);
  if (!xmlUrl) return null;

  if (opts.cache?.has(xmlUrl)) {
    return opts.cache.get(xmlUrl) ?? null;
  }

  const controller = opts.signal ? null : new AbortController();
  const timeout = opts.timeoutMs ?? 10_000;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const res = await fetch(xmlUrl, {
      headers: {
        // Be polite: identify ourselves so TNA can throttle or contact us.
        'User-Agent': 'paybacker-compliance-bot/1.0 (+https://paybacker.co.uk)',
        Accept: 'application/xml, text/xml',
      },
      signal: opts.signal ?? controller?.signal,
    });
    if (!res.ok) {
      opts.cache?.set(xmlUrl, null);
      return null;
    }
    const xml = await res.text();
    if (!xml || xml.length < 50) {
      opts.cache?.set(xmlUrl, null);
      return null;
    }
    const doc = parseLegislationXml(xml, xmlUrl);
    opts.cache?.set(xmlUrl, doc);
    return doc;
  } catch (err) {
    // Network / timeout / abort — return null so callers fall back gracefully.
    console.warn('[legislation-gov-uk] fetch failed', xmlUrl, (err as Error)?.message);
    opts.cache?.set(xmlUrl, null);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Search legislation.gov.uk's Atom feed by title. Returns the parsed
 * entries (with no body — callers should `fetchStatuteByUri` to hydrate
 * the canonical text for any hit they want to use).
 *
 * Defaults to UK Public General Acts + Statutory Instruments since
 * those cover ~all of our consumer-rights citations.
 */
export async function searchByTitle(
  query: string,
  opts: { types?: ReadonlyArray<string>; limit?: number; signal?: AbortSignal } = {},
): Promise<LegislationSearchResult[]> {
  if (!query || query.trim().length === 0) return [];
  const types = opts.types && opts.types.length > 0 ? opts.types : ['ukpga', 'uksi'];
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 50));

  // legislation.gov.uk Atom search URL — `/all` accepts repeated `type=`.
  const params = new URLSearchParams();
  params.set('title', query);
  for (const t of types) params.append('type', t);
  const url = `https://www.legislation.gov.uk/all/data.feed?${params.toString()}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'paybacker-compliance-bot/1.0 (+https://paybacker.co.uk)',
        Accept: 'application/atom+xml, application/xml',
      },
      signal: opts.signal,
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseAtomFeed(xml).slice(0, limit);
  } catch (err) {
    console.warn('[legislation-gov-uk] search failed', query, (err as Error)?.message);
    return [];
  }
}

/**
 * Parse an Atom feed from legislation.gov.uk. Exported for tests.
 */
export function parseAtomFeed(xml: string): LegislationSearchResult[] {
  const out: LegislationSearchResult[] = [];
  const entryRe = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = entryRe.exec(xml))) {
    const block = m[1];
    const title = firstTagText(block, 'title') || '';
    const linkHref = firstAttr(block, 'link', 'href') || '';
    const published = firstTagText(block, 'published') || firstTagText(block, 'updated');
    const docType = firstTagText(block, 'ukm:DocumentMainType') ||
      firstAttr(block, 'ukm:DocumentMainType', 'Value');
    const year = Number(firstTagText(block, 'ukm:Year') || firstAttr(block, 'ukm:Year', 'Value'));
    const number = Number(firstTagText(block, 'ukm:Number') || firstAttr(block, 'ukm:Number', 'Value'));
    if (!title || !linkHref) continue;
    out.push({
      title,
      url: linkHref,
      documentType: docType || null,
      year: Number.isFinite(year) && year > 0 ? year : null,
      number: Number.isFinite(number) && number > 0 ? number : null,
      published: published || null,
    });
  }
  return out;
}

/**
 * Decide whether a fetched LegislationDoc is authoritative enough to skip
 * the Perplexity fallback in the verify pipeline.
 *
 * A canonical fetch returning XML with a non-empty <dc:title> is NOT, on
 * its own, sufficient — the parser may have missed the requested section
 * (mismatched id, SI-only `<P1para>` shape we don't recognise, etc.) or
 * the URL may target a whole Act whose title doesn't actually match the
 * ref's stored statute name. In either case we'd silently mark the row
 * as `no_change` even though we never confirmed the cited provision.
 *
 * Authoritative iff:
 *   - doc.title is non-empty, AND
 *   - if the source URL targets a /section/<n>: doc.sectionText non-empty
 *     AND doc.sectionNumber matches the URL's section, OR
 *   - if the source URL targets a whole Act (no /section/...): the
 *     canonical title fuzzy-matches the ref's stored law_name.
 *
 * Returns `{ authoritative: boolean, reason: string }` so callers can log
 * exactly why they fell back to Perplexity.
 */
export function isLegislationDocAuthoritative(
  doc: LegislationDoc | null | undefined,
  ref: { source_url: string; law_name: string },
): { authoritative: boolean; reason: string } {
  if (!doc) return { authoritative: false, reason: 'doc:null' };
  if (!doc.title || !doc.title.trim()) {
    return { authoritative: false, reason: 'doc:no-title' };
  }

  const urlSection = parseSectionNumberFromUrlExternal(ref.source_url);
  if (urlSection) {
    if (!doc.sectionText || !doc.sectionText.trim()) {
      return { authoritative: false, reason: 'doc:section-text-missing' };
    }
    if (!doc.sectionNumber) {
      return { authoritative: false, reason: 'doc:section-number-missing' };
    }
    if (doc.sectionNumber.trim().toLowerCase() !== urlSection.trim().toLowerCase()) {
      return {
        authoritative: false,
        reason: `doc:section-mismatch(url=${urlSection},doc=${doc.sectionNumber})`,
      };
    }
    return { authoritative: true, reason: 'doc:section-match' };
  }

  // Whole-Act URI — require fuzzy title match against ref.law_name.
  if (!fuzzyTitleMatch(doc.title, ref.law_name)) {
    return {
      authoritative: false,
      reason: `doc:title-mismatch(doc='${doc.title}',ref='${ref.law_name}')`,
    };
  }
  return { authoritative: true, reason: 'doc:title-match' };
}

/** Same logic as `parseSectionNumberFromUrl` but tolerant of bare URIs. */
function parseSectionNumberFromUrlExternal(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/section\/([^/?#]+)/i);
  return m ? m[1] : null;
}

/** Strip punctuation & collapse whitespace; lowercase. */
function normaliseTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Loose title match used by `isLegislationDocAuthoritative` for whole-Act
 * URIs. Accepts either an exact normalised match or a containment relation
 * (one side fully contains the other after normalisation) — that handles
 * things like canonical "Consumer Rights Act 2015" vs stored
 * "Consumer Rights Act 2015 (c. 15)" without false positives across
 * unrelated statutes.
 */
export function fuzzyTitleMatch(a: string, b: string): boolean {
  const na = normaliseTitle(a);
  const nb = normaliseTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}

/**
 * Convenience: returns true if the given URL is hosted by legislation.gov.uk.
 * Use this to gate the "primary statute fetcher" branch in the enrichment
 * pipeline — anything else falls through to Perplexity.
 */
export function isLegislationGovUkUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return HOST_ALLOW.has(u.hostname);
  } catch {
    return false;
  }
}
