/**
 * Citation guarantee — deterministic post-validation of letter output.
 *
 * The complaint engine's prompt does its best to ground replies in the
 * verified legal_references it's given, but a single LLM call can still
 * miss a statute that's clearly applicable. Paul's Nuki letter cited
 * only CRA 2015 s.62 when Payment Services Regs 2017 reg 76 was the
 * strongest ground available.
 *
 * This module fixes that by introducing a hard requirement layer:
 *
 *   1. Map the scenario to a list of REQUIRED citations the engine
 *      MUST include for that scenario type. The list is deterministic
 *      and lives in code — not at the model's discretion.
 *
 *   2. After generation, check the model's `legalReferences` array
 *      against the required list (token-fuzzy match — "Section 75" /
 *      "s.75" / "s.75 CCA" all count).
 *
 *   3. If anything required is missing, return a directive instructing
 *      the caller to retry the engine with explicit "you MUST cite
 *      these references in addition to anything else relevant" text
 *      injected into the prompt.
 *
 *   4. Caller retries up to once. Final output ALWAYS carries the
 *      required citations verbatim in `legalReferences` (the engine
 *      may also have its own additions).
 *
 * Why hard-coded and not model-driven: the same scenario type produces
 * the same legal answer every time. CRA 2015, PSR 2017 reg 76, CCR
 * 2013 are the right citations for unauthorised PayPal renewals
 * regardless of which model we route through. Trusting the LLM to
 * pick correctly is the failure mode we just hit.
 *
 * Note: this layer ONLY enforces minimum citation BREADTH. It does
 * not constrain what else the model cites — it can layer on case
 * authorities, sector-specific regs, or peripheral statutes as long
 * as the must-cite set is included.
 */

export interface ScenarioContext {
  /** issueDescription + companyName + desiredOutcome concatenated lower-case. */
  text: string;
  /** issue_type / letterType from the request. */
  letterType?: string;
}

export interface RequiredCitation {
  /** Display string the engine MUST output verbatim or a recognisable variant of. */
  label: string;
  /** Tokens used for fuzzy matching against the model's legalReferences. */
  matchTokens: string[];
  /** One-line WHY for the regenerate instruction. */
  rationale: string;
}

export interface GuaranteeRule {
  /** Stable id for logging / metrics. */
  id: string;
  /** Predicate — does this scenario trigger the rule? */
  matches(ctx: ScenarioContext): boolean;
  /** Citations the engine MUST include when the predicate matches. */
  required: RequiredCitation[];
}

// -----------------------------------------------------------------------------
// Rule library — covers the scenario types the consumer engine produces
// most often. New rules go here, not in the prompt.
//
// Ordered by specificity: payment / subscription / sector-specific BEFORE
// general consumer law, because scenarios trigger multiple rules and we
// want the most pointed citations first.
// -----------------------------------------------------------------------------

