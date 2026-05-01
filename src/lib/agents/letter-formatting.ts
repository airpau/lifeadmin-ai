/**
 * Pure post-generation cleanup for AI-drafted letter bodies.
 *
 * The complaints engine pipes every letter through these helpers
 * before returning it to a caller (Pocket Agent on Telegram /
 * WhatsApp, dashboard "Draft reply", any future surface). Two
 * responsibilities:
 *
 * 1. Strip ALL markdown emphasis (`**bold**`, `*italic*`, `_italic_`,
 *    `__bold__`, backticks). Some channels (WhatsApp) render a subset
 *    of markdown, others (email, PDF, print) render none — and the
 *    user wants clean plain text they can copy-paste into any channel.
 *    The system prompt now instructs "plain text only", but models
 *    occasionally still emit asterisks; this is the safety net.
 *
 * 2. Strip any sender-address block the model may still print at the
 *    top of the letter despite the prompt's privacy rule. We delete
 *    the leading lines BEFORE the first occurrence of a UK-style
 *    date / "Re:" / "Dear" / Account / Reference anchor — but ONLY
 *    if those leading lines contain a UK postcode (i.e. they look
 *    like an address). Conservative on purpose: when in doubt we
 *    keep the model's output. The user's home address is a privacy
 *    issue, not a correctness one — a false positive that drops a
 *    non-address line would be worse than leaving an occasional
 *    address line in.
 *
 * Kept dependency-free so the unit tests can import it under raw
 * `node --test` without a TS path-alias resolver.
 */

export function stripLetterFormatting(letter: string | undefined | null): string {
  if (!letter) return '';
  let out = stripMarkdownEmphasis(letter);
  out = stripSenderAddressBlock(out);
  out = reorderHeaderToTop(out);
  return out;
}

/**
 * The model is told to put date + recipient + Re: + Dear at the top, then
 * body. Occasionally — confirmed in production with a OneStream draft on
 * 2026-05-01 — it produces the body first and stuffs the header block
 * (date / recipient / "Re:" / "Dear …") at the END of the letter. Once
 * chunked over WhatsApp the user receives body paragraphs first and the
 * actual letter opening last, which reads as 6 scrambled messages
 * instead of one cohesive letter.
 *
 * Find the salutation paragraph ("Dear Sir or Madam," / "Dear <Name>,").
 * If it isn't already at the top, walk backwards up to a small window
 * for the start of the header block (a UK date or a "Re:" line) and
 * lift the entire span to position 0. Conservative: if no salutation is
 * found, or it's already at index 0, return the letter unchanged.
 */
export function reorderHeaderToTop(text: string): string {
  if (!text) return text;
  const paragraphs = text.split(/\n\n+/);
  if (paragraphs.length < 2) return text;

  // Salutation MUST anchor at the start of the paragraph so we don't
  // match "Dear customer note: …" mid-body references.
  const salutation = /^\s*Dear\s+(Sir\b|Madam\b|Sirs\b|[A-Z][a-z]+)/;
  const ukDate =
    /^\s*\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i;
  const subjectLine = /^\s*Re:\s+/i;

  const salutationIdx = paragraphs.findIndex((p) => salutation.test(p));
  if (salutationIdx <= 0) return text; // already at top, or none found

  // Walk backwards from the salutation looking for a date OR Re: line —
  // that's the start of the header block (date and recipient lines may
  // sit between them, which we sweep up in the splice below).
  const LOOKBACK = 5;
  let headerStart = salutationIdx;
  for (let i = salutationIdx - 1; i >= Math.max(0, salutationIdx - LOOKBACK); i--) {
    if (ukDate.test(paragraphs[i]) || subjectLine.test(paragraphs[i])) {
      headerStart = i;
    }
  }

  // No date / Re: line found anywhere in the lookback window — the
  // bare "Dear …" alone isn't a strong enough signal to risk reordering.
  if (headerStart === salutationIdx) return text;
  if (headerStart === 0) return text; // already at top

  const block = paragraphs.splice(headerStart, salutationIdx - headerStart + 1);
  return [...block, ...paragraphs].join('\n\n');
}

export function stripMarkdownEmphasis(text: string): string {
  // **bold** / __bold__ → bold
  let out = text.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  out = out.replace(/__([^_\n]+)__/g, '$1');
  // *italic* / _italic_ → italic. We only strip *paired* emphasis
  // (asterisk/underscore on both sides of a word run). The system
  // prompt already forbids leading "*" bullet markers in letters.
  out = out.replace(/(^|[^\*\w])\*([^\*\n]+?)\*(?!\w)/g, '$1$2');
  out = out.replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, '$1$2');
  // Backticks for inline code → drop the ticks, keep the text.
  out = out.replace(/`([^`\n]+)`/g, '$1');
  return out;
}

/**
 * If the letter starts with what looks like a customer address block
 * (lines containing a UK postcode and/or street fragments), drop those
 * lines until we hit the date / Re: / Dear / Account / Reference
 * anchor. Conservative: only strips if a UK postcode appears in the
 * leading non-empty lines.
 */
export function stripSenderAddressBlock(text: string): string {
  const lines = text.split(/\r?\n/);
  const ukPostcode = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
  const anchor =
    /^(\s*)(re:|dear\b|account\b|reference\b|ref\b|to:\b|\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}|\d{4}-\d{1,2}-\d{1,2}\b|\d{1,2}\/\d{1,2}\/\d{2,4}\b|\d{1,2}\.\d{1,2}\.\d{2,4}\b)/i;
  let anchorIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (anchor.test(lines[i])) {
      anchorIdx = i;
      break;
    }
  }
  if (anchorIdx <= 0) return text;
  const head = lines.slice(0, anchorIdx).join('\n');
  if (!ukPostcode.test(head)) return text;
  return lines.slice(anchorIdx).join('\n').replace(/^\s*\n+/, '');
}
