/**
 * AI outcome extraction from incoming dispute correspondence.
 *
 * Human-in-loop: the model only PROPOSES an outcome. Locking the
 * outcome onto the dispute row always requires a user click that
 * round-trips through /api/disputes/[id]/outcome with
 * outcome_set_by='ai_extracted'. We never auto-write.
 */

import Anthropic from '@anthropic-ai/sdk';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

let _client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface InferredOutcome {
  suggested_outcome: 'won' | 'partial' | 'lost' | 'still_open';
  recovered_amount_gbp: number | null;
  confidence: 'high' | 'medium' | 'low';
  evidence_excerpt: string;
  reasoning: string;
}

const SYSTEM = `You analyse a single email or letter sent FROM a UK company TO a consumer who raised a dispute. Return JSON only — no prose, no fences.

Definitions:
- 'won' = the company is paying, refunding, cancelling, or otherwise resolving in the consumer's favour.
- 'partial' = the company offered something, but less than the consumer asked for (e.g. goodwill credit instead of full refund).
- 'lost' = the company refused outright or said the dispute is closed against the consumer.
- 'still_open' = the company is asking for more info, acknowledging receipt, or has not yet decided.

Confidence:
- 'high' = explicit resolution/refusal language, an amount, or a clear cancellation confirmation.
- 'medium' = strong implication but the wording is hedged.
- 'low' = ambiguous, multi-step, or the message is mostly procedural.

JSON shape:
{"suggested_outcome":"won|partial|lost|still_open","recovered_amount_gbp":number|null,"confidence":"high|medium|low","evidence_excerpt":"<=200 chars","reasoning":"<=300 chars"}`;

export async function inferOutcomeFromCorrespondence(
  disputeId: string,
  correspondenceContent: string,
  existingOutcome: string | null,
): Promise<InferredOutcome | null> {
  if (!correspondenceContent || correspondenceContent.trim().length < 30) return null;
  // Don't re-infer if a human-confirmed terminal outcome is already on the dispute.
  if (existingOutcome && ['won', 'partial', 'lost', 'withdrawn'].includes(existingOutcome)) {
    return null;
  }

  const truncated = correspondenceContent.slice(0, 4000);
  const userPrompt = `Dispute id: ${disputeId}\n\nCorrespondence body:\n"""\n${truncated}\n"""\n\nReturn the JSON.`;

  try {
    const message = await getClient().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = message.content[0];
    if (block.type !== 'text') return null;
    const raw = block.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as Partial<InferredOutcome>;
    if (!parsed.suggested_outcome) return null;
    if (!['won', 'partial', 'lost', 'still_open'].includes(parsed.suggested_outcome)) return null;
    if (!['high', 'medium', 'low'].includes(parsed.confidence ?? '')) return null;
    return {
      suggested_outcome: parsed.suggested_outcome,
      recovered_amount_gbp:
        typeof parsed.recovered_amount_gbp === 'number' ? parsed.recovered_amount_gbp : null,
      confidence: parsed.confidence as 'high' | 'medium' | 'low',
      evidence_excerpt: (parsed.evidence_excerpt ?? '').slice(0, 200),
      reasoning: (parsed.reasoning ?? '').slice(0, 300),
    };
  } catch (err) {
    console.warn('[dispute-outcome.ai-extract] failed:', (err as Error).message);
    return null;
  }
}
