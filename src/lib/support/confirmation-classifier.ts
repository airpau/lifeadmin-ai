/**
 * Confirmation-reply sentiment classifier.
 *
 * When Builder has shipped a fix and a ticket is in
 * 'awaiting_user_confirmation', the next user reply must be classified as
 *   positive  → user confirms the issue is fixed (close ticket)
 *   negative  → user says it's still broken (re-escalate to Builder)
 *   unclear   → off-topic / ambiguous (ask one clarifying question)
 *
 * Strategy: cheap keyword pre-pass first. If the reply unambiguously matches
 * a positive or negative pattern, return immediately (no LLM cost). Only
 * ambiguous replies fall through to a Claude haiku call.
 */
import Anthropic from '@anthropic-ai/sdk';

export type ConfirmationSentiment = 'positive' | 'negative' | 'unclear';

// Word-boundary matchers — avoid matching "no problem" as negative, "fixed up"
// as positive when the user is talking about something else, etc. Order
// matters: negative phrases checked first so "not fixed" doesn't accidentally
// match the positive "fixed" branch.
const NEGATIVE_PATTERNS: RegExp[] = [
  /\b(not|isn'?t|isnt|still|hasn'?t|hasnt|aren'?t|arent|wasn'?t|wasnt)\s+(fixed|working|sorted|resolved|right|good|done)\b/i,
  /\b(still|same)\s+(broken|issue|problem|bug|error|not working|wrong)\b/i,
  /\b(doesn'?t|doesnt|don'?t|dont)\s+(work|working)\b/i,
  /\b(broken|broke|failing|failed|wrong|error|errors|bug|bugs|crash|crashed)\b/i,
  /\b(no(?:pe)?|nah)\b/i,
  /\b(still|persists|persisting|continuing)\b.{0,40}\b(issue|problem|broken|bug)\b/i,
  /\b(fix|fixed)\s+(didn'?t|didnt|hasn'?t|hasnt)\s+work\b/i,
];

const POSITIVE_PATTERNS: RegExp[] = [
  /\b(yes|yep|yeah|yup|aye|y)\b/i,
  /\b(it|its|this|all|that)\s+(work|works|working|fixed|sorted|resolved|done|good|fine|great)\b/i,
  /\b(thanks|thank you|cheers|appreciated|brilliant|lovely|legend|amazing|perfect|excellent|wonderful|nice one)\b/i,
  /\b(all\s+(good|sorted|done|fixed))\b/i,
  /\b(no\s+more\s+(issue|problem|errors?|bug))\b/i,
  /\b(seems\s+(good|fine|fixed|sorted|to be working))\b/i,
  /\b(can\s+confirm|confirmed)\s+(it|its|this|the\s+(issue|fix|bug))?\s*(is|works|fixed|sorted|resolved)?\b/i,
  /\b(works|working)\s+now\b/i,
];

function keywordPass(reply: string): ConfirmationSentiment | null {
  const text = reply.trim();
  if (!text) return 'unclear';
  // Negative first — "not fixed" must not get caught as positive "fixed".
  for (const p of NEGATIVE_PATTERNS) {
    if (p.test(text)) return 'negative';
  }
  for (const p of POSITIVE_PATTERNS) {
    if (p.test(text)) return 'positive';
  }
  return null; // No match — fall through to LLM classifier.
}

const CLASSIFIER_SYSTEM = `You classify user replies on support tickets where a code fix has been shipped and we are asking the user to verify it works.

Classify each reply as exactly one word: "positive", "negative", or "unclear".
- positive = user confirms the issue is fixed / working / resolved (anything that says "yes it works", "thanks", "all good", etc).
- negative = user says it's still broken / not working / same problem / fix didn't work.
- unclear = the reply is off-topic, asks an unrelated question, doesn't address the fix at all, or is too short to tell.

Respond with ONLY the single classification word — no punctuation, no explanation.`;

export async function classifyConfirmationReply(reply: string): Promise<ConfirmationSentiment> {
  const fast = keywordPass(reply);
  if (fast) return fast;

  // Fallback: Claude Haiku (cheap, fast). Default unclear if no API key.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return 'unclear';
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8,
      temperature: 0,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: 'user', content: reply.slice(0, 1500) }],
    });
    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return 'unclear';
    const word = block.text.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (word === 'positive' || word === 'negative' || word === 'unclear') return word;
    return 'unclear';
  } catch {
    return 'unclear';
  }
}
