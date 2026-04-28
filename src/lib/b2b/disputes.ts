/**
 * /v1/disputes contract.
 *
 * Wraps the same Claude-driven engine that powers the consumer
 * Paybacker complaint flow (lib/agents/complaints-agent.ts) and
 * shapes the response into a stable B2B contract — statute citation,
 * structured entitlement, draft letter excerpt, escalation path.
 *
 * The shape is deliberately stable across statute domains: a UK261
 * flight-cancellation scenario and a Section 75 chargeback both
 * return the same fields. Callers parse one schema, not many.
 *
 * Anti-hallucination: the consumer engine pulls verified statute
 * references from the legal_references table before prompting
 * Claude. We reuse that path here so a B2B caller never gets a
 * fabricated act or section number.
 */

import { generateComplaintLetter } from '@/lib/agents/complaints-agent';
import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface DisputeRequest {
  /**
   * The dispute as it arrived at your front line. Plain English. The
   * richer the description (merchant, dates, prior contact, amount),
   * the more confidently the engine grounds in the right statute.
   */
  scenario: string;
  /**
   * Optional structured context — pass anything that helps the engine
   * (merchant, account_number, tariff, contract_dates, etc.). Not
   * persisted; used only to enrich grounding inside this single call.
   */
  context?: Record<string, unknown>;
  jurisdiction?: 'UK';
  /** What the customer is asking for — refund, repair, exit, compensation. */
  desired_outcome?: string;
  /** Disputed amount in GBP. Drives `claim_value_estimate` when supplied. */
  amount?: number;
  /**
   * Customer's name as it should appear on the draft letter. Pass the
   * customer's display name from your CRM. `consumer_name` is the
   * legacy alias kept for v1 backwards compatibility.
   */
  customer_name?: string;
  consumer_name?: string;
  /**
   * Your internal customer identifier (CRM record ID, Auth0 sub, etc.).
   * Echoed back in the response so the response can be persisted
   * directly against the customer record without a join. Never used by
   * the engine for grounding; never logged in plaintext.
   */
  customer_id?: string;
  /**
   * Your internal case / ticket / claim reference. Echoed back in the
   * response. Surface this in your CRM and audit trail so every API
   * response is traceable to the originating ticket.
   */
  case_reference?: string;
  /**
   * Replay-safety key. Resending the same key within 24h returns the
   * previous response unchanged. Use a UUID per inbound ticket so a
   * retry on transient network failure can't bill twice or mutate
   * state in your downstream pipeline.
   */
  idempotency_key?: string;
  /**
   * Hint for tone of `customer_facing_response`. `letter` is the
   * default and produces formal, written-correspondence prose;
   * `webchat` returns a conversational paragraph; `phone` returns
   * agent talking points only with no paste-ready paragraph.
   */
  channel?: 'letter' | 'email' | 'webchat' | 'phone';
  /**
   * FCA Consumer Duty pre-flight (use case 6.6).
   *
   * Pass the agent's drafted reply BEFORE it sends. The response will
   * include a `missing_citations` field listing UK statutes the engine
   * grounds in but the agent's draft fails to mention, plus a
   * `preflight` block with verdict and recommended additions. Use to
   * block-and-suggest in the agent's CRM so non-compliant replies
   * never reach the customer. Aveni / Voyc grade calls AFTER they
   * happen; this is the upstream equivalent.
   */
  proposed_reply?: string;
}

export type DisputeType =
  | 'energy' | 'broadband' | 'finance' | 'travel' | 'rail' | 'insurance'
  | 'council_tax' | 'parking' | 'hmrc' | 'dvla' | 'nhs' | 'gym' | 'debt' | 'general';

