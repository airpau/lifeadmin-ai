/**
 * Phase 2 — significance gate for Pocket Agent replies.
 *
 * Not every Sonnet reply deserves a thumbs-up/down prompt. We only ask
 * the user to grade *significant* turns (per docs/CLOSED_LOOP_ARCHITECTURE.md):
 *
 *   - reply contains > 50 words, OR
 *   - reply was produced after at least one tool call, OR
 *   - reply contains a drafted letter / cancellation email / structured artefact
 *
 * Trivial back-and-forth ("yes", "thanks", "ok cool") doesn't ask for a thumb —
 * we'd train the user to ignore them and our recordOutcome signal would
 * become noise.
 *
 * The CTA is plain text (no template — keeps cost zero and works on every
 * channel). Inbound classifier picks up "👍 / 👎 / Y / N / GOOD / BAD /
 * THANKS / USELESS" within an hour of the most recent chat_reply_sent
 * event and writes the outcome back.
 */

const SIGNIFICANT_WORD_THRESHOLD = 50;

// Phrases that mean "I drafted something for you" — even short replies
// are significant if they include one of these.
const ARTEFACT_MARKERS = [
  'dear sir/madam',
  'dear sir or madam',
  'yours faithfully',
  'yours sincerely',
  'i am writing to',
  'under the consumer rights act',
  'under section',
  'section 75',
  'pursuant to',
];

export interface SignificanceCheck {
  significant: boolean;
  reason: 'long_reply' | 'tool_call' | 'artefact' | 'short_chat';
  wordCount: number;
}

/**
 * Decide whether a reply should ask for a thumbs-up/down.
 */
export function checkSignificance(
  replyText: string,
  toolCallsUsed: number,
): SignificanceCheck {
  const wordCount = replyText.trim().split(/\s+/).filter(Boolean).length;
  const lower = replyText.toLowerCase();

  if (toolCallsUsed > 0) {
    return { significant: true, reason: 'tool_call', wordCount };
  }
  if (ARTEFACT_MARKERS.some((m) => lower.includes(m))) {
    return { significant: true, reason: 'artefact', wordCount };
  }
  if (wordCount > SIGNIFICANT_WORD_THRESHOLD) {
    return { significant: true, reason: 'long_reply', wordCount };
  }
  return { significant: false, reason: 'short_chat', wordCount };
}

/**
 * The thumbs CTA we append to significant replies. Kept short so it
 * doesn't dominate the reply itself. Reply keywords are documented in
 * src/lib/intelligence/feedback-classifier.ts.
 */
export const THUMBS_CTA =
  '\n\n— Was this helpful? Reply 👍 or 👎 (or "good" / "bad").';

/**
 * Append the CTA to a reply only when significant. Idempotent — won't
 * double-append if the marker is already present.
 */
export function appendThumbsCta(
  replyText: string,
  toolCallsUsed: number,
): { text: string; significant: boolean; reason: SignificanceCheck['reason'] } {
  const check = checkSignificance(replyText, toolCallsUsed);
  if (!check.significant) {
    return { text: replyText, significant: false, reason: check.reason };
  }
  if (replyText.includes('Reply 👍 or 👎')) {
    return { text: replyText, significant: true, reason: check.reason };
  }
  return {
    text: `${replyText.trimEnd()}${THUMBS_CTA}`,
    significant: true,
    reason: check.reason,
  };
}
