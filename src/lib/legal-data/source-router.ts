/**
 * src/lib/legal-data/source-router.ts
 *
 * Canonical source router for the Compliance Centre's verify /
 * amendments-sweep / discover pipelines.
 *
 * Given a `legal_references` row (or anything with a `source_url`),
 * decide WHICH first-party fetcher should be tried first BEFORE we
 * fall back to Perplexity. This is what wires the previously-orphaned
 * `gov-uk-content.ts` (CMA cases, regulator decisions) and
 * `find-case-law.ts` (Find Case Law / TNA) modules into production.
 *
 * Per `docs/legal-data-api-research-2026-05-01.md` Phase 5:
 *   - legislation.gov.uk → primary statutes (existing, unchanged)
 *   - gov.uk content API → CMA cases + regulator decision pages
 *     under `/cma-cases/` and `/government/publications/`
 *   - Find Case Law (TNA) → caselaw.nationalarchives.gov.uk +
 *     bailii.org + judiciary.uk hosts. **Licence-gated** by
 *     `FIND_CASE_LAW_LICENCE_ACCEPTED=true`; the gate is enforced at
 *     the call site, not here. The router will still RETURN
 *     `'find-case-law'` for these hosts so callers can log skipped
 *     decisions consistently.
 *   - Everything else → fall through to Perplexity.
 *
 * COMPLIANCE PRINCIPLE: this module is pure — no I/O, no env reads.
 * It just classifies. The licence env-gate lives at the call site
 * (verify route, crons) so unit tests don't need to mutate process.env
 * to exercise the dispatch matrix.
 */

export type CanonicalSourceKind =
  | 'legislation'
  | 'gov-uk-content'
  | 'find-case-law'
  | 'perplexity';

interface RoutableRef {
  source_url?: string | null;
  url?: string | null;
}

/**
 * Decide which canonical fetcher to try for a given citation.
 *
 * Pure synchronous classifier — no env reads, no network. Defaults to
 * `'perplexity'` whenever the URL is missing, malformed, or doesn't
 * match a recognised authority host.
 */
export function pickCanonicalSource(
  ref: RoutableRef | string | null | undefined,
): CanonicalSourceKind {
  const raw =
    typeof ref === 'string'
      ? ref
      : ref?.source_url ?? ref?.url ?? '';
  if (!raw || typeof raw !== 'string') return 'perplexity';

  let host = '';
  let path = '';
  try {
    const u = new URL(raw);
    host = u.hostname.toLowerCase();
    path = u.pathname.toLowerCase();
  } catch {
    return 'perplexity';
  }

  // 1. legislation.gov.uk (and www. variant)
  if (/^(www\.)?legislation\.gov\.uk$/.test(host)) {
    return 'legislation';
  }

  // 2. gov.uk content API — CMA cases + government publications.
  //    Other gov.uk paths (guidance, news, contact pages) fall through
  //    to Perplexity because they don't have stable, citation-grade
  //    JSON shape under /api/content.
  if (/^(www\.)?gov\.uk$/.test(host)) {
    if (
      path.includes('/cma-cases/') ||
      path.includes('/government/publications/')
    ) {
      return 'gov-uk-content';
    }
    return 'perplexity';
  }

  // 3. Find Case Law (TNA) family — caselaw.nationalarchives.gov.uk,
  //    bailii.org, judiciary.uk. Licence enforcement is at the call
  //    site, not here.
  if (host === 'caselaw.nationalarchives.gov.uk') return 'find-case-law';
  if (/^(www\.)?bailii\.org$/.test(host)) return 'find-case-law';
  if (/^(www\.)?judiciary\.uk$/.test(host)) return 'find-case-law';

  // 4. Anything else → Perplexity (commentary, regulator subdomains
  //    we don't have a typed client for, etc.)
  return 'perplexity';
}

/**
 * Mapping from `CanonicalSourceKind` to the audit-trail string used in
 * `legal_ref_corrections.proposer` / `legal_ref_verifications.verifier`.
 * The B2B `legal_basis_freshness.source` field uses these same labels.
 */
export const SOURCE_LABEL: Record<CanonicalSourceKind, string> = {
  legislation: 'legislation.gov.uk',
  'gov-uk-content': 'gov-uk-content',
  'find-case-law': 'find-case-law',
  perplexity: 'perplexity',
};
