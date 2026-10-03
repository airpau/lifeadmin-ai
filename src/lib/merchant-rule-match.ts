// src/lib/merchant-rule-match.ts
//
// One matcher for "does this merchant rule apply to this bank line?".
//
// Why this exists
// ───────────────
// Every place that applied a merchant rule did it with a raw substring
// test: `description ILIKE '%TFL%'` in the nightly enrichment, and
// `pattern.includes(rulePattern)` in the category engine. A substring
// test has no idea where a word starts or ends, so a three-letter rule
// fires on any line that happens to contain those three letters.
//
// Found on 2026-10-03, when rent paid through PayProp showed up in Money
// Hub as "Transport for London". The description was
//
//   PAYPROP CLIENT ACCRENTFLAT1
//
// and "accRENTFLat1" contains t-f-l. The same thing was happening all
// over the ledger, counted from production that day:
//
//   RAC                  on 133 lines   "TRACEY ANN PARRY ENERGIE"
//   EE                   on  93 lines   "WB FLEET N STRBUCK"
//   Ring Protect         on  60 lines   "RANOUSH CATERING L"
//   SSE Energy           on  35 lines   "INVESTEC ASSET FIN"
//   ICO Data Protection  on  26 lines   "TICOMBO GMBH"
//   Transport for London on   7 lines   "PAYPROP CLIENT ACCRENTFLAT1"
//
// The shorter the rule, the worse it gets, because short strings turn up
// inside ordinary words and surnames. So:
//
//   • a SHORT rule (under 6 characters) must match as a whole word;
//   • a LONGER rule only has to START at a word boundary.
//
// The longer rules keep the looser test on purpose. Banks run fields
// together, and these are real, correct matches that a whole-word test
// would throw away:
//
//   AIRBNB PAYMENTS UK   in  "AIRBNB PAYMENTS UKLONDON"
//   SAINSBURY            in  "SAINSBURYS- CHISWI"
//   GOOGLE ONE           in  "GOOGLE *GOOGLE ONE8888888888"
//
// Six is where the evidence puts the line: every false positive above
// comes from a rule of five characters or fewer ("APPLE" on "Pearl
// Appleby" is the longest), and every legitimate run-on match comes from
// a rule of nine or more.
//
// Dependency-free so it can be unit-tested with `node --test`, and so the
// SQL-side and JS-side matchers are generated from the same definition.

/** Rules shorter than this must match as a whole word. */
export const WHOLE_WORD_BELOW_LENGTH = 6;

/** A rule this short carries no information and never matches. */
const MIN_RULE_LENGTH = 2;

/** Escapes a literal for use inside a regular expression. Valid for both
 *  JavaScript and PostgreSQL (ARE) regex syntax. */
export function escapeRegexLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&');
}

/** Lowercased, trimmed, inner whitespace collapsed. */
function canonical(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Regex source that matches `rule` inside a bank line under the policy
 * above, or null when the rule is too short to be used at all.
 *
 * The same string works as a JavaScript RegExp source and as the right
 * hand side of PostgreSQL's `~*`, which is what lets the nightly SQL
 * enrichment and the in-memory category engine agree with each other.
 * It deliberately uses character classes rather than `\b` / `\m` / `\M`:
 * the word-boundary escapes differ between the two engines, and `\b`
 * also treats "_" as a word character, which bank descriptors use as a
 * separator.
 */
export function merchantRuleRegexSource(rule: string | null | undefined): string | null {
  const needle = canonical(rule);
  if (needle.length < MIN_RULE_LENGTH) return null;
  // A space in the rule should match any run of whitespace in the line.
  const body = escapeRegexLiteral(needle).replace(/ /g, '\\s+');
  const startsAtWord = '(^|[^a-z0-9])';
  const endsAtWord = '($|[^a-z0-9])';
  return needle.length < WHOLE_WORD_BELOW_LENGTH
    ? `${startsAtWord}${body}${endsAtWord}`
    : `${startsAtWord}${body}`;
}

/**
 * True when the merchant rule applies to this bank line.
 *
 * Case-insensitive. `text` is the raw or normalised description.
 */
export function merchantRuleMatches(
  rule: string | null | undefined,
  text: string | null | undefined,
): boolean {
  const source = merchantRuleRegexSource(rule);
  if (!source) return false;
  const haystack = (text ?? '').toLowerCase();
  if (!haystack) return false;
  return new RegExp(source, 'i').test(haystack);
}

/**
 * The two-way test the category engine uses: the rule appears in the
 * line, or the line (already reduced to a merchant-ish pattern) appears
 * in the rule. The reverse direction exists for a stored rule such as
 * "netflix.com" meeting a line that normalises to just "netflix", and it
 * goes through the same boundary policy so it cannot reintroduce the
 * substring problem from the other side.
 */
export function merchantRuleMatchesEitherWay(
  rule: string | null | undefined,
  pattern: string | null | undefined,
): boolean {
  return merchantRuleMatches(rule, pattern) || merchantRuleMatches(pattern, rule);
}
