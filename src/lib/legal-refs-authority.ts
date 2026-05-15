/**
 * UK legal-citation source authority allowlist.
 *
 * The compliance pipeline (Perplexity-driven discovery + verifier) will
 * only accept proposed citation URLs that come from this allowlist OR
 * from the small SECONDARY_SOURCE_DOMAINS list (which queues with a
 * forced low-confidence warning, never auto-applies).
 *
 * Rule: a citation URL must be on this allowlist OR be an explicit
 * subdomain of one. Trade associations, law-firm blogs, news sites,
 * consumer-rights aggregators, and Wikipedia are NOT acceptable —
 * they are commentary, not authority.
 *
 * Categories:
 *  - Primary legislation: legislation.gov.uk
 *  - Government guidance: gov.uk subdomains
 *  - Statutory regulators: fca.org.uk, ofcom.org.uk, ofgem.gov.uk,
 *    cma.gov.uk, ico.org.uk, caa.co.uk, orr.gov.uk
 *  - Statutory ombudsmen: financial-ombudsman.org.uk, lgo.org.uk,
 *    spso.org.uk, ombudsman-services.org, ombudsman.wales
 *  - Court decisions: bailii.org, judiciary.uk, supremecourt.uk
 *  - Parliament: parliament.uk
 *  - HMRC/DVLA/NHS: covered by gov.uk subdomain match + nhs.uk
 *  - Legacy retained EU law: legislation.gov.uk only (not europa.eu)
 */
export const UK_LEGAL_AUTHORITY_DOMAINS: ReadonlyArray<string> = [
  'legislation.gov.uk',
  'gov.uk', // includes hmrc.gov.uk, dvla.gov.uk, ofgem.gov.uk, ico.org.uk via subdomain
  'parliament.uk',
  'fca.org.uk',
  'handbook.fca.org.uk',
  'ofcom.org.uk',
  'ofgem.gov.uk',
  'caa.co.uk',
  'orr.gov.uk',
  'cma.gov.uk',
  'ico.org.uk',
  'financial-ombudsman.org.uk',
  'lgo.org.uk',
  'spso.org.uk',
  'ombudsman-services.org',
  'ombudsman.wales',
  'judiciary.uk',
  'supremecourt.uk',
  'bailii.org',
  'nhs.uk',
];

/**
 * Optional EXPANSION list — sources that are useful for context or
 * cross-reference but should NEVER be the primary cited source. We
 * don't auto-reject corrections that cite these (because they may be
 * the only available source), but they MUST be flagged with a warning
 * for founder review and the existing canonical citation must NOT be
 * silently overwritten.
 */
export const SECONDARY_SOURCE_DOMAINS: ReadonlyArray<string> = [
  'citizensadvice.org.uk',
  'moneyhelper.org.uk',
];

/**
 * Hard rejection list — known non-authority sources that should never
 * appear as a citation, even with a warning. Pure commentary.
 */
export const REJECTED_SOURCE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bukfinance\.org\.uk\b/i,
  /\bwhich\.co\.uk\b/i,
  /\bmoneysavingexpert\.com\b/i,
  /\babi\.org\.uk\b/i,
  /\bbsa\.org\.uk\b/i,
  /\bukcards-association\b/i,
  /\bwikipedia\.org\b/i,
  /\bgov\.uk\/blog\b/i,
];

export interface AuthorityCheck {
  ok: boolean;
  reason: 'authority' | 'secondary' | 'rejected' | 'unrecognised';
  matched_domain?: string;
  hostname?: string;
}

/**
 * Parse a hostname out of a URL string. Strips protocol, port, path,
 * leading "www.", and lowercases. Returns null if unparseable.
 */
function parseHostname(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  let s = url.trim();
  if (!s) return null;
  // Strip scheme
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//, '');
  // Strip user:pass@
  s = s.replace(/^[^@/]*@/, '');
  // Take up to first / ? # or end
  const m = s.match(/^([^/?#]+)/);
  if (!m) return null;
  let host = m[1];
  // Strip port
  host = host.replace(/:\d+$/, '');
  host = host.toLowerCase();
  if (!host) return null;
  // Strip leading www.
  if (host.startsWith('www.')) host = host.slice(4);
  return host || null;
}

/**
 * True iff `hostname` equals `domain` or is a subdomain of `domain`.
 * Uses label-boundary matching so badactor-legislation.gov.uk.fake.com
 * does NOT match legislation.gov.uk.
 */
function hostMatchesDomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  if (h === d) return true;
  return h.endsWith('.' + d);
}

/**
 * Returns whether a URL is from an acceptable UK legal authority,
 * a secondary source (allow with warning), or rejected outright.
 *
 *   ok=true  + reason='authority'   → safe to auto-process
 *   ok=true  + reason='secondary'   → flag for founder review, never auto-apply
 *   ok=false + reason='rejected'    → drop the proposal entirely; never queue
 *   ok=false + reason='unrecognised'→ drop and log; founder may add to allowlist
 */
export function checkUkLegalAuthority(url: string): AuthorityCheck {
  const hostname = parseHostname(url);
  if (!hostname) {
    return { ok: false, reason: 'unrecognised' };
  }

  // 1. Hard rejection patterns are tested against the full URL so path-
  //    based patterns (e.g. gov.uk/blog) work too.
  for (const re of REJECTED_SOURCE_PATTERNS) {
    if (re.test(url)) {
      return { ok: false, reason: 'rejected', hostname };
    }
  }

  // 2. Authority allowlist — exact or parent-domain match.
  for (const domain of UK_LEGAL_AUTHORITY_DOMAINS) {
    if (hostMatchesDomain(hostname, domain)) {
      return {
        ok: true,
        reason: 'authority',
        matched_domain: domain,
        hostname,
      };
    }
  }

  // 3. Secondary list — ditto.
  for (const domain of SECONDARY_SOURCE_DOMAINS) {
    if (hostMatchesDomain(hostname, domain)) {
      return {
        ok: true,
        reason: 'secondary',
        matched_domain: domain,
        hostname,
      };
    }
  }

  // 4. Anything else.
  return { ok: false, reason: 'unrecognised', hostname };
}
