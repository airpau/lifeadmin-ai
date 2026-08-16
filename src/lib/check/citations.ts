/**
 * Verified-citation retrieval for the public /check funnel.
 *
 * This is the whole competitive claim of the product, so the rules here
 * are deliberately strict and deliberately boring:
 *
 *   1. Citations are RETRIEVED from `legal_references`. Nothing on this
 *      path asks a language model what the law is. There is no generation
 *      step, so there is nothing to hallucinate.
 *   2. Only rows whose `verification_status` is in
 *      CITATION_PERMISSIVE_STATUSES are eligible, which is the same gate
 *      the authenticated complaint engine uses.
 *   3. Every row's `source_url` is run through `checkUkLegalAuthority`.
 *      Anything that is not on the UK legal authority allowlist is
 *      dropped, not softened, not shown with a warning. A citation that
 *      points at a trade body or a news article is not a citation.
 *   4. Every row we return carries its provenance to the UI: the source
 *      hostname, the allowlist domain it matched, and how many days ago
 *      the compliance pipeline last verified it.
 *
 * If nothing survives those gates we return an empty list and the page
 * says so. That is the honest outcome and it is better than the failure
 * mode we are competing against, which is a confident citation of the
 * wrong statute.
 */

import { createClient } from '@supabase/supabase-js';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';
import { CITATION_PERMISSIVE_STATUSES } from '@/lib/legal-refs-statuses';
import type { CheckCategory } from './categories';

export type VerifiedCitation = {
  id: string;
  lawName: string;
  section: string | null;
  /** Plain-English one-liner, trimmed from the stored summary. */
  meaning: string;
  sourceUrl: string;
  /** Hostname of the source, e.g. legislation.gov.uk. */
  sourceHost: string;
  /** The allowlist entry the hostname matched. */
  authorityDomain: string;
  escalationBody: string | null;
  strength: string | null;
  category: string;
  /** Days since the compliance pipeline last verified this row, null if unknown. */
  verifiedDaysAgo: number | null;
  /**
   * True where the row is flagged `needs_review`. The rule itself is
   * verified, but a specific figure inside it may have moved, so the UI
   * says "figures under review" rather than presenting it as settled.
   */
  figuresUnderReview: boolean;
};

type RawRef = {
  id: string;
  category: string;
  law_name: string;
  section: string | null;
  summary: string | null;
  source_url: string | null;
  escalation_body: string | null;
  strength: string | null;
  applies_to: string[] | null;
  verification_status: string | null;
  last_verified: string | null;
};

function anonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Trim a stored summary to a readable plain-English meaning.
 *
 * Deliberately NOT "first sentence only". On the rules that matter most
 * the operative right lives in the second sentence: "Providers must give
 * 30 days notice of a mid-contract price rise. If the rise was not
 * clearly disclosed at sale, you have the right to exit penalty-free."
 * Cutting at the first full stop throws away the part the user came for.
 * So we keep the whole summary when it fits, and otherwise cut at the
 * last sentence boundary that does fit.
 *
 * Em dashes are normalised to commas to match house style.
 */
const MEANING_CAP = 260;

function toMeaning(summary: string | null): string {
  const raw = (summary ?? '').replace(/\s+/g, ' ').trim();
  if (!raw) return 'See the official source for the full wording of this rule.';
  const normalised = raw.replace(/\s*[—–]\s*/g, ', ');
  if (normalised.length <= MEANING_CAP) return normalised;

  const window = normalised.slice(0, MEANING_CAP);
  const lastStop = Math.max(window.lastIndexOf('. '), window.lastIndexOf('; '));
  if (lastStop > 80) return window.slice(0, lastStop + 1);
  return window.replace(/[,;\s]+\S*$/, '') + '…';
}

/**
 * Days since the compliance pipeline last touched this row.
 *
 * Read straight off `last_verified` rather than through
 * `freshnessTier`, because that helper only returns a tier for rows
 * whose verification_status is in the strict set. Rows flagged
 * `needs_review` are exactly the ones we most want to show a checked-on
 * date for, since the UI pairs the date with the "figures under review"
 * caveat. This is a factual statement about the row, not a freshness
 * judgement, so the status gate does not belong here.
 */
