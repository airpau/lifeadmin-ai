/**
 * Ombudsman / ADR routing for a dispute.
 *
 * Before this file the codebase had THREE partially-overlapping and
 * mutually unaware sector→ombudsman sources:
 *
 *   1. `ombudsmanForType()` in src/lib/dispute-agent/state-machine.ts —
 *      returns a bare display string, no URL, no eligibility, no deadline.
 *      Used only to write rationale prose.
 *   2. `SECTOR_GUIDANCE` in src/data/complaint-sectors.ts — by far the
 *      richest (name, url, eligibility, timeLimit, cost, binding, plus
 *      per-sector deadlines) but consumed ONLY by the SEO marketing pages.
 *   3. `legal_references.escalation_body` — a free-text column.
 *
 * The escalation pack needs real, actionable routing (where do I send it,
 * am I eligible yet, how long have I got), so it resolves against (2) —
 * the one source that actually carries that information — and falls back
 * to the honest "no ombudsman exists for this sector" route rather than
 * inventing a body.
 *
 * This module does NOT modify any of the three existing sources. It is a
 * read-only resolver over `SECTOR_GUIDANCE`.
 */

import { SECTOR_GUIDANCE, type EscalationRoute, type SectorGuidance } from '@/data/complaint-sectors';

export interface OmbudsmanRouting {
  /** Key into SECTOR_GUIDANCE, or null when nothing matched. */
  sectorKey: string | null;
  /** Human sector label, e.g. "energy supplier". */
  sectorLabel: string | null;
  route: EscalationRoute;
  /** Sector deadlines, verbatim from SECTOR_GUIDANCE. Empty when unmatched. */
  deadlines: { title: string; body: string }[];
  /** Sector-specific points that belong in the referral letter. */
  letterPoints: string[];
  /**
   * False when we fell through to the generic chargeback / section 75 /
   * small claims route because no ombudsman covers this sector. The UI
   * must say so plainly rather than implying an ombudsman exists.
   */
  hasOmbudsman: boolean;
}

/** The generic route used when no sector matches, or the sector has no ADR body. */
const GENERIC_ROUTE: EscalationRoute = {
  name: 'chargeback, section 75 or the small claims court',
  url: 'https://www.gov.uk/make-court-claim-for-money',
  eligibility:
    'No ombudsman or ADR scheme covers this sector, so once the company has given you its final answer the next step is your card provider or the county court.',
  timeLimit:
    'Chargeback is normally 120 days from the transaction or from when you expected delivery. A court claim is six years from the breach in England, Wales and Northern Ireland, five in Scotland.',
  cost:
    'Chargeback and section 75 are free. A money claim under £300 costs £35 to issue online, rising with the value of the claim.',
  binding:
    'A county court judgment is binding and enforceable. A chargeback can be reversed by the merchant; a refused section 75 claim can itself be taken to the Financial Ombudsman.',
};

/**
 * `issue_type` on `disputes` (the CHECK-constrained column) mapped to a
 * SECTOR_GUIDANCE key. Types with no sector equivalent are deliberately
 * absent — parking, HMRC, council tax, DVLA and NHS all escalate through
 * bodies that are not ombudsmen and are not in SECTOR_GUIDANCE, so they
 * fall through to the honest generic route.
 */
const ISSUE_TYPE_TO_SECTOR: Record<string, string> = {
  energy_dispute: 'energy',
  broadband_complaint: 'broadband',
  flight_compensation: 'airline',
  debt_dispute: 'banking',
  refund_request: 'retail',
};

/**
 * Free-text keyword fallback over `dispute_type`, `merchant_industry`,
 * `provider_type` and the provider name. Ordered most-specific first —
 * "broadband" must beat "band", "water" must not match "Waterstones", so
 * matching is on word boundaries.
 */
