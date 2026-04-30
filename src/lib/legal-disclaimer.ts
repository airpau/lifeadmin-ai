/**
 * Shared AI letter disclaimer — required on ALL AI-generated letters.
 * Must appear in: letter text output, PDF exports, frontend display, and email exports.
 *
 * Two-part design (Paul, 28 April 2026):
 *  1. Tell the user what we DID — cite from a maintained, daily-
 *     refreshed UK statute index, with the citations enforced by a
 *     deterministic guarantee. Builds confidence.
 *  2. Tell them what we are NOT — solicitors providing personal
 *     legal advice. Protects Paybacker. Does NOT ask users to verify
 *     every citation themselves (that's our job, not theirs — the
 *     citation-audit cron + realtime guarantee do that continuously).
 *  3. Direct users to a solicitor / Citizens Advice ONLY for the
 *     edge cases where it actually matters: high-value (>£5k),
 *     court action, or unique facts.
 */

/** Plain text disclaimer appended to generated letter content */
export const AI_LETTER_DISCLAIMER =
  '\n\n---\nDrafted on your behalf by Paybacker. Citations are pulled from a curated UK statute index refreshed daily and enforced by a deterministic citation-completeness check before delivery — you do not need to verify them yourself. This letter is correspondence drafted on your behalf, not personal legal advice from a solicitor. For high-value disputes (over £5,000), court proceedings, or facts unique to your situation, consult a qualified solicitor or Citizens Advice (citizensadvice.org.uk).';

/** HTML disclaimer for PDF and web display */
export const AI_LETTER_DISCLAIMER_HTML =
  'Drafted on your behalf by Paybacker. Citations are pulled from a curated UK statute index refreshed daily and enforced by a deterministic citation-completeness check before delivery — you do not need to verify them yourself. This letter is correspondence drafted on your behalf, not personal legal advice from a solicitor. For high-value disputes (over £5,000), court proceedings, or facts unique to your situation, consult a qualified solicitor or Citizens Advice (citizensadvice.org.uk).';