function verifiedDaysAgo(lastVerified: string | null, now: Date): number | null {
  if (!lastVerified) return null;
  const t = new Date(lastVerified).getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now.getTime() - t) / 86400000);
  return days < 0 ? 0 : days;
}

/**
 * Score a ref against the user's own words plus a small set of scenario
 * signals. Purely lexical and deterministic, so the same input always
 * produces the same ordering. Used only for ranking, never for filtering
 * a ref in that the category gate would have excluded.
 */
function relevanceScore(ref: RawRef, description: string, categoryRank: number): number {
  const haystack = `${ref.law_name} ${ref.section ?? ''} ${ref.summary ?? ''}`.toLowerCase();
  const text = description.toLowerCase();

  let score = 0;

  // Sector-specific rows beat pan-sector ones.
  score += (10 - categoryRank) * 6;

  // Regulator-issued rules are usually the sharper argument for a
  // sector dispute, and they are exactly what a generic model misses.
  if (/ofcom|ofgem|fca|caa|voa|cma/i.test(ref.law_name)) score += 14;

  if (ref.strength === 'strong') score += 10;
  else if (ref.strength === 'moderate') score += 4;

  // Token overlap with what the user actually wrote.
  const tokens = Array.from(
    new Set(
      text
        .split(/[^a-z0-9£]+/)
        .filter((t) => t.length >= 5 && !STOPWORDS.has(t)),
    ),
  ).slice(0, 40);
  for (const t of tokens) {
    if (haystack.includes(t)) score += 5;
  }

  // Scenario phrase signals, weighted higher than a bare token hit
  // because they map onto the specific rule that governs the scenario.
  for (const [pattern, needle, weight] of PHRASE_SIGNALS) {
    if (pattern.test(text) && needle.test(haystack)) score += weight;
  }

  return score;
}

const STOPWORDS = new Set([
  'about', 'after', 'again', 'because', 'been', 'being', 'could', 'every', 'from',
  'have', 'having', 'never', 'other', 'should', 'since', 'still', 'their', 'there',
  'these', 'they', 'this', 'those', 'through', 'until', 'were', 'what', 'when',
  'which', 'while', 'with', 'would', 'your', 'that', 'told', 'said', 'just',
  'them', 'even', 'also', 'want', 'wants', 'wanted', 'really', 'anything',
]);

/** [what the user said, what the rule must mention, weight] */
const PHRASE_SIGNALS: ReadonlyArray<[RegExp, RegExp, number]> = [
  [/price\s*(rise|increase|hike|went up|going up)|put(ting)? (the )?price/i, /price|increase|rise|tariff/i, 30],
  [/mid[- ]?contract|part way through|during my contract/i, /mid[- ]?contract|price|exit|notice/i, 28],
  [/exit fee|early termination|cancellation charge|leave.*(fee|charge)/i, /exit|terminat|penalty|switch/i, 24],
  [/estimat(e|ed|ing)|meter read/i, /estimat|meter|reading|bill/i, 26],
  [/back[- ]?bill|owe.*(year|months)|catch[- ]?up bill/i, /back[- ]?bill|12 month|unbilled/i, 30],
  [/delay(ed)?|cancel(l)?ed flight|denied boarding|overbook/i, /delay|cancel|denied boarding|261/i, 30],
  [/faulty|broken|not as described|damaged|split|defect/i, /satisfactory quality|fit for purpose|description|reject/i, 26],
  [/refund|money back|reimburse/i, /refund|reject|remedy|price reduction/i, 20],
  [/statute barred|six years|6 years|last paid/i, /limitation|barred|six year/i, 30],
  [/do ?n.t recognise|never had|not mine|no agreement/i, /agreement|proof|section 77|section 78|conc/i, 26],
  [/credit card|section 75|paid by card/i, /section 75|credit/i, 26],
  [/direct debit|unauthorised|took money|payment taken/i, /payment services|unauthorised|direct debit/i, 26],
  [/signage|sign(s)? (did|were)|not clear|no sign/i, /signage|notice|protection of freedoms|schedule 4/i, 26],
  [/speed|slow|buffering|dropout/i, /speed|minimum guaranteed|quality/i, 24],
  [/outage|no service|down for/i, /automatic compensation|outage|loss of service/i, 26],
  [/cancel(l)?ed|notice period|auto[- ]?renew/i, /cancel|notice|renewal|unfair term/i, 20],
  [/band|neighbour|identical hous|comparable/i, /band|valuation|council tax/i, 26],
  [/tax code|emergency tax|overpaid tax|rebate/i, /tax|overpayment|relief/i, 26],
];