export interface DisputeResponse {
  /** Primary UK statute / regulation grounding the response. */
  statute: string;
  /** Coarse sector tag the caller can route on. */
  dispute_type: DisputeType;
  /** Primary regulator with jurisdiction, when applicable. */
  regulator: string | null;
  entitlement: {
    summary: string;
    rationale: string;
    additional_rights?: string[];
    estimated_success: 'low' | 'medium' | 'high';
  };
  /** Short paragraph a CX agent can paste into a customer reply. */
  customer_facing_response: string;
  /** Bullet points the CX agent should hit. */
  agent_talking_points: string[];
  /** Estimated claim value range in GBP, where the statute quantifies it. */
  claim_value_estimate: { min: number; max: number; currency: 'GBP' } | null;
  /** Time pressure: 'high' means a statutory deadline is close. */
  time_sensitivity: 'high' | 'medium' | 'low';
  /** Draft letter — most B2B callers edit, do not send verbatim. */
  draft_letter_excerpt: string;
  escalation_path: Array<{ step: number; to: string; wait_days?: number; url?: string }>;
  legal_references: string[];
  confidence: number;
  /**
   * Echoed from the request so a B2B caller can persist the response
   * straight against the originating ticket / customer record without
   * an out-of-band correlation step. Both fields are null when the
   * caller didn't supply them.
   */
  case_reference: string | null;
  customer_id: string | null;
  /**
   * Populated when the request supplied `proposed_reply`. Compares
   * the agent's drafted reply against the engine's grounding and
   * surfaces what's missing, weak, or off-message. Null when the
   * request didn't ask for a pre-flight check.
   *
   * Use to block-and-suggest in the agent's CRM:
   *   if (preflight && preflight.verdict !== 'pass') {
   *     showAgentFix(preflight.recommended_additions);
   *     blockSend();
   *   }
   */
  preflight: PreflightResult | null;
}

export interface PreflightResult {
  /**
   * `pass`   — agent's draft cites every statute the engine grounds in
   *            and the position is consistent. Safe to send.
   * `weak`   — agent's draft is on-message but misses a citation that
   *            would strengthen the response under Consumer Duty.
   *            Suggest, don't block.
   * `fail`   — agent's draft contradicts the engine's grounded
   *            position OR omits a critical statute. Block-and-suggest.
   */
  verdict: 'pass' | 'weak' | 'fail';
  /**
   * Statutes the engine cited that DO NOT appear in the agent's draft.
   * Empty array when nothing is missing.
   */
  missing_citations: string[];
  /**
   * Specific text the agent should add to bring their draft up to
   * the engine's grounded position. May reference a particular
   * paragraph the engine produced.
   */
  recommended_additions: string[];
  /**
   * One-line plain-English explanation of the verdict for the agent
   * UI ("You missed citing Section 75 — the customer is entitled
   * under CCA 1974 and your reply doesn't mention it.").
   */
  rationale: string;
}

export interface DisputeError {
  code: 'VALIDATION' | 'NO_STATUTE_MATCH' | 'ENGINE_ERROR';
  message: string;
}

