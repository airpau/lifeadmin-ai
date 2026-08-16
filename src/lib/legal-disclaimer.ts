/**
 * Shared AI letter disclaimer — required on ALL AI-generated letters.
 * Must appear in: letter text output, PDF exports, frontend display, and email exports.
 *
 * EDITING RULE: this string is a marketing claim that ships inside every
 * letter a user sends in their own name. It must survive the same test as
 * /legal/how-we-cite — every clause has to be true of running code. The
 * FTC's finalised order against DoNotPay turned on unsubstantiated claims
 * about an AI's legal capability.
 *
 * Three parts (Paul, 28 April 2026; corrected 16 August 2026):
 *  1. What we DID — citations retrieved from a maintained store of
 *     official UK sources and checked before the letter is produced.
 *     That is true of the complaint generator and the /v1/disputes API.
 *  2. What the user must still do — READ THE LETTER. The earlier version
 *     of this string said "you do not need to verify them yourself",
 *     which (a) overstated what the guardrail can do (it checks sourcing
 *     and internal consistency, not whether the law cited is the right
 *     law for these facts) and (b) directly contradicted the "Please
 *     review before sending" prompt on the disputes page.
 *  3. What we are NOT — solicitors giving personal legal advice — plus
 *     the edge cases where a professional actually matters: high-value
 *     (>£5k), court action, or unique facts.
 *
 * Keep it short. It appears in full at the bottom of every letter.
 */

const DISCLAIMER_BODY =
  'Drafted on your behalf by Paybacker. The legal citations are retrieved from a maintained store of official UK sources (legislation, regulator rules and ombudsman guidance) and checked before the letter is produced. That check covers where a citation comes from and whether we supplied it; it cannot tell you whether it is the strongest argument on your facts, so please read this letter before sending it in your name. This is correspondence drafted for you, not personal legal advice from a solicitor. For high-value disputes (over £5,000), court proceedings, or facts unique to your situation, consult a qualified solicitor or Citizens Advice (citizensadvice.org.uk).';

/** Plain text disclaimer appended to generated letter content */
export const AI_LETTER_DISCLAIMER =
  `\n\n---\n${DISCLAIMER_BODY} How we cite the law: paybacker.co.uk/legal/how-we-cite`;

/** HTML disclaimer for PDF and web display */
export const AI_LETTER_DISCLAIMER_HTML =
  `${DISCLAIMER_BODY} <a href="https://paybacker.co.uk/legal/how-we-cite">How we cite the law</a>.`;
