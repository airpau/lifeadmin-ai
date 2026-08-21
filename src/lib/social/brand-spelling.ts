/**
 * Brand-name spelling guard for outbound social copy.
 *
 * The daily social cron publishes straight to Facebook, Instagram and X with
 * no human in the loop. Live posts have gone out reading "Parybacker" and
 * "Parabacked", so the system-prompt rule is backed by this check, which runs
 * after generation and before any posting call.
 */

export const BRAND = 'Paybacker';
export const BRAND_DOMAIN = 'paybacker.co.uk';

// Ordinary English words that legitimately contain "back", matched
// case-insensitively. Without these the guard would reject every caption that
// says "get your money back", which is most of them.
const ALLOWED_BACK_WORDS = new Set([
  'back', 'backs', 'backed', 'backing', 'backdate', 'backdated', 'background',
  'backup', 'backlog', 'cashback', 'feedback', 'chargeback', 'chargebacks',
  'clawback', 'setback', 'rollback', 'buyback',
]);

// Words that are fine in lower case but suspicious capitalised. "payback" is
// ordinary English and likely in refunds copy; "Payback" reads as a model
// reaching for the brand name and getting it wrong. Case does the work.
const LOWERCASE_ONLY_BACK_WORDS = new Set(['payback', 'paybacks']);

/**
 * Find every token in a caption that looks like a misspelt brand name.
 *
 * URLs and hashtags carry the brand lower-cased by convention, so they are
 * checked against their own canonical forms and then stripped before the
 * word-level scan. Otherwise the required "Try it free at paybacker.co.uk"
 * CTA would fail on every single post.
 *
 * Returns the distinct offending tokens, or an empty array when the copy is
 * clean.
 */
export function findBrandSpellingErrors(caption: string): string[] {
  const bad: string[] = [];

  // Domains: any host containing "back" must be exactly paybacker.co.uk.
  for (const m of caption.matchAll(/\b[\w.-]*back[\w.-]*\.(?:co\.uk|com|uk)\b/gi)) {
    if (m[0].toLowerCase() !== BRAND_DOMAIN) bad.push(m[0]);
  }

  // Hashtags: conventionally lower case and not brand-name usage in prose, so
  // these are matched case-insensitively.
  for (const m of caption.matchAll(/#(\w*back\w*)/gi)) {
    const tag = m[1].toLowerCase();
    if (tag === BRAND.toLowerCase()) continue;
    if (ALLOWED_BACK_WORDS.has(tag)) continue;
    if (LOWERCASE_ONLY_BACK_WORDS.has(tag)) continue;
    bad.push(m[0]);
  }

  // Prose: every remaining token containing "back" must be exactly the brand,
  // an ordinary English word, or a lower-case-only word in lower case.
  const prose = caption
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[\w.-]+\.(?:co\.uk|com|uk)\b/gi, ' ')
    .replace(/#\w+/g, ' ');

  for (const m of prose.matchAll(/\w*back\w*/gi)) {
    const token = m[0];
    if (token === BRAND) continue;
    if (LOWERCASE_ONLY_BACK_WORDS.has(token)) continue; // exact, so lower case only
    if (ALLOWED_BACK_WORDS.has(token.toLowerCase())) continue;
    bad.push(token);
  }

  return [...new Set(bad)];
}