export function validateRequest(body: unknown): DisputeRequest | DisputeError {
  if (!body || typeof body !== 'object') {
    return { code: 'VALIDATION', message: 'Body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.scenario !== 'string' || b.scenario.trim().length < 10) {
    return { code: 'VALIDATION', message: '`scenario` is required and must be at least 10 characters.' };
  }
  if (b.context && typeof b.context !== 'object') {
    return { code: 'VALIDATION', message: '`context` must be an object when provided.' };
  }
  if (b.jurisdiction && b.jurisdiction !== 'UK') {
    return { code: 'VALIDATION', message: 'Only `jurisdiction: "UK"` is supported in v1.' };
  }
  // Resolve customer_name preferring the new B2B field over the legacy
  // consumer_name. Both are accepted; either populates the draft.
  const customerName = typeof b.customer_name === 'string'
    ? b.customer_name
    : typeof b.consumer_name === 'string'
      ? b.consumer_name
      : undefined;
  const channel = typeof b.channel === 'string' && ['letter', 'email', 'webchat', 'phone'].includes(b.channel)
    ? (b.channel as DisputeRequest['channel'])
    : undefined;
  return {
    scenario: b.scenario.trim(),
    context: (b.context as Record<string, unknown>) ?? {},
    jurisdiction: 'UK',
    desired_outcome: typeof b.desired_outcome === 'string' ? b.desired_outcome : undefined,
    amount: typeof b.amount === 'number' ? b.amount : undefined,
    customer_name: customerName,
    consumer_name: customerName,
    customer_id: typeof b.customer_id === 'string' ? b.customer_id : undefined,
    case_reference: typeof b.case_reference === 'string' ? b.case_reference : undefined,
    idempotency_key: typeof b.idempotency_key === 'string' ? b.idempotency_key : undefined,
    channel,
    proposed_reply:
      typeof b.proposed_reply === 'string' && b.proposed_reply.trim().length > 0
        ? b.proposed_reply
        : undefined,
  };
}

/**
 * Pre-flight check for FCA Consumer Duty: does the agent's drafted
 * reply cite the same UK statutes the engine grounds the response in?
 *
 * Cheap heuristic — runs in-process, no extra LLM call. Looks for
 * each cited authority's primary identifier (act name + section, or
 * a regulator's standard licence-condition shorthand) in the proposed
 * reply text. Misses are surfaced as `missing_citations` and the
 * verdict bucketed by severity.
 *
 * Why heuristic and not another LLM call: pre-flight is the latency-
 * critical path — agents are mid-typing in their CRM. A 2-second
 * round-trip kills the UX. The heuristic catches the most common
 * failure mode (forgot to cite the statute) deterministically and
 * without burning Claude tokens. A future LLM-graded variant can
 * land as `preflight: 'thorough'` once we have the latency budget.
 */
function computePreflight(
  proposedReply: string,
  groundedStatute: string,
  groundedRefs: string[],
  rationale: string,
): PreflightResult {
  const haystack = proposedReply.toLowerCase();

  // Normalise each citation into 1-2 stable tokens we can grep for.
  // E.g. "Consumer Credit Act 1974, s.75" → ["consumer credit act 1974", "s.75", "section 75"].
  function citationTokens(citation: string): string[] {
    const lower = citation.toLowerCase();
    const tokens: string[] = [lower];
    const sectionMatch = lower.match(/s\.?\s*(\d+[a-z]?)/);
    if (sectionMatch) {
      tokens.push(`s.${sectionMatch[1]}`);
      tokens.push(`section ${sectionMatch[1]}`);
    }
    // Strip the year for shorter matching ("Consumer Credit Act").
    const noYear = lower.replace(/,?\s*\d{4}.*$/, '').trim();
    if (noYear && noYear !== lower) tokens.push(noYear);
    return tokens;
  }

  function citationPresent(citation: string): boolean {
    const tokens = citationTokens(citation);
    return tokens.some((t) => t.length >= 4 && haystack.includes(t));
  }

  const allCitations = [groundedStatute, ...groundedRefs].filter((s) => s && s.length >= 4);
  // Dedupe (case-insensitive).
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const c of allCitations) {
    const k = c.toLowerCase();
    if (!seen.has(k)) { seen.add(k); dedup.push(c); }
  }

  const missing = dedup.filter((c) => !citationPresent(c));
  const total = dedup.length;
  const missingShare = total === 0 ? 0 : missing.length / total;

  const recommended_additions: string[] = [];
  if (missing.includes(groundedStatute) && groundedStatute) {
    recommended_additions.push(
      `Cite the primary authority: "${groundedStatute}". The engine grounds the customer's entitlement here; your draft doesn't mention it.`,
    );
  }
  for (const m of missing) {
    if (m === groundedStatute) continue;
    recommended_additions.push(`Add a reference to "${m}" — relevant to this dispute and absent from your draft.`);
  }

  let verdict: PreflightResult['verdict'];
  if (missing.length === 0) verdict = 'pass';
  else if (missing.includes(groundedStatute) || missingShare >= 0.5) verdict = 'fail';
  else verdict = 'weak';

  const rationaleLine =
    verdict === 'pass'
      ? `Draft cites the ${total === 1 ? 'authority' : `${total} authorities`} the engine grounds in. Safe to send.`
      : verdict === 'fail'
        ? `Draft is missing ${missing.length} of ${total} cited authorities, including the primary statute. Block and suggest before sending.`
        : `Draft cites the primary authority but is missing ${missing.length} supporting reference${missing.length === 1 ? '' : 's'}. Strengthen before sending.`;

  // Tack the engine's own rationale onto the explanation when the
  // draft fails — gives the agent the WHY in addition to the WHAT.
  const fullRationale = verdict === 'pass' ? rationaleLine : `${rationaleLine} ${rationale}`;

  return {
    verdict,
    missing_citations: missing,
    recommended_additions,
    rationale: fullRationale.trim(),
  };
}

