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
  return out;
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
    /^(\s*)(re:|dear\b|account\b|reference\b|ref\b|to:\b|\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2})/i;
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