export const GUARANTEE_RULES: GuaranteeRule[] = [
  // ─── Unauthorised payment / auto-renewal / subscription trap ───────────────
  // Triggered by Paul's Nuki case: "took £69 via PayPal for a service I had
  // cancelled". MUST cite PSR 2017 reg 76, CCR 2013 reg 29-38, CRA 2015 s.62
  // and the CPR 2008 misleading-omissions reg.
  {
    id: 'unauthorised_payment_subscription',
    matches: (ctx) =>
      // payment instrument signal
      /\b(paypal|klarna|clearpay|credit\s*card|debit\s*card|direct\s*debit|standing\s*order|bnpl)\b/.test(ctx.text)
      &&
      // unauthorised / cancelled-but-still-billed signal
      /\b(unauthori[sz]ed|never\s*agreed|did\s*not\s*authori[sz]e|already\s*cancel(?:l?ed)?|no\s*notice|without\s*(my\s*)?(consent|authori[sz]ation|warning)|automatic\s*(renew(?:al)?|charge|payment)|recurring\s*(charge|payment)|subscription\s*(trap|renewal|reactivat))\b/.test(ctx.text),
    required: [
      {
        label: 'Payment Services Regulations 2017, regulation 76',
        matchTokens: ['payment services regulations 2017', 'psr 2017', 'reg 76', 'regulation 76'],
        rationale:
          'Strongest ground for an unauthorised payment — the customer can demand an immediate refund directly from their payment service provider (PayPal, bank).',
      },
      {
        label: 'Consumer Rights Act 2015, Part 2, s.62 (unfair terms)',
        matchTokens: ['consumer rights act 2015', 'cra 2015', 's.62', 'section 62', 'part 2'],
        rationale:
          'Any term purporting to allow a charge after cancellation creates a significant imbalance and is not binding.',
      },
      {
        label:
          'Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013',
        matchTokens: [
          'consumer contracts',
          'ccr 2013',
          'cancellation and additional charges',
          'reg 29',
          'reg 30',
        ],
        rationale:
          'Subscription auto-renewal must be expressly disclosed and consented to; covers the 14-day cooling-off and additional-charges regime.',
      },
      {
        label: 'Consumer Protection from Unfair Trading Regulations 2008, regulation 6',
        matchTokens: ['unfair trading', 'cpr 2008', 'regulation 6', 'reg 6', 'misleading omission'],
        rationale:
          'Failure to disclose an upcoming auto-renewal charge is a misleading omission under the CPRs.',
      },
    ],
  },

  // ─── Section 75 chargeback (credit card) ───────────────────────────────────
  {
    id: 's75_chargeback',
    matches: (ctx) =>
      /\b(section\s*75|s\.?\s*75|cca\s*1974)\b/.test(ctx.text)
      ||
      (/\b(credit\s*card)\b/.test(ctx.text) && /\b(chargeback|refund|merchant\s*fail|not\s*delivered|damag(?:ed|e))\b/.test(ctx.text)),
    required: [
      {
        label: 'Consumer Credit Act 1974, section 75',
        matchTokens: ['consumer credit act 1974', 'cca 1974', 's.75', 'section 75'],
        rationale:
          'Equal claim against the card issuer for breach of contract by the supplier on credit-card purchases £100–£30,000.',
      },
      {
        label: 'Consumer Rights Act 2015 (goods/services standards)',
        matchTokens: ['consumer rights act 2015', 'cra 2015'],
        rationale: 'Underpins the breach the s.75 claim is founded on.',
      },
    ],
  },

  // ─── Energy back-billing ────────────────────────────────────────────────────
  {
    id: 'energy_back_billing',
    matches: (ctx) =>
      /\b(energy|gas|electric(?:ity)?|ofgem|smart\s*meter|back-?bill|back-?billing|12-?month|three\s*years\s*ago)\b/.test(ctx.text)
      &&
      /\b(back-?bill|old\s*bill|bill\s*from|year(?:s)?\s*ago|billed\s*for\s*usage)\b/.test(ctx.text),
    required: [
      {
        label: 'Ofgem Standard Licence Condition 21BA (back-billing 12-month rule)',
        matchTokens: ['slc 21ba', 'standard licence condition 21', 'back-billing'],
        rationale:
          '12-month limit on back-billing is the controlling rule for any bill covering usage older than that.',
      },
      {
        label: 'Consumer Rights Act 2015, s.49',
        matchTokens: ['consumer rights act 2015', 's.49', 'section 49'],
        rationale: 'Services performed without reasonable care — applies where billing systems failed.',
      },
    ],
  },

  // ─── Flight delay / cancellation (UK261) ───────────────────────────────────
  {
    id: 'flight_delay_uk261',
    matches: (ctx) =>
      /\b(flight|airline|cancel(?:l?ed)?\s*(my\s+)?flight|delay(?:ed)?\s*(my\s+)?flight|ryanair|easyjet|jet2|tui|british\s*airways|wizz|uk261|eu261|cancelled\s*(2|two)\s*hours)\b/.test(ctx.text),
    required: [
      {
        label:
          'UK261 (Regulation (EC) No 261/2004 as retained in UK law)',
        matchTokens: ['uk261', 'eu261', 'regulation 261', '261/2004'],
        rationale:
          'Primary statutory framework for flight delay and cancellation compensation.',
      },
    ],
  },

  // ─── Broadband / mobile mid-contract price rise ────────────────────────────
  {
    id: 'broadband_price_rise',
    matches: (ctx) =>
      /\b(broadband|mobile|sky|virgin\s*media|bt\b|ee\b|vodafone|three\s*uk|talktalk|isp)\b/.test(ctx.text)
      &&
      /\b(mid-?contract|price\s*(rise|increase|hike)|cpi|inflation|exit\s*fee|early\s*termination)\b/.test(ctx.text),
    required: [
      {
        label: 'Ofcom General Conditions, GC C1 (right to exit on material modification)',
        matchTokens: ['general conditions', 'gc c1', 'gc1', 'ofcom'],
        rationale:
          'Customer has a right to exit penalty-free on a material modification to contract terms.',
      },
    ],
  },

  // ─── Broadband / landline total loss of service ────────────────────────────
  // Triggered by Paul's OneStream case: "internet down for 35 days /
  // 17 days / no broadband". MUST cite the Voluntary Automatic
  // Compensation Scheme — the per-day money-bearing rule that providers
  // are bound to. Without this, the engine accepted OneStream's
  // £106.96 partial offer as reasonable when the actual entitlement
  // was £500+ in compensation.
  {
    id: 'broadband_total_loss',
    matches: (ctx) =>
      /\b(broadband|landline|internet|fibre|phone\s*line|onestream|bt\b|ee\b|sky|virgin\s*media|vodafone|talktalk|plusnet|hyperoptic|community\s*fibre|three\s*uk)\b/.test(ctx.text)
      &&
      /\b(no\s*(broadband|internet|service|connection)|service\s*(down|outage|loss|interrupt|fault)|total\s*loss|complete\s*(outage|loss)|without\s*(internet|broadband|service)|(\d+)\s*days?\s*(without|down|no\s*service)|outage|missed\s*appointment|engineer\s*(no.?show|missed|didn't\s*turn\s*up)|delayed\s*(start|installation|activation))\b/.test(ctx.text),
    required: [
      {
        label: 'Ofcom Voluntary Automatic Compensation Scheme (GC C3.13)',
        matchTokens: ['automatic compensation scheme', 'auto-compensation', 'gc c3', 'voluntary automatic'],
        rationale:
          'Per-day compensation for total loss / delayed start / missed appointments at the rates currently published by Ofcom (£10.07/day total loss as at April 2026). Most major UK ISPs are in the scheme. Any provider offer below the per-day rate is non-compliant. THIS IS THE PRIMARY MONEY-BEARING RULE FOR LOSS-OF-SERVICE DISPUTES.',
      },
      {
        label: 'Consumer Rights Act 2015, s.49 (services — reasonable care and skill)',
        matchTokens: ['consumer rights act 2015', 'cra 2015', 's.49', 'section 49'],
        rationale:
          'Substantial / repeated service failure entitles the customer to a price reduction (s.55) on top of the Auto-Compensation per-day rate.',
      },
      {
        label: 'Ofcom General Conditions, GC C1 (refund of unused service)',
        matchTokens: ['general conditions', 'gc c1', 'ofcom'],
        rationale:
          'Customer is entitled to a refund of the monthly charges for the period of total loss — separate from and IN ADDITION TO the per-day Auto-Compensation. Providers often offer one OR the other; the rules require both.',
      },
    ],
  },

  // ─── Statute-barred debt ───────────────────────────────────────────────────
  {
    id: 'statute_barred_debt',
    matches: (ctx) =>
      /\b(statute\s*barred|6\s*years?|debt\s*(claim|collection)|lowell|cabot|intrum|bailiff)\b/.test(ctx.text),
    required: [
      {
        label: 'Limitation Act 1980, section 5',
        matchTokens: ['limitation act 1980', 's.5 limitation', 'statute barred', 'section 5'],
        rationale: '6-year limitation on simple contract debts in England and Wales.',
      },
      {
        label: 'Consumer Credit Act 1974, sections 77–79 (information requests)',
        matchTokens: ['cca 1974', 'consumer credit act', 's.77', 's.78', 's.79', 'section 77', 'section 78'],
        rationale:
          'Right to demand a true copy of the credit agreement; debt unenforceable until produced.',
      },
    ],
  },
];

// -----------------------------------------------------------------------------
// Validator
// -----------------------------------------------------------------------------

export interface CitationCheckResult {
  /** Engine output passes — every required citation is present. */
  passed: boolean;
  /** Rules that triggered for this scenario. */
  triggeredRuleIds: string[];
  /** Citations the engine MUST include but didn't. */
  missing: RequiredCitation[];
  /** Re-prompt instruction the caller can append to user prompt on retry. */
  retryInstruction: string | null;
}

function citationMatches(modelCitation: string, tokens: string[]): boolean {
  const haystack = modelCitation.toLowerCase();
  // ANY token match counts — citations are usually one statute name plus a
  // section. We treat the citation as satisfied if any of the rule's
  // recognition tokens appear in the model's string.
  return tokens.some((t) => haystack.includes(t.toLowerCase()));
}

/**
 * Check whether the model's `legalReferences` array satisfies all required
 * citations triggered by the scenario.
 */
export function checkCitations(
  ctx: ScenarioContext,
  modelCitations: string[],
): CitationCheckResult {
  const triggered = GUARANTEE_RULES.filter((r) => r.matches(ctx));
  if (triggered.length === 0) {
    return { passed: true, triggeredRuleIds: [], missing: [], retryInstruction: null };
  }

  // Flatten every required citation across triggered rules; dedupe by label.
  const seen = new Set<string>();
  const required: RequiredCitation[] = [];
  for (const rule of triggered) {
    for (const cite of rule.required) {
      if (!seen.has(cite.label)) {
        seen.add(cite.label);
        required.push(cite);
      }
    }
  }

  const missing = required.filter(
    (c) => !modelCitations.some((m) => citationMatches(m, c.matchTokens)),
  );

  if (missing.length === 0) {
    return {
      passed: true,
      triggeredRuleIds: triggered.map((r) => r.id),
      missing: [],
      retryInstruction: null,
    };
  }

  const retryInstruction =
    `\n\nMANDATORY CITATION REQUIREMENT (regenerate to comply):\n` +
    `Your previous draft was missing ${missing.length} required UK statute reference${missing.length === 1 ? '' : 's'}. ` +
    `For this type of scenario, the following citations MUST appear in the letter and in the legalReferences array, in addition to anything else you cite:\n` +
    missing
      .map((m, i) => `  ${i + 1}. ${m.label} — ${m.rationale}`)
      .join('\n') +
    `\n\nWeave each into the prose naturally; do not list them as a "Legal basis" header. The letter must read as a coherent piece of correspondence with these grounds woven through, not a citation dump.`;

  return {
    passed: false,
    triggeredRuleIds: triggered.map((r) => r.id),
    missing,
    retryInstruction,
  };
}
