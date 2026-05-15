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
 * The model is told to put date + recipient + Re: + Dear at the top,
 * then body. Confirmed in production twice on 2026-05-01 (OneStream
 * broadband drafts) it produces the body first and stuffs the header
 * block somewhere not-at-the-top — sometimes the very END, sometimes
 * the MIDDLE with arguing paragraphs both before and after. Once
 * chunked over WhatsApp the user receives body paragraphs first and
 * the actual letter opening later, which reads as several scrambled
 * messages instead of one cohesive letter.
 *
 * Algorithm:
 *   1. Find the salutation paragraph ("Dear Sir or Madam," / "Dear
 *      <Name>,") — anchored at start of paragraph so body references
 *      like "Dear customer note: …" don't match.
 *   2. If salutation is already at index 0, return unchanged.
 *   3. Walk backwards up to LOOKBACK_BACK paragraphs for a date or
 *      "Re:" anchor — that's the header block START.
 *   4. Walk forwards up to LOOKBACK_FORWARD paragraphs for
 *      conventional UK letter openings ("Further to…", "I am
 *      writing…", "Your message confirms…", etc.) — these belong
 *      with the header. The block END extends to cover them.
 *   5. Splice headerStart..headerEnd to position 0.
 *
 * Conservative: requires both a salutation AND a date/Re: anchor in
 * the lookback window, so a real letter that just isn't a complaint
 * letter (no date / Re:) is never touched.
 */
export function reorderHeaderToTop(text: string): string {
  if (!text) return text;
  const paragraphs = text.split(/\n\n+/);
  if (paragraphs.length < 2) return text;

  const salutation = /^\s*Dear\s+(Sir\b|Madam\b|Sirs\b|[A-Z][a-z]+)/;
  const ukDate =
    /^\s*\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/i;
  const subjectLine = /^\s*Re:\s+/i;
  // Conventional UK letter openings that always immediately follow
  // the salutation. We sweep these forward into the header block so
  // they end up adjacent to "Dear …" in the reordered letter.
  const opening =
    /^\s*(Further to\b|I am writing\b|I write\b|I refer\b|Following\b|With reference\b|Re:\s|Your\s+(message|email|letter|response|reply)\b|This\s+(letter|email|message)\b|Thank you for your\b)/i;

  const salutationIdx = paragraphs.findIndex((p) => salutation.test(p));
  if (salutationIdx <= 0) return text; // already at top, or none found

  const LOOKBACK_BACK = 5;
  const LOOKBACK_FORWARD = 3;

  let headerStart = salutationIdx;
  for (let i = salutationIdx - 1; i >= Math.max(0, salutationIdx - LOOKBACK_BACK); i--) {
    if (ukDate.test(paragraphs[i]) || subjectLine.test(paragraphs[i])) {
      headerStart = i;
    }
  }

  // No date / Re: line found anywhere in the lookback window — the
  // bare "Dear …" alone isn't a strong enough signal to risk reordering.
  if (headerStart === salutationIdx) return text;
  if (headerStart === 0) return text; // already at top

  // Forward sweep: the conventional opening paragraph ("Further to…",
  // "Your message confirms…") always sits right after Dear in a UK
  // letter. Without this, the body paragraphs that originally
  // preceded the header would land between Dear and "Further to…",
  // which reads jarringly even though every paragraph is correct.
  let headerEnd = salutationIdx;
  for (
    let i = salutationIdx + 1;
    i < Math.min(paragraphs.length, salutationIdx + 1 + LOOKBACK_FORWARD);
    i++
  ) {
    if (opening.test(paragraphs[i])) {
      headerEnd = i;
    } else {
      break;
    }
  }

  const block = paragraphs.splice(headerStart, headerEnd - headerStart + 1);
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
