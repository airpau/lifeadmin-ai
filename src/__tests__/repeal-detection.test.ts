/**
 * Regression tests for the repeal detector in /api/cron/verify-legal-refs.
 *
 * Every case here is taken from the 2026-09-16 production run, where 10 of
 * 124 live statutes were flagged as possibly repealed and queued for founder
 * review. The old test was `xml.includes('repealed') && xml.includes(section || '')`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectRepealEffects } from '../lib/legal-data/repeal-effects.ts';

describe('detectRepealEffects', () => {
  it('does not flag an Act merely because the word appears in its annotations', () => {
    // Communications Act 2003 — flagged in production, is live law.
    const xml = `<Act><Annotation>Words repealed by the Digital Economy Act 2017</Annotation>
      <ukm:Effect Type="words substituted" AffectedProvisions="s. 3(4)"/></Act>`;
    assert.deepEqual(detectRepealEffects(xml, null), []);
  });

  it('does not flag on an empty section (the always-true bug)', () => {
    // xml.includes('') was always true, so every sectionless ref matched.
    const xml = `<Act>something repealed somewhere</Act>`;
    assert.deepEqual(detectRepealEffects(xml, ''), []);
    assert.deepEqual(detectRepealEffects(xml, null), []);
    assert.deepEqual(detectRepealEffects(xml, undefined), []);
  });

  it('does not flag when the word is in the title', () => {
    // Regulation (EC) 261/2004 "...and repealing Regulation (EEC) No 295/91".
    const xml = `<Reg><Title>...and repealing Regulation (EEC) No 295/91</Title></Reg>`;
    assert.deepEqual(detectRepealEffects(xml, null), []);
  });

  it('does not flag our Part when a DIFFERENT Part was repealed', () => {
    // Consumer Rights Act 2015 Part 2 was flagged off an effect on Part 9.
    const xml = `<Act><ukm:Effect Type="repealed" AffectedProvisions="Pt. 9"/></Act>`;
    assert.deepEqual(detectRepealEffects(xml, 'Part 2'), []);
  });

  it('DOES flag a real repeal of our section', () => {
    const xml = `<Act><ukm:Effect Type="repealed" AffectedProvisions="Part 2"/></Act>`;
    const ev = detectRepealEffects(xml, 'Part 2');
    assert.equal(ev.length, 1);
    assert.match(ev[0], /repealed/);
  });

  it('DOES flag a whole-Act repeal regardless of section', () => {
    const xml = `<Act><ukm:Effect Type="Act repealed" AffectedProvisions="Act"/></Act>`;
    assert.equal(detectRepealEffects(xml, 'Part 2').length, 1);
    assert.equal(detectRepealEffects(xml, null).length, 1);
  });

  it('treats revocation as equivalent to repeal', () => {
    const xml = `<Reg><ukm:Effect Type="revoked" AffectedProvisions="Act"/></Reg>`;
    assert.equal(detectRepealEffects(xml, null).length, 1);
  });

  it('returns readable evidence rather than a bare boolean', () => {
    const xml = `<Act><ukm:Effect Type="words repealed" AffectedProvisions="s. 12(3)"/></Act>`;
    assert.deepEqual(detectRepealEffects(xml, 's. 12(3)'), ['words repealed — s. 12(3)']);
  });
});
