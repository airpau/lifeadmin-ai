/**
 * Watchdog Reply Classifier
 * -------------------------
 * Given a supplier reply that just landed in the user's inbox, ask Claude to
 * work out what kind of reply it is and whether the user actually needs to act.
 *
 * Called by `sync-runner.ts` after each new correspondence row is inserted.
 * Results are persisted onto the correspondence row (see migration
 * 20260420100000_dispute_reply_intelligence.sql) and used to shape the
 * in-app notification title/body and the Telegram alert that fires.
 *
 * Design goals:
 *   - Cheap & fast: Haiku, <1s p50, <10c per thousand classifications.
 *   - Safe to fail: if Claude errors or the JSON is malformed we return a
 *     "could not classify" shape and let the sync continue. The feature flag
 *     WATCHDOG_CLASSIFIER_ENABLED lets us toggle the whole thing off without
 *     a deploy.
 *   - Explainable: every classification comes back with a one-sentence
 *     rationale we can surface to the user ("they're asking for your account
 *     number before they can proceed").
 */

import Anthropic from '@anthropic-ai/sdk';

export type ReplyCategory =
  | 'holding_reply'       // "we're looking into it"
  | 'info_request'        // supplier asked user for something
  | 'settlement_offer'    // refund / credit / goodwill gesture
  | 'rejection'           // complaint declined
  | 'resolution'          // matter closed
  | 'escalation_needed'   // final response / 8-week letter / deadlock
  | 'other';              // couldn't classify confidently

export type ReplyUrgency = 'none' | 'low' | 'medium' | 'high';

export interface ReplyClassification {
  category: ReplyCategory;
  respondNeeded: boolean;
  urgency: ReplyUrgency;
  /** One human-readable sentence, <= 180 chars, suitable for surfacing to the user. */
  rationale: string;
  /**
   * Short hint the AI letter writer can use if the user clicks "Draft reply".
   * e.g. "They want the last-4 of your account number before reviewing the dispute."
   * May be empty when no reply is needed.
   */
  suggestedContext: string;
}

export interface ReplyClassifierInput {
  disputeTitle?: string | null;
  disputeProvider?: string | null;
  disputeCategory?: string | null;
  userLast5Letters?: string;      // optional context: gist of the user's last sent letter
  supplierSubject: string;
  supplierFromName?: string;
  supplierFromAddress: string;
  supplierBody: string;           // full plain-text body, already capped to 8k
  supplierReceivedAt: Date;
}

export const CLASSIFIER_VERSION = 'watchdog-classifier-2026-04-20';

const SYSTEM_PROMPT = `You are Paybacker's Watchdog triage assistant. A UK consumer has raised a complaint with a supplier (energy, broadband, parking, flight, council, bank, etc.). You have just been given the supplier's latest email reply. Your job is to tell the user what kind of reply this is and whether they personally need to act.

Return ONLY a single JSON object with this exact shape — no prose, no code fences:

{
  "category": "holding_reply" | "info_request" | "settlement_offer" | "rejection" | "resolution" | "escalation_needed" | "other",
  "respondNeeded": true | false,
  "urgency": "none" | "low" | "medium" | "high",
  "rationale": "One plain-English sentence explaining your call, <= 180 chars, written to the user (e.g. 'They've asked for your account number before they can investigate.')",
  "suggestedContext": "Short note for our AI letter-writer if a reply is needed — what the user should say. Empty string if no reply needed."
}

Category rules:
- holding_reply  = acknowledgement / "we've received your complaint" / "we're looking into it" / auto-reply. No action needed unless they gave a deadline that's passed.
- info_request   = they asked the user for anything (account number, address, DOB, proof, photo, meter reading, screenshot). Respond needed = true.
- settlement_offer = they offered money, a credit, a goodwill gesture, a refund, a discount, or to cancel a charge. Respond needed = true (accept / reject / negotiate).
- rejection      = complaint declined / we were in the right / no action. Respond needed = usually true (escalate to ombudsman / push back / request final response).
- resolution     = matter closed with the user's desired outcome. Respond needed = false unless they need to confirm receipt.
- escalation_needed = "final response" letter, 8-week rule letter, deadlock letter, reference to Ombudsman / FCA / Ofcom / Ofgem / CMA. Respond needed = true, urgency = high.
- other          = newsletter, marketing, irrelevant, can't tell. Respond needed = false.

Urgency:
- high   = statutory deadline (final response, 8-week, deadlock, ombudsman referral window, court date, threat of credit file marker).
- medium = the supplier needs something from the user to continue, or has offered settlement.
- low    = routine rejection or negotiation.
- none   = holding / resolution / irrelevant.

Be concise. Never invent facts about the user's account. If the email is ambiguous, lean towards respondNeeded=false and category='other'.`;

