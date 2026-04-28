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

  // ─── Rail delay (Delay Repay 15 / NRCoT) ───────────────────────────────────
  {
    id: 'rail_delay',
    matches: (ctx) =>
      /\b(train|rail|tfl\b|delay\s*repay|nrcot|national\s*rail|avanti|lner|gwr|northern|transpennine|scotrail|southeastern|south\s*western|thameslink|gtr|greater\s*anglia|crosscountry)\b/.test(ctx.text)
      &&
      /\b(delay(?:ed)?|cancel(?:l?ed)?|late|missed\s*connection|strike|disruption|refund)\b/.test(ctx.text),
    required: [
      {
        label: 'National Rail Conditions of Travel (NRCoT)',
        matchTokens: ['national rail conditions', 'nrcot', 'conditions of travel'],
        rationale:
          'Governing contract for rail journeys — rights to alternative travel, refunds, and accommodation when service fails.',
      },
      {
        label: 'UK Rail Passengers\' Rights and Obligations Regulation 2021/782, Article 17',
        matchTokens: ['rail passengers', '2021/782', 'article 17', 'passenger rights regulation'],
        rationale:
          '25% refund for 60+ minute delay, 50% for 120+ minute delay (where Delay Repay 15 isn\'t in operation).',
      },
      {
        label: 'Delay Repay scheme (operator-specific)',
        matchTokens: ['delay repay', 'dr15', 'delay-repay'],
        rationale:
          'Most TOCs run Delay Repay 15 — compensation from 15 minutes of delay onwards. Use the operator\'s published rate.',
      },
    ],
  },

  // ─── Insurance claim decline / FCA fair-value ──────────────────────────────
  {
    id: 'insurance_claim_decline',
    matches: (ctx) =>
      /\b(insurance|insurer|policy|underwriter|claim|policyholder)\b/.test(ctx.text)
      &&
      /\b(declin(?:e|ed)|reject(?:ed)?|refused|wrongful|denied|under-?paid|low-?balled|partial\s*settlement|assessor)\b/.test(ctx.text),
    required: [
      {
        label: 'Consumer Insurance (Disclosure and Representations) Act 2012',
        matchTokens: ['cidra 2012', 'consumer insurance', 'disclosure and representations'],
        rationale:
          'Limits insurers\' rights to refuse claims for non-disclosure to deliberate / reckless misrepresentation.',
      },
      {
        label: 'FCA Handbook ICOBS / Consumer Duty (PRIN 2A)',
        matchTokens: ['fca handbook', 'icobs', 'consumer duty', 'prin 2a'],
        rationale:
          'Insurer must treat customers fairly, deliver good outcomes, and provide fair value (FCA pricing rules).',
      },
      {
        label: 'Financial Ombudsman Service — 8-week final response right',
        matchTokens: ['financial ombudsman', 'fos', '8-week', 'final response'],
        rationale:
          'Customer can refer to FOS after 8 weeks or final-response letter; FOS uphold rate is the relevant benchmark.',
      },
    ],
  },

  // ─── Parking PCN appeal ────────────────────────────────────────────────────
  {
    id: 'parking_pcn_appeal',
    matches: (ctx) =>
      /\b(parking|pcn|penalty\s*charge|civil\s*enforcement|popla|parkingeye|euro\s*car\s*parks|bpa|ipc)\b/.test(ctx.text),
    required: [
      {
        label: 'Protection of Freedoms Act 2012, Schedule 4 (private parking)',
        matchTokens: ['protection of freedoms act', 'pofa 2012', 'schedule 4'],
        rationale:
          'Statutory framework for private parking charges, keeper liability, signage and notice requirements.',
      },
      {
        label: 'BPA / IPC Code of Practice + POPLA appeal rights',
        matchTokens: ['bpa code', 'ipc code', 'popla', 'code of practice'],
        rationale:
          'Industry codes governing signage adequacy, grace periods, and the independent appeal route.',
      },
    ],
  },

  // ─── Council tax band challenge ────────────────────────────────────────────
  {
    id: 'council_tax_band',
    matches: (ctx) =>
      /\b(council\s*tax|valuation\s*office|voa|band\s*[a-h]\b|liability)\b/.test(ctx.text),
    required: [
      {
        label: 'Local Government Finance Act 1992',
        matchTokens: ['local government finance act 1992', 'lgfa 1992'],
        rationale: 'Primary statute governing council tax bandings, exemptions and discounts.',
      },
      {
        label: 'Council Tax (Exempt Dwellings) Order 1992 / Discounts',
        matchTokens: ['council tax', 'exempt dwellings', 'discount'],
        rationale:
          'Specific exemption / discount entitlements (single-person discount, severe mental impairment, student exemption etc.).',
      },
    ],
  },

  // ─── Gym membership cancellation / DMCCA ───────────────────────────────────
  {
    id: 'gym_cancellation',
    matches: (ctx) =>
      /\b(gym|fitness|puregym|the\s*gym\s*group|anytime\s*fitness|david\s*lloyd|virgin\s*active)\b/.test(ctx.text)
      &&
      /\b(cancel|cancellation|membership|lock-?in|exit|injur|unable\s*to\s*use|moved|relocat)\b/.test(ctx.text),
    required: [
      {
        label: 'Consumer Rights Act 2015, Part 2 s.62 (unfair contract terms)',
        matchTokens: ['consumer rights act 2015', 's.62', 'section 62', 'cra 2015'],
        rationale:
          'Lock-in clauses and cancellation penalties may be unfair under the CMA\'s 2014 gym-contracts undertaking.',
      },
      {
        label: 'Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013',
        matchTokens: ['consumer contracts', 'ccr 2013', 'cancellation and additional charges'],
        rationale:
          '14-day cooling-off for online sign-ups; auto-renewal disclosure rules.',
      },
      {
        label: 'CMA undertakings on gym contracts (2014) + DMCCA 2024 subscription regime',
        matchTokens: ['cma', 'gym contract', 'dmcca 2024', 'digital markets, competition'],
        rationale:
          'CMA 2014 undertakings established what fair gym contracts look like; DMCCA 2024 strengthens auto-renewal disclosure.',
      },
    ],
  },

  // ─── HMRC tax rebate / dispute ─────────────────────────────────────────────
  {
    id: 'hmrc_dispute',
    matches: (ctx) =>
      /\b(hmrc|tax\s*(rebate|refund|return)|paye|self[\s-]?assessment|coding\s*notice|tax\s*credits?)\b/.test(ctx.text),
    required: [
      {
        label: 'Taxes Management Act 1970, section 33 (overpayment relief)',
        matchTokens: ['taxes management act', 'tma 1970', 'section 33', 's.33'],
        rationale:
          '4-year window for overpayment relief claims against HMRC.',
      },
      {
        label: 'HMRC Charter (statutory — Finance Act 2009 s.92)',
        matchTokens: ['hmrc charter', 'finance act 2009', 'taxpayer charter'],
        rationale:
          'Statutory standards HMRC must meet — fair treatment, accurate information, prompt response.',
      },
    ],
  },

  // ─── DVLA dispute (vehicle keeper / late licensing) ────────────────────────
  {
    id: 'dvla_dispute',
    matches: (ctx) =>
      /\b(dvla|vehicle\s*excise|car\s*tax|driving\s*licence|sorn|v5|keeper|enforcement\s*action)\b/.test(ctx.text),
    required: [
      {
        label: 'Vehicle Excise and Registration Act 1994',
        matchTokens: ['vehicle excise', 'vera 1994', 'registration act 1994'],
        rationale: 'Primary statute for vehicle licensing, SORN, and DVLA enforcement.',
      },
      {
        label: 'DVLA appeals process / mitigation',
        matchTokens: ['dvla', 'appeal', 'mitigation', 'representations'],
        rationale:
          'Right to make representations against late licensing penalties before they become court-enforceable.',
      },
    ],
  },

  // ─── NHS complaint ─────────────────────────────────────────────────────────
  {
    id: 'nhs_complaint',
    matches: (ctx) =>
      /\b(nhs|hospital|gp\b|doctor\s*surgery|clinical|patient)\b/.test(ctx.text)
      &&
      /\b(complain|complaint|negligen|malpractice|mistreat|delayed\s*(diagnos|treatment))\b/.test(ctx.text),
    required: [
      {
        label: 'NHS Complaints Procedure (Local Authority Social Services and NHS Complaints Regulations 2009)',
        matchTokens: ['nhs complaints', '2009 regulations', 'complaints procedure'],
        rationale:
          'Two-stage statutory NHS complaints process — local resolution then Parliamentary and Health Service Ombudsman.',
      },
      {
        label: 'Parliamentary and Health Service Ombudsman (PHSO)',
        matchTokens: ['parliamentary and health service ombudsman', 'phso', 'health ombudsman'],
        rationale:
          'Final escalation route for unresolved NHS complaints.',
      },
    ],
  },

  // ─── Energy: tariff / billing dispute generally (broader than back-billing)
  {
    id: 'energy_billing_general',
    matches: (ctx) =>
      /\b(energy|gas|electric(?:ity)?|ofgem|smart\s*meter|british\s*gas|octopus|edf|ovo|e\.?on|sse\b|scottish\s*power|utilita)\b/.test(ctx.text)
      &&
      /\b(bill|tariff|price\s*rise|estimat|reading|standing\s*charge|debt|disconnect|prepayment)\b/.test(ctx.text)
      &&
      // Don't double-fire with energy_back_billing — let the back-billing rule
      // handle that specific scenario via its tighter trigger.
      !/\b(back-?bill|year(?:s)?\s*ago|usage\s*from\s*\d{4})\b/.test(ctx.text),
    required: [
      {
        label: 'Ofgem Standards of Conduct (SLC 0)',
        matchTokens: ['ofgem standards of conduct', 'slc 0', 'standard licence condition 0'],
        rationale:
          'Suppliers must treat customers fairly, provide clear/accurate information and not engage in misleading practices.',
      },
      {
        label: 'Ofgem Supply Licence Condition 23 (price rise notice)',
        matchTokens: ['slc 23', 'licence condition 23', 'price rise notice'],
        rationale:
          '30-day written notice before price increases; otherwise customer can switch penalty-free.',
      },
      {
        label: 'Energy Ombudsman — 8-week escalation right',
        matchTokens: ['energy ombudsman', '8-week', 'deadlock'],
        rationale:
          'Customer can refer to Energy Ombudsman after 8 weeks or deadlock letter.',
      },
    ],
  },

  // ─── Faulty goods / not as described ───────────────────────────────────────
  {
    id: 'faulty_goods',
    matches: (ctx) =>
      /\b(faulty|broken|damag(?:ed|e)|not\s*as\s*described|defect|wrong\s*item|missing\s*part|sub[- ]?standard|unfit\s*for\s*purpose|don't\s*work|stopped\s*working)\b/.test(ctx.text)
      &&
      /\b(bought|purchased|ordered|delivery|delivered|item|product|goods|warranty)\b/.test(ctx.text),
    required: [
      {
        label: 'Consumer Rights Act 2015, s.9 (satisfactory quality)',
        matchTokens: ['consumer rights act 2015', 's.9', 'section 9', 'satisfactory quality'],
        rationale: 'Goods must be of satisfactory quality.',
      },
      {
        label: 'Consumer Rights Act 2015, s.19 (right to reject / repair / replace)',
        matchTokens: ['s.19', 'section 19', 'right to reject', '30-day'],
        rationale:
          '30-day right to reject for full refund; right to repair/replace within 6 months.',
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