/**
 * Retrieve the verified citations that apply to a case.
 *
 * Never throws. On any failure it returns an empty list and the caller
 * tells the user we could not match a verified rule, which is the safe
 * direction to fail in.
 */
export async function getVerifiedCitations(
  category: CheckCategory,
  description: string,
  limit = 5,
): Promise<{ citations: VerifiedCitation[]; droppedNonAuthority: number }> {
  try {
    const sb = anonClient();
    const { data, error } = await sb
      .from('legal_references')
      .select(
        'id, category, law_name, section, summary, source_url, escalation_body, strength, applies_to, verification_status, last_verified',
      )
      .in('category', category.refCategories)
      .in('verification_status', CITATION_PERMISSIVE_STATUSES as unknown as string[]);

    if (error || !data) return { citations: [], droppedNonAuthority: 0 };

    const rows = data as RawRef[];
    let dropped = 0;
    const seenLaw = new Set<string>();
    const scored: Array<{ ref: RawRef; check: ReturnType<typeof checkUkLegalAuthority>; score: number }> = [];

    for (const ref of rows) {
      // Mirror the authenticated engine: a `general` row that declares a
      // sector-specific applies_to must overlap this case's categories,
      // otherwise gym rules leak into broadband letters.
      if (ref.category === 'general') {
        const appliesTo = Array.isArray(ref.applies_to) ? ref.applies_to : [];
        if (
          appliesTo.length > 0 &&
          !appliesTo.some(
            (a) =>
              category.refCategories.includes(String(a).toLowerCase()) ||
              String(a).toLowerCase() === category.letterType,
          )
        ) {
          continue;
        }
      }

      if (!ref.source_url) {
        dropped += 1;
        continue;
      }
      const check = checkUkLegalAuthority(ref.source_url);
      if (!check.ok || check.reason !== 'authority') {
        dropped += 1;
        continue;
      }

      const categoryRank = category.refCategories.indexOf(ref.category);
      scored.push({
        ref,
        check,
        score: relevanceScore(ref, description, categoryRank < 0 ? 9 : categoryRank),
      });
    }

    scored.sort((a, b) => b.score - a.score);

    const now = new Date();
    const citations: VerifiedCitation[] = [];
    for (const { ref, check } of scored) {
      // One row per statute so the panel does not show the same act five
      // times with different section numbers stacked on top of each other.
      const key = ref.law_name.toLowerCase().slice(0, 60);
      if (seenLaw.has(key)) continue;
      seenLaw.add(key);

      citations.push({
        id: ref.id,
        lawName: ref.law_name,
        section: ref.section,
        meaning: toMeaning(ref.summary),
        sourceUrl: ref.source_url!,
        sourceHost: check.hostname ?? '',
        authorityDomain: check.matched_domain ?? '',
        escalationBody: ref.escalation_body,
        strength: ref.strength,
        category: ref.category,
        verifiedDaysAgo: verifiedDaysAgo(ref.last_verified, now),
        figuresUnderReview: (ref.verification_status ?? '').toLowerCase() === 'needs_review',
      });
      if (citations.length >= limit) break;
    }

    return { citations, droppedNonAuthority: dropped };
  } catch {
    return { citations: [], droppedNonAuthority: 0 };
  }
}
