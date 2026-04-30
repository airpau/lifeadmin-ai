// src/lib/legal-refs-guardrail.test.ts
//
// Smoke tests for the post-flight citation guardrail (PR β).
// Run with:
//   node --experimental-strip-types --test src/lib/legal-refs-guardrail.test.ts
//
// These tests exercise the pure-function helpers (no Supabase, no
// Perplexity). The Supabase-touching helpers (checkRefFreshness,
// refreshSingleRef, findFreshSubstitute) are integration-tested via
// the real DB on staging.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCitations,
  validateCitations,
  planSubstitutions,
  sanitiseLetter,
  postFlightSanitise,
} from './legal-refs-guardrail.ts';

const FRESH_POOL = [
  { law_name: 'Consumer Rights Act 2015', category: 'general' },
  { law_name: 'Consumer Credit Act 1974', category: 'finance' },
  { law_name: 'Communications Act 2003', category: 'broadband' },
  { law_name: 'EU 261/2004 (UK261)', category: 'travel' },
  { law_name: 'Ofcom General Conditions', category: 'broadband' },
];

describe('extractCitations', () => {
  it('finds Consumer Rights Act with year', () => {
    const cites = extractCitations('Under the Consumer Rights Act 2015 you are entitled to a refund.');
    assert.deepEqual(cites.map((c) => c.toLowerCase()), ['consumer rights act 2015']);
  });

  it('finds the wrong-year Consumer Rights Act 2014 (the canonical hallucination)', () => {
    const cites = extractCitations('Pursuant to Consumer Rights Act 2014, s.49 applies.');
    assert.equal(cites.length, 1);
    assert.equal(cites[0].toLowerCase(), 'consumer rights act 2014');
  });

  it('finds UK261 / EU261', () => {
    const cites = extractCitations('Compensation under EU261 is £350.');
    assert.ok(cites.some((c) => /261/.test(c)));
  });

  it('finds Ofcom variant', () => {
    const cites = extractCitations("This breaches Ofcom's General Conditions.");
    assert.ok(cites.some((c) => /Ofcom/i.test(c)));
  });

  it('dedupes case-insensitively', () => {
    const cites = extractCitations('Consumer Rights Act 2015 ... CONSUMER RIGHTS ACT 2015');
    assert.equal(cites.length, 1);
  });

  it('returns empty for empty / nullish input', () => {
    assert.deepEqual(extractCitations(''), []);
  });
});

describe('validateCitations', () => {
  it('marks a fresh-pool citation as valid', () => {
    const r = validateCitations(['Consumer Rights Act 2015'], FRESH_POOL);
    assert.deepEqual(r.valid, ['Consumer Rights Act 2015']);
    assert.deepEqual(r.rogue, []);
  });

  it('marks the wrong-year hallucination as rogue', () => {
    const r = validateCitations(['Consumer Rights Act 2014'], FRESH_POOL);
    assert.deepEqual(r.valid, []);
    assert.deepEqual(r.rogue, ['Consumer Rights Act 2014']);
  });

  it('marks a fabricated act as rogue', () => {
    const r = validateCitations(['Made Up Act 2024'], FRESH_POOL);
    assert.equal(r.rogue.length, 1);
  });

  it('matches substring either direction (cite vs pool name)', () => {
    // pool has "Consumer Rights Act 2015"; LLM cites "the Consumer Rights Act 2015 (s.49)"
    // — substring direction "cite contains pool" should hit.
    const r = validateCitations(['Consumer Rights Act 2015 (s.49)'], FRESH_POOL);
    assert.deepEqual(r.valid, ['Consumer Rights Act 2015 (s.49)']);
  });
});

describe('planSubstitutions', () => {
  it('proposes the closest token-overlap fresh ref for a wrong-year hallucination', () => {
    const subs = planSubstitutions(['Consumer Rights Act 2014'], FRESH_POOL);
    assert.equal(subs['Consumer Rights Act 2014'], 'Consumer Rights Act 2015');
  });

  it('returns null when no fresh ref shares a token with the rogue', () => {
    const subs = planSubstitutions(['Cheese Act 1066'], FRESH_POOL);
    assert.equal(subs['Cheese Act 1066'], null);
  });
});

describe('sanitiseLetter', () => {
  it('replaces a rogue with its substitute', () => {
    const { sanitised, warnings } = sanitiseLetter(
      'You are entitled under the Consumer Rights Act 2014.',
      ['Consumer Rights Act 2014'],
      { 'Consumer Rights Act 2014': 'Consumer Rights Act 2015' },
    );
    assert.match(sanitised, /Consumer Rights Act 2015/);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Replaced/);
  });

  it('strips when substitution is null', () => {
    const { sanitised, warnings } = sanitiseLetter(
      'See Cheese Act 1066 for context.',
      ['Cheese Act 1066'],
      { 'Cheese Act 1066': null },
    );
    assert.doesNotMatch(sanitised, /Cheese Act/);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Removed/);
  });
});

describe('postFlightSanitise (one-shot)', () => {
  it('passes through a fully-fresh letter unchanged', () => {
    const text = 'You are entitled to a refund under the Consumer Rights Act 2015.';
    const r = postFlightSanitise(text, FRESH_POOL);
    assert.equal(r.sanitised, text);
    assert.deepEqual(r.rogue, []);
    assert.deepEqual(r.warnings, []);
  });

  it('catches the wrong-year hallucination and substitutes', () => {
    const text = 'Pursuant to Consumer Rights Act 2014 (s.49), you are entitled.';
    const r = postFlightSanitise(text, FRESH_POOL);
    assert.match(r.sanitised, /Consumer Rights Act 2015/);
    assert.equal(r.rogue.length, 1);
    assert.equal(r.warnings.length, 1);
  });

  it('strips a fully-fabricated act with no fresh substitute', () => {
    const text = 'Per the Made Up Act 2024 you owe nothing.';
    const r = postFlightSanitise(text, FRESH_POOL);
    assert.equal(r.rogue.length, 1);
    assert.match(r.warnings[0], /Removed unverified citation/);
    assert.doesNotMatch(r.sanitised, /Made Up Act/);
  });
});