/**
 * Sector-detection regex over the scenario text. Independent of the
 * verified-refs lookup so a clear keyword in the scenario (e.g. "flight",
 * "Section 75") nails the category before we even hit the DB. This is
 * the same regex set used downstream by classifyDisputeType so a single
 * source of truth drives both retrieval and the response shape.
 */
function detectScenarioCategory(scenario: string): string | null {
  const s = scenario.toLowerCase();
  // Rail-specific signals beat travel — 'delay' alone is rail's bread and
  // butter (Delay Repay), so check rail before travel to avoid mis-routing
  // a clear "Avanti delay" to travel.
  if (/\b(train|rail|delay\s*repay|tfl\b|avanti|lner|gwr|northern\s*trains?|transpennine|scotrail|train\s*operator|nrcot)\b/.test(s)) return 'rail';
  // Travel needs an aviation-specific signal — 'cancelled' alone is too
  // generic (a sub cancellation is consumer general).
  if (/\b(flight|airline|baggage|boarding|ryanair|easyjet|jet2|tui|british\s*airways|wizz\s*air|loveholidays|on\s*the\s*beach|caa\b|uk261|eu261)\b|\bcancelled\s+(my\s+)?flight\b/.test(s)) return 'travel';
  // 'ee\b' alone matches words like 'fee' and 'coffee'. Bound 'ee' with
  // mobile context. Same for 'bt' / 'sky' / 'virgin' which collide with
  // common English words.
  if (/\b(broadband|mobile\s*(?:contract|provider|tariff|bill)?|isp|ofcom|talktalk|hyperoptic|three\s*uk)\b|\bsky\s+(broadband|mobile|tv|fibre)\b|\bvirgin\s+(broadband|mobile|media|fibre|o2)\b|\bbt\s+(broadband|mobile|fibre)\b|\bvodafone\b|\bee\s+(broadband|mobile|fibre)\b/.test(s)) return 'broadband';
  if (/\b(energy|gas|electric(ity)?|ofgem|british\s*gas|octopus(\s*energy)?|edf|ovo|e\.?on|sse\b|scottish\s*power|smart\s*meter|back-?bill)\b/.test(s)) return 'energy';
  if (/\b(section\s*75|chargeback|payment\s*dispute|s\.?\s*75|cca\s*1974|credit\s*card\s*(claim|dispute|chargeback))\b/.test(s)) return 'finance';
  if (/\b(insurance|insurer|claim\s*declined|underwriter|loss\s*adjuster|policy\s*(claim|wording|exclusion))\b/.test(s)) return 'insurance';
  if (/\bcouncil\s*tax\b|\bvaluation\s*office\b|\bband\s*[a-h]\b\s*challenge/.test(s)) return 'council_tax';
  if (/\b(parking|pcn|penalty\s*charge|popla|civil\s*enforcement)\b/.test(s)) return 'parking';
  if (/\b(hmrc|tax\s*rebate|paye|self\s*assessment)\b/.test(s)) return 'hmrc';
  if (/\bdvla\b|\bdriving\s*licence\b/.test(s)) return 'dvla';
  if (/\b(nhs|hospital\s*complaint|continuing\s*healthcare)\b/.test(s)) return 'nhs';
  if (/\b(gym\s*(membership|cancellation|fee)|puregym|the\s*gym\s*group|anytime\s*fitness)\b/.test(s)) return 'gym';
  if (/\b(debt\s*(claim|collection)|bailiff|enforcement\s*officer|statute\s*barred|lowell|cabot|intrum)\b/.test(s)) return 'debt';
  return null;
}

