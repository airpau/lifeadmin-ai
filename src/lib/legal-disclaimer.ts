/**
 * Shared AI letter disclaimer — displayed as UI only, never appended to letter content.
 * Must NOT appear inside letterContent, generatedLetter, or any string that gets copied/emailed/exported.
 */

/** HTML disclaimer for UI display and PDF footer (never injected into letter body strings) */
export const AI_LETTER_DISCLAIMER_HTML =
  'This letter was generated with AI assistance using publicly available legal information from legislation.gov.uk. It does not constitute legal advice. If you are unsure about your rights, please consult a qualified solicitor, Citizens Advice (citizensadvice.org.uk), or your relevant ombudsman.';