const KEYWORD_TO_SECTOR: Array<[RegExp, string]> = [
  [/\b(energy|electric(ity)?|gas|npower|octopus|ovo|edf|eon|british gas|scottish power|bulb|utilita)\b/i, 'energy'],
  [/\b(water|sewerage|thames water|severn trent|anglian water|united utilities|yorkshire water)\b/i, 'water'],
  [/\b(broadband|internet|fibre|isp|virgin media|sky broadband|bt|talktalk|plusnet|hyperoptic)\b/i, 'broadband'],
  [/\b(mobile|phone|sim|network|ee|o2|vodafone|three|giffgaff|tesco mobile)\b/i, 'mobile'],
  [/\b(insurance|insurer|policy|claim|admiral|aviva|direct line|hastings|churchill|axa)\b/i, 'insurance'],
  [/\b(bank(ing)?|current account|overdraft|savings account|lloyds|barclays|natwest|halifax|santander|monzo|starling|nationwide|hsbc)\b/i, 'banking'],
  [/\b(bnpl|buy now pay later|klarna|clearpay|laybuy|zilch)\b/i, 'bnpl'],
  [/\b(payment|card issuer|paypal|revolut|wise|stripe|chargeback|section 75)\b/i, 'payments'],
  [/\b(airline|flight|airport|ryanair|easyjet|british airways|jet2|wizz|tui)\b/i, 'airline'],
  [/\b(rail|train|tube|bus|coach|tram|avanti|lner|northern rail|govia|southeastern|transport)\b/i, 'transport'],
  [/\b(post(al)?|royal mail|parcelforce)\b/i, 'postal'],
  [/\b(parcel|courier|delivery|evri|hermes|dpd|yodel|dhl|ups)\b/i, 'delivery'],
  [/\b(gym|leisure centre|fitness|puregym|the gym group|david lloyd|nuffield)\b/i, 'gym'],
  [/\b(streaming|subscription service|netflix|spotify|disney\+?|now tv|amazon prime|apple tv)\b/i, 'streaming'],
  [/\b(retail(er)?|shop|store|online order|amazon|argos|currys|john lewis|very|asos)\b/i, 'retail'],
];

export interface RoutingInput {
  issueType?: string | null;
  disputeType?: string | null;
  merchantIndustry?: string | null;
  providerType?: string | null;
  providerName?: string | null;
  issueSummary?: string | null;
}

/** Resolve the sector key for a dispute, or null when nothing matches. */
export function resolveSectorKey(input: RoutingInput): string | null {
  // 1. The CHECK-constrained issue_type is the highest-confidence signal.
  const byIssue = input.issueType ? ISSUE_TYPE_TO_SECTOR[input.issueType] : undefined;
  if (byIssue) return byIssue;

  // 2. Exact sector-key match on any of the looser fields.
  for (const candidate of [input.disputeType, input.merchantIndustry, input.providerType]) {
    const key = (candidate ?? '').trim().toLowerCase();
    if (key && SECTOR_GUIDANCE[key]) return key;
  }

  // 3. Keyword sweep. Provider name last so a merchant called "Water
  //    Babies" cannot outrank an explicit `merchant_industry` of 'energy'.
  const haystack = [
    input.disputeType,
    input.merchantIndustry,
    input.providerType,
    input.issueSummary,
    input.providerName,
  ].filter(Boolean).join(' ');

  if (haystack.trim()) {
    for (const [pattern, sector] of KEYWORD_TO_SECTOR) {
      if (pattern.test(haystack)) return sector;
    }
  }

  return null;
}

/**
 * Full routing for a dispute. Always returns something usable — worst
 * case, the generic chargeback / section 75 / small claims route with
 * `hasOmbudsman: false`.
 */
export function resolveOmbudsman(input: RoutingInput): OmbudsmanRouting {
  const sectorKey = resolveSectorKey(input);
  const guidance: SectorGuidance | undefined = sectorKey ? SECTOR_GUIDANCE[sectorKey] : undefined;

  if (!guidance) {
    return {
      sectorKey: null,
      sectorLabel: null,
      route: GENERIC_ROUTE,
      deadlines: [],
      letterPoints: [],
      hasOmbudsman: false,
    };
  }

  // SECTOR_GUIDANCE uses a shared NO_OMBUDSMAN constant for retail,
  // streaming, gym and delivery. Detect it by its URL rather than by
  // identity so the check survives the object being cloned.
  const hasOmbudsman = guidance.escalation.url !== 'https://www.gov.uk/make-court-claim-for-money';

  return {
    sectorKey,
    sectorLabel: guidance.label,
    route: guidance.escalation,
    deadlines: guidance.deadlines,
    letterPoints: guidance.letterPoints,
    hasOmbudsman,
  };
}
