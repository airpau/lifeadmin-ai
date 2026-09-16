/**
 * src/lib/legal-data/repeal-effects.ts
 *
 * Decide whether a legislation.gov.uk document records a genuine repeal or
 * revocation of the provision we cite.
 *
 * Extracted from /api/cron/verify-legal-refs so it can be unit-tested. The
 * logic it replaces was:
 *
 *     xml.includes('repealed') && xml.includes(ref.section || '')
 *
 * which had two failure modes, both firing on every run. `xml.includes('')`
 * is ALWAYS TRUE, so any reference with no section collapsed to "does the
 * word 'repealed' appear anywhere in this Act" — true of every aged statute,
 * in annotations describing amendments to other provisions. And where a
 * section was set it was a bare string like "Part 2", which appears
 * somewhere in almost any Act. Regulation (EC) 261/2004 carries the word in
 * its own title.
 *
 * On the 2026-09-16 run that flagged 10 of 124 live statutes as possibly
 * repealed and seeded the founder review queue with false claims.
 */

/**
 * Find genuine repeal/revocation EFFECTS in a legislation.gov.uk document.
 *
 * legislation.gov.uk records amendments as `<ukm:Effect>` elements carrying a
 * `Type` attribute ("inserted", "words substituted", "repealed", "revoked",
 * "words repealed", ...) and an `AffectedProvisions` attribute naming what
 * the effect hits. Those attributes are the signal; running text is not.
 *
 * When `section` is set the effect must name it, so an amendment to Part 9
 * does not flag a reference to Part 2. An effect against the whole Act
 * ("Act") flags regardless, because that does affect every section.
 *
 * Returns human-readable evidence strings, so a queue row can say WHAT was
 * found rather than just asserting a repeal.
 */
export function detectRepealEffects(
  xml: string,
  section: string | null | undefined,
): string[] {
  const evidence: string[] = [];
  const effectRe = /<ukm:Effect\b[^>]*>/g;
  const wanted = (section ?? '').trim().toLowerCase();

  let m: RegExpExecArray | null;
  while ((m = effectRe.exec(xml)) !== null) {
    const tag = m[0];
    const type = /\bType="([^"]*)"/.exec(tag)?.[1] ?? '';
    if (!/repeal|revoke|revocation/i.test(type)) continue;

    const affected = /\bAffectedProvisions="([^"]*)"/.exec(tag)?.[1] ?? '';
    const affectedLc = affected.toLowerCase();

    // Whole-Act effects always count. Otherwise the effect must name our
    // section, and we only accept that when we actually HAVE a section — an
    // empty section must never match everything, which was the original bug.
    const hitsWholeAct = affectedLc === 'act' || affectedLc === '';
    const hitsOurSection = wanted.length > 0 && affectedLc.includes(wanted);
    if (!hitsWholeAct && !hitsOurSection) continue;

    evidence.push(`${type}${affected ? ` — ${affected}` : ''}`);
    if (evidence.length >= 5) break;
  }

  return evidence;
}