function buildUserMessage(input: ReplyClassifierInput): string {
  const parts: string[] = [];
  if (input.disputeTitle) parts.push(`Dispute: ${input.disputeTitle}`);
  if (input.disputeProvider) parts.push(`Supplier (from user's record): ${input.disputeProvider}`);
  if (input.disputeCategory) parts.push(`Category: ${input.disputeCategory}`);
  if (input.userLast5Letters && input.userLast5Letters.trim()) {
    parts.push(`\nWhat the user most recently said to the supplier (gist):\n${input.userLast5Letters.trim().slice(0, 1200)}`);
  }

  parts.push('\n--- Supplier reply ---');
  parts.push(
    `From: ${input.supplierFromName ? `${input.supplierFromName} <${input.supplierFromAddress}>` : input.supplierFromAddress}`,
  );
  parts.push(`Subject: ${input.supplierSubject || '(no subject)'}`);
  parts.push(`Received: ${input.supplierReceivedAt.toISOString()}`);
  parts.push('');
  parts.push(input.supplierBody.slice(0, 6000));

  return parts.join('\n');
}

function fallback(reason: string): ReplyClassification {
  return {
    category: 'other',
    respondNeeded: false,
    urgency: 'none',
    rationale: reason,
    suggestedContext: '',
  };
}

function normaliseCategory(raw: unknown): ReplyCategory {
  const allowed: ReplyCategory[] = [
    'holding_reply',
    'info_request',
    'settlement_offer',
    'rejection',
    'resolution',
    'escalation_needed',
    'other',
  ];
  if (typeof raw !== 'string') return 'other';
  const low = raw.toLowerCase().trim();
  return (allowed as string[]).includes(low) ? (low as ReplyCategory) : 'other';
}

function normaliseUrgency(raw: unknown): ReplyUrgency {
  if (typeof raw !== 'string') return 'none';
  const low = raw.toLowerCase().trim();
  if (low === 'high' || low === 'medium' || low === 'low' || low === 'none') return low;
  return 'none';
}

/**
 * Is the classifier available in this environment?
 * Kill-switch via WATCHDOG_CLASSIFIER_ENABLED=false for incident response.
 */
export function isClassifierEnabled(): boolean {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  if (process.env.WATCHDOG_CLASSIFIER_ENABLED === 'false') return false;
  return true;
}

/**
 * Classify a single supplier reply. Always returns a classification — on error
 * it returns a "couldn't classify" fallback so the sync pipeline never breaks.
 */
export async function classifyReply(
  input: ReplyClassifierInput,
): Promise<ReplyClassification> {
  if (!isClassifierEnabled()) {
    return fallback('Classifier disabled');
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  let rawText = '';
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(input) }],
    });

    const first = response.content?.[0];
    if (first && first.type === 'text') {
      rawText = first.text;
    } else {
      return fallback('No text returned from classifier');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[watchdog] classifier API error:', msg);
    return fallback('Classifier call failed');
  }

  // Model sometimes wraps in ```json fences or leading prose — grab the first {...} block.
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return fallback('Classifier returned non-JSON');

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return fallback('Classifier returned malformed JSON');
  }

  const category = normaliseCategory(parsed.category);
  const urgency = normaliseUrgency(parsed.urgency);
  const respondNeeded = typeof parsed.respondNeeded === 'boolean'
    ? parsed.respondNeeded
    : category === 'info_request' || category === 'settlement_offer' || category === 'escalation_needed';

  const rationale = typeof parsed.rationale === 'string' && parsed.rationale.trim()
    ? parsed.rationale.trim().slice(0, 220)
    : 'Classification completed.';

  const suggestedContext = typeof parsed.suggestedContext === 'string'
    ? parsed.suggestedContext.trim().slice(0, 500)
    : '';

  return {
    category,
    respondNeeded,
    urgency,
    rationale,
    suggestedContext,
  };
}

/**
 * Produce a short human-facing label for a category, used in notification
 * titles ("Info requested", "Settlement offered", etc.).
 */
export function categoryLabel(category: ReplyCategory): string {
  switch (category) {
    case 'holding_reply':     return 'Holding reply';
    case 'info_request':      return 'Info requested';
    case 'settlement_offer':  return 'Settlement offered';
    case 'rejection':         return 'Complaint rejected';
    case 'resolution':        return 'Resolved';
    case 'escalation_needed': return 'Escalation needed';
    case 'other':             return 'New reply';
  }
}

/**
 * Emoji lead for notification / Telegram titles — keeps the alert scannable
 * without needing the user to open the app.
 */
export function categoryEmoji(category: ReplyCategory, urgency: ReplyUrgency): string {
  if (urgency === 'high') return '🚨';
  switch (category) {
    case 'holding_reply':     return '⏳';
    case 'info_request':      return '📝';
    case 'settlement_offer':  return '💰';
    case 'rejection':         return '❌';
    case 'resolution':        return '✅';
    case 'escalation_needed': return '🚨';
    case 'other':             return '📬';
  }
}