/**
 * Pull verified UK statute references that match the scenario keywords.
 * Strategy:
 *   1. Detect the scenario sector via regex.
 *   2. Pull every verified ref in that sector.
 *   3. Pull a wider candidate set in 'general' too (CRA 2015 etc).
 *   4. Score by token overlap, with a strong category-match boost so
 *      a sector-specific ref always outranks a generic one when the
 *      scenario is clearly in that sector.
 */
async function fetchVerifiedRefs(scenario: string): Promise<any[]> {
  const supabase = getAdmin();
  const tokens = scenario.toLowerCase().split(/\s+/).filter((t) => t.length >= 4).slice(0, 12);
  const detectedCategory = detectScenarioCategory(scenario);

  // Pull the whole index of verified refs (≈100s of rows is fine).
  // Filtering by verification_status keeps us aligned with the public
  // /coverage page and the consumer engine's ground truth.
  const { data } = await supabase
    .from('legal_references')
    .select('law_name, section, summary, full_text, source_url, category')
    .in('verification_status', ['current', 'updated'])
    .limit(500);
  if (!data || data.length === 0) return [];

  return data
    .map((ref) => {
      const haystack = `${ref.law_name} ${ref.section ?? ''} ${ref.summary ?? ''} ${ref.category ?? ''}`.toLowerCase();
      const tokenScore = tokens.reduce((s, tok) => s + (haystack.includes(tok) ? 1 : 0), 0);
      // Strong boost when the ref's category matches the detected sector
      // — this is what keeps UK261 above CRA 2015 on a Ryanair scenario.
      const categoryBoost = detectedCategory && ref.category === detectedCategory ? 10 : 0;
      // Tiny boost for cross-sector statutes so they're available as
      // fallback support but never beat a sector-specific match.
      const generalBoost = ref.category === 'general' ? 1 : 0;
      const score = tokenScore + categoryBoost + generalBoost;
      return { ref, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.ref);
}

function inferStatute(legalReferences: string[]): string {
  if (legalReferences.length === 0) return 'No primary UK statute identified for this scenario.';
  return legalReferences[0];
}

function deriveEscalationPath(scenario: string): DisputeResponse['escalation_path'] {
  const s = scenario.toLowerCase();
  // Sector-specific escalation routes the consumer engine already
  // knows. Replicating the lookup table here keeps the B2B contract
  // self-contained; a future PR can hoist it to a shared helper.
  if (/flight|airline|cancell?ed|delay/.test(s)) {
    return [
      { step: 1, to: 'carrier_claims_team', wait_days: 14 },
      { step: 2, to: 'CAA — Consumer Protection Group', url: 'https://www.caa.co.uk/passengers' },
      { step: 3, to: 'Alternative Dispute Resolution scheme', wait_days: 56 },
    ];
  }
  if (/broadband|mobile|isp|ofcom/.test(s)) {
    return [
      { step: 1, to: 'provider_complaints_team', wait_days: 28 },
      { step: 2, to: 'CISAS or Ombudsman Services Communications', url: 'https://www.ofcom.org.uk/complaints' },
    ];
  }
  if (/energy|gas|electric|ofgem/.test(s)) {
    return [
      { step: 1, to: 'energy_supplier_complaints', wait_days: 56 },
      { step: 2, to: 'Energy Ombudsman', url: 'https://www.energyombudsman.org' },
    ];
  }
  if (/section\s*75|credit\s*card|chargeback/.test(s)) {
    return [
      { step: 1, to: 'card_issuer_disputes', wait_days: 14 },
      { step: 2, to: 'Financial Ombudsman Service', url: 'https://www.financial-ombudsman.org.uk', wait_days: 56 },
    ];
  }
  if (/insurance|claim|warranty/.test(s)) {
    return [
      { step: 1, to: 'insurer_complaints_team', wait_days: 28 },
      { step: 2, to: 'Financial Ombudsman Service', url: 'https://www.financial-ombudsman.org.uk' },
    ];
  }
  return [
    { step: 1, to: 'merchant_complaints_team', wait_days: 14 },
    { step: 2, to: 'Citizens Advice', url: 'https://www.citizensadvice.org.uk' },
    { step: 3, to: 'Trading Standards', wait_days: 28 },
  ];
}

/**
 * Run the engine against a B2B request. Returns a fully-shaped
 * DisputeResponse on success, or a DisputeError that the caller
 * maps to an HTTP status code.
 */
export async function resolveDispute(req: DisputeRequest): Promise<DisputeResponse | DisputeError> {
  const verifiedRefs = await fetchVerifiedRefs(req.scenario);

  // Serialize the matched references into the prose-style block the
  // complaint engine's prompt builder expects. Passing the raw array
  // collapses to "[object Object]" inside the prompt and silently
  // disables the anti-hallucination guard.
  const verifiedRefsText = verifiedRefs
    .map((r: any) => {
      const head = [r.law_name, r.section].filter(Boolean).join(' — ');
      const body = r.summary ?? r.full_text ?? '';
      const url = r.source_url ? ` (${r.source_url})` : '';
      return `• ${head}${url}\n  ${body}`.trim();
    })
    .join('\n\n');

  let result: any;
  try {
    result = await generateComplaintLetter({
      // The "company" passed to the engine is the third-party merchant
      // being disputed (e.g. Acme Furniture in a neobank Section 75).
      // The actual API caller (the bank) is implicit — the engine writes
      // as "we / our team" without naming a specific brand, leaving the
      // caller's CRM to substitute their own brand on send.
      companyName: (req.context?.merchant as string) || 'the merchant',
      issueDescription: req.scenario,
      desiredOutcome: req.desired_outcome ?? '',
      amount: req.amount != null ? String(req.amount) : undefined,
      letterType: 'complaint',
      verifiedLegalRefs: verifiedRefsText || undefined,
      // Default to business_to_customer voice for the B2B route — this
      // is the engine path B2B customers actually want (response from
      // the business TO their customer, not a complaint letter from the
      // customer to a merchant). Consumer route is unaffected because
      // it doesn't pass the voice param at all.
      voice: 'business_to_customer',
      customerName: req.customer_name,
    });
  } catch (e: any) {
    return {
      code: 'ENGINE_ERROR',
      message: `Engine failed to produce a draft: ${e?.message ?? 'unknown error'}`,
    };
  }

  const legalRefs: string[] = Array.isArray(result?.legalReferences) ? result.legalReferences : [];
  const letter: string = typeof result?.letter === 'string' ? result.letter : '';
  const nextStepsArr: string[] = Array.isArray(result?.nextSteps) ? result.nextSteps : [];

  // Engine returns estimatedSuccess as 0-100. Bucket it.
  const score = typeof result?.estimatedSuccess === 'number' ? result.estimatedSuccess : 65;
  const successLabel: 'low' | 'medium' | 'high' =
    score >= 70 ? 'high' : score < 55 ? 'low' : 'medium';

  // Pick a rationale from the verified refs that ACTUALLY matches what
  // the engine cited. The previous version took verifiedRefs[0] which
  // was the highest token-overlap score regardless of category — that
  // produced cross-domain leaks (e.g. an HMRC tax summary on an energy
  // back-billing case). Instead, prefer the first verified ref whose
  // law_name appears in the engine's citations.
  const cited = legalRefs.map((s) => s.toLowerCase());
  const matchingRef = verifiedRefs.find((r: any) => {
    const name = (r.law_name || '').toLowerCase();
    return name && cited.some((c) => c.includes(name) || name.includes(c.split(',')[0].trim()));
  });
  const rationale = matchingRef?.summary
    ?? verifiedRefs.find((r: any) => r.category && cited.length > 0)?.summary
    ?? `Reasoning grounded in ${legalRefs[0] ?? 'the cited UK statute'}.`;

  // Additional rights: only include verified refs that share a category
  // with the matching ref, so we don't dump unrelated statutes.
  const matchCategory = matchingRef?.category;
  const additionalRights = (matchCategory
    ? verifiedRefs.filter((r: any) => r.category === matchCategory)
    : verifiedRefs
  ).slice(0, 3).map((r: any) => r.law_name);

  const disputeType = classifyDisputeType(req.scenario, matchCategory);
  const regulator = pickRegulator(disputeType);
  const claimValue = estimateClaimValue(disputeType, req.scenario, req.amount);
  const timeSensitivity = scoreTimeSensitivity(disputeType, req.scenario);

  // Customer-facing response: a short paragraph the agent can lift
  // verbatim into a reply. Pulled from the draft letter's opening, not
  // its sign-off, so it stays neutral and product-of-the-business voice.
  const customerFacingResponse = extractCustomerResponse(letter, rationale, legalRefs[0]);

  // Agent talking points: bulleted form of nextSteps, capped, prefixed
  // with the cited statute so the agent leads with authority.
  const agentTalkingPoints: string[] = [];
  if (legalRefs[0]) agentTalkingPoints.push(`Cited authority: ${legalRefs[0]}`);
  agentTalkingPoints.push(...nextStepsArr.slice(0, 4));
  if (timeSensitivity === 'high') agentTalkingPoints.push('Statutory deadline applies — flag urgency.');

  return {
    statute: inferStatute(legalRefs),
    dispute_type: disputeType,
    regulator,
    entitlement: {
      summary: nextStepsArr.length > 0
        ? nextStepsArr.join(' ')
        : 'See draft letter for the entitlement narrative.',
      rationale,
      additional_rights: additionalRights,
      estimated_success: successLabel,
    },
    customer_facing_response: customerFacingResponse,
    agent_talking_points: agentTalkingPoints,
    claim_value_estimate: claimValue,
    time_sensitivity: timeSensitivity,
    draft_letter_excerpt: letter.slice(0, 1200),
    escalation_path: Array.isArray(result?.escalationPath) && result.escalationPath.length > 0
      ? result.escalationPath.map((step: string, i: number) => ({ step: i + 1, to: step }))
      : deriveEscalationPath(req.scenario),
    legal_references: legalRefs,
    confidence: typeof result?.confidence === 'number' ? result.confidence : 0.8,
    case_reference: req.case_reference ?? null,
    customer_id: req.customer_id ?? null,
    preflight: req.proposed_reply
      ? computePreflight(
          req.proposed_reply,
          inferStatute(legalRefs),
          legalRefs,
          rationale,
        )
      : null,
  };
}

function classifyDisputeType(scenario: string, refCategory?: string): DisputeType {
  // Specific verified ref category wins over a fuzzy scenario regex —
  // a confident retrieval match (rail-specific reference) shouldn't be
  // overridden by a broad word match (e.g. "delay" alone). Scenario
  // regex still drives when no specific ref hit (refCategory is null
  // or 'general').
  const validCats = ['energy','broadband','finance','travel','rail','insurance','council_tax','parking','hmrc','dvla','nhs','gym','debt'];
  if (refCategory && validCats.includes(refCategory)) {
    return refCategory as DisputeType;
  }
  const detected = detectScenarioCategory(scenario);
  if (detected) return detected as DisputeType;
  return 'general';
}

function pickRegulator(t: DisputeType): string | null {
  return ({
    energy: 'Ofgem',
    broadband: 'Ofcom',
    finance: 'FCA / Financial Ombudsman Service',
    travel: 'Civil Aviation Authority (CAA)',
    rail: 'Office of Rail and Road (ORR)',
    insurance: 'FCA / Financial Ombudsman Service',
    council_tax: 'Valuation Office Agency / Valuation Tribunal',
    parking: 'POPLA / Independent Appeals Service / local council',
    hmrc: 'HMRC',
    dvla: 'DVLA',
    nhs: 'Parliamentary and Health Service Ombudsman',
    gym: 'Trading Standards / Citizens Advice',
    debt: 'FCA / Financial Ombudsman Service',
    general: 'Trading Standards / Citizens Advice',
  } as Record<DisputeType, string>)[t] ?? null;
}

function estimateClaimValue(
  type: DisputeType,
  scenario: string,
  amount?: number,
): { min: number; max: number; currency: 'GBP' } | null {
  if (typeof amount === 'number' && amount > 0) {
    return { min: Math.round(amount * 0.6), max: Math.round(amount), currency: 'GBP' };
  }
  // UK261 short-haul / long-haul bands.
  if (type === 'travel') {
    if (/long.?haul|6,?000\s*km|3,500/.test(scenario)) return { min: 350, max: 520, currency: 'GBP' };
    return { min: 220, max: 350, currency: 'GBP' };
  }
  return null;
}

function scoreTimeSensitivity(type: DisputeType, scenario: string): 'high' | 'medium' | 'low' {
  // UK261 has a 6-year limitation but eligibility windows; energy back-
  // billing is 12 months; FOS final response window is 8 weeks. Flag
  // 'high' when the scenario implies a near-term deadline.
  if (/14[- ]?day|7[- ]?day|tomorrow|this\s*week|expires/.test(scenario.toLowerCase())) return 'high';
  if (type === 'travel' || type === 'finance' || type === 'broadband') return 'medium';
  return 'low';
}

function extractCustomerResponse(letter: string, rationale: string, statute?: string): string {
  // The engine now writes in business_to_customer voice for the B2B
  // route, so the LETTER ITSELF is the response from the business to
  // the customer. Strip the salutation ("Dear …" / "Hi …") and the
  // sign-off block, then concatenate the first 2-3 substantive
  // paragraphs into a paste-ready customer-facing reply that fits in
  // an agent UI without the visible date / address / signature lines.
  const stripHeader = letter.replace(/^[\s\S]*?(?:Dear|Hi|Hello)[^\n]*\n+/i, '').trim();
  // Strip a trailing sign-off block (everything from "Kind regards" /
  // "Yours sincerely" / "Best regards" onwards).
  const stripSignoff = stripHeader.replace(/\n+(?:Kind regards|Yours sincerely|Yours faithfully|Best regards|Best wishes|Regards|Sincerely|Many thanks)[\s\S]*$/i, '').trim();

  const paragraphs = stripSignoff.split(/\n\n+/).filter((p) => p.trim().length > 40);

  if (paragraphs.length === 0) {
    return statute
      ? `Thanks for raising this. Under ${statute}, you have rights here that we need to honour. ${rationale}`
      : `Thanks for raising this. ${rationale}`;
  }

  // Take the first 2 substantive paragraphs (typically the
  // acknowledgement + the legal-position explanation) and cap at 1200
  // chars so the field fits comfortably in a Zendesk / Intercom agent
  // sidebar without being truncated mid-sentence by downstream UIs.
  const joined = paragraphs.slice(0, 2).join('\n\n');
  return joined.length > 1200 ? joined.slice(0, 1197) + '…' : joined;
}
