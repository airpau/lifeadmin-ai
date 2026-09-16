/**
 * Parsing tests for the shared web-research client.
 *
 * These cover the one behaviour that genuinely changes when you move
 * from Perplexity to a web-search-grounded model: the answer now arrives
 * wrapped in prose full of markdown links, and markdown links contain
 * brackets. The old `/\[[\s\S]*\]/` in eleven separate files could not
 * survive that, so these are the regression tests for the replacement.
 *
 * Pure functions only — no network, no env. Runs under the same
 * `node --experimental-strip-types --test` setup as the other pure-lib
 * suites, which is why it imports relatively rather than through `@/`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractJsonArray,
  extractJsonObject,
  stripCodeFence,
} from '../lib/research/web-research.ts';

describe('stripCodeFence', () => {
  it('strips a lowercase json fence', () => {
    assert.equal(stripCodeFence('```json\n{"a":1}\n```'), '{"a":1}');
  });

  it('strips an uppercase JSON fence', () => {
    assert.equal(stripCodeFence('```JSON\n{"a":1}\n```'), '{"a":1}');
  });

  it('strips a fence preceded by blank lines', () => {
    // The old per-file versions anchored on ^ without trimming first,
    // so a leading newline left the fence in place.
    assert.equal(stripCodeFence('\n\n```json\n{"a":1}\n```'), '{"a":1}');
  });

  it('leaves unfenced text alone', () => {
    assert.equal(stripCodeFence('  {"a":1}  '), '{"a":1}');
  });
});

describe('extractJsonArray', () => {
  it('ignores a markdown link before the payload', () => {
    const input =
      'According to [Ofgem](https://ofgem.gov.uk) the cap moved.\n\n' +
      '[{"headline":"a"},{"headline":"b"}]';
    const out = extractJsonArray<{ headline: string }>(input);
    assert.equal(out?.length, 2);
    assert.equal(out?.[1].headline, 'b');
  });

  it('ignores a markdown link whose URL itself contains brackets', () => {
    // `[a](http://x/[1])` yields the candidate `[1]`, which is valid
    // JSON. Picking the first parseable run would return [1] and throw
    // the real payload away.
    const input = 'See [a](http://x/[1]) and [b](http://y)\n[{"z":1}]';
    const out = extractJsonArray<{ z: number }>(input);
    assert.equal(out?.length, 1);
    assert.equal(out?.[0].z, 1);
  });

  it('keeps nested arrays intact', () => {
    const out = extractJsonArray<{ cats: string[] }>('[{"cats":["energy","water"]}]');
    assert.deepEqual(out?.[0].cats, ['energy', 'water']);
  });

  it('tolerates trailing prose', () => {
    const out = extractJsonArray('[{"a":1}]\n\nLet me know if you need more.');
    assert.equal(out?.length, 1);
  });

  it('does not treat brackets inside string literals as structure', () => {
    const out = extractJsonArray<{ n: number }>('[{"note":"see [1] and [2]","n":3}]');
    assert.equal(out?.[0].n, 3);
  });

  it('handles escaped quotes inside strings', () => {
    const out = extractJsonArray<{ q: string }>('[{"q":"he said \\"hi\\" [ok]"}]');
    assert.ok(out?.[0].q.includes('hi'));
  });

  it('returns null for a JSON object rather than throwing', () => {
    // energy-tariff-monitor used to call .map() on an unchecked parse.
    assert.equal(extractJsonArray('{"not":"an array"}'), null);
  });

  it('returns null when there is no JSON at all', () => {
    assert.equal(extractJsonArray('I could not find anything relevant.'), null);
  });
});

describe('extractJsonObject', () => {
  it('ignores a brace-containing aside before the payload', () => {
    const input = 'Here is the result {see note}\n```json\n{"valid":true,"notes":"x"}\n```';
    const out = extractJsonObject<{ valid: boolean }>(input);
    assert.equal(out?.valid, true);
  });

  it('keeps deeply nested objects intact', () => {
    const out = extractJsonObject<{ o: { p: { q: number[] } } }>(
      'text {a} more\n{"o":{"p":{"q":[1,2,3]}}}',
    );
    assert.deepEqual(out?.o.p.q, [1, 2, 3]);
  });

  it('returns null when there is no JSON at all', () => {
    assert.equal(extractJsonObject('nothing here'), null);
  });
});
