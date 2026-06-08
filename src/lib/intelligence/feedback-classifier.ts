/**
 * Phase 2 — inbound message classifier for chat-reply feedback.
 *
 * When the user sends a short reply right after a significant Pocket Agent
 * reply, that's almost certainly a thumb. We detect it deterministically
 * (cheap, fast, no LLM call) and call recordOutcome on the most recent
 * chat_reply_sent event for this user.
 *
 * Keep this list conservative — false positives turn real questions into
 * silent thumbs. The trick is: short reply (<= 4 words) AND matches an
 * unambiguous keyword. If the user types "good question, here's more
 * context", that's longer than 4 words so it never triggers.
 */

const POSITIVE_KEYWORDS = new Set([
  '👍',
  'good',
  'great',
  'perfect',
  'thanks',
  'thank you',
  'cheers',
  'helpful',
  'yes thanks',
  'nice',
  'awesome',
  'y',
  'yep',
  '+1',
  '✅',
]);

const NEGATIVE_KEYWORDS = new Set([
  '👎',
  'bad',
  'wrong',
  'useless',
  'not helpful',
  'unhelpful',
  'no help',
  '-1',
  '❌',
  'rubbish',
  'nope',
  'incorrect',
]);

const MAX_WORDS_FOR_THUMB = 4;

export type ChatFeedback = 'positive' | 'negative' | null;

export function classifyChatFeedback(text: string): ChatFeedback {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_WORDS_FOR_THUMB) return null;

  // Direct emoji / single-word match
  if (POSITIVE_KEYWORDS.has(trimmed)) return 'positive';
  if (NEGATIVE_KEYWORDS.has(trimmed)) return 'negative';

  // Soft contains for short multi-word phrases
  for (const k of POSITIVE_KEYWORDS) {
    if (trimmed === k) return 'positive';
  }
  for (const k of NEGATIVE_KEYWORDS) {
    if (trimmed === k) return 'negative';
  }

  return null;
}
