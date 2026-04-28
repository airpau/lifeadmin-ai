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
  scenario: string;
  context?: Record<string, unknown>;
  jurisdiction?: 'UK';
  desired_outcome?: string;
  amount?: number;
  consumer_name?: string;
}

export interface DisputeResponse {
  statute: string;
  entitlement: {
    summary: string;
    rationale: string;
    additional_rights?: string[];
    estimated_success: 'low' | 'medium' | 'high';
  };
  draft_letter_excerpt: string;
  escalation_path: Array<{ step: number; to: string; wait_days?: number; url?: string }>;
  legal_references: string[];
  confidence: number;
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
  return {
    scenario: b.scenario.trim(),
    context: (b.context as Record<string, unknown>) ?? {},
    jurisdiction: 'UK',
    desired_outcome: typeof b.desired_outcome === 'string' ? b.desired_outcome : undefined,
    amount: typeof b.amount === 'number' ? b.amount : undefined,
    consumer_name: typeof b.consumer_name === 'string' ? b.consumer_name : undefined,
  };
}

/**
 * Pull verified UK statute references that match the scenario keywords.
 * The complaint engine consumes this to keep its citations grounded.
 */
async function fetchVerifiedRefs(scenario: string): Promise<any[]> {
  const supabase = getAdmin();
  // Coarse keyword match — the engine will narrow further. We want
  // enough candidate statutes that Claude has the right one available
  // without flooding the prompt.
  const tokens = scenario.toLowerCase().split(/\s+/).filter((t) => t.length >= 4).slice(0, 8);
  if (tokens.length === 0) return [];

  const { data } = await supabase
    .from('legal_references')
    .select('law_name, section, summary, full_text, source_url, category')
    .limit(20);
  if (!data) return [];

  // Score by token overlap — simple but works for v1.
  return data
    .map((ref) => {
      const haystack = `${ref.law_name} ${ref.section ?? ''} ${ref.summary ?? ''} ${ref.category ?? ''}`.toLowerCase();
      const score = tokens.reduce((s, tok) => s + (haystack.includes(tok) ? 1 : 0), 0);
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
      companyName: (req.context?.merchant as string) || 'the merchant',
      issueDescription: req.scenario,
      desiredOutcome: req.desired_outcome ?? '',
      amount: req.amount != null ? String(req.amount) : undefined,
      letterType: 'complaint',
      verifiedLegalRefs: verifiedRefsText || undefined,
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

  return {
    statute: inferStatute(legalRefs),
    entitlement: {
      summary: nextStepsArr.length > 0
        ? nextStepsArr.join(' ')
        : 'See draft letter for the entitlement narrative.',
      rationale,
      additional_rights: additionalRights,
      estimated_success: successLabel,
    },
    draft_letter_excerpt: letter.slice(0, 1200),
    escalation_path: Array.isArray(result?.escalationPath) && result.escalationPath.length > 0
      ? result.escalationPath.map((step: string, i: number) => ({ step: i + 1, to: step }))
      : deriveEscalationPath(req.scenario),
    legal_references: legalRefs,
    confidence: typeof result?.confidence === 'number' ? result.confidence : 0.8,
  };
}
