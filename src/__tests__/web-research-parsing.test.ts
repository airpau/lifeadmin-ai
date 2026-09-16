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
  researchWeb,
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

/**
 * Response-shaping regressions from the 2026-09-16 production run.
 *
 * `shapeTurn` is module-private, so these exercise it through the exported
 * surface by stubbing fetch. That is deliberate: the bugs below were both in
 * the seam between the provider's response shape and our interpretation of
 * it, which is exactly what a unit test of a pure helper would have missed.
 */
describe('response shaping', () => {
  const realFetch = globalThis.fetch;
  const stub = (payload: unknown) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
  };
  const restore = () => { globalThis.fetch = realFetch; };

  it('counts a JSON-only answer as grounded when there are sources but no citations', async () => {
    // The production failure: case-law-monitor ran 4 clean searches and was
    // rejected with "not grounded (searches=4, citations=0)" because the
    // prompt says "Return ONLY a JSON array" so the model wrote no prose.
    stub({
      content: [
        { type: 'web_search_tool_result', content: [
          { type: 'web_search_result', url: 'https://bailii.org/x', title: 'X v Y' },
        ] },
        { type: 'text', text: '[{"case_name":"X v Y"}]' },
      ],
      usage: { input_tokens: 100, output_tokens: 10, server_tool_use: { web_search_requests: 4 } },
      stop_reason: 'end_turn',
    });
    try {
      const r = await researchWeb({ prompt: 'p', apiKey: 'k', logCost: false, parse: 'json_array' });
      assert.equal(r.citations.length, 0);
      assert.equal(r.sources.length, 1);
      assert.equal(r.grounded, true, 'sources alone must be enough to count as grounded');
      assert.deepEqual(r.parsed, [{ case_name: 'X v Y' }]);
    } finally { restore(); }
  });

  it('finds search results nested inside code-execution blocks (dynamic filtering)', async () => {
    // With web_search_20260209 the search runs inside code execution and the
    // result blocks arrive nested. A flat walk would report sources=0.
    stub({
      content: [
        { type: 'code_execution_tool_result', content: [
          { type: 'web_search_tool_result', content: [
            { type: 'web_search_result', url: 'https://legislation.gov.uk/a', title: 'A' },
          ] },
        ] },
        { type: 'text', text: '{"valid":true}' },
      ],
      usage: { input_tokens: 50, output_tokens: 5, server_tool_use: { web_search_requests: 2 } },
      stop_reason: 'end_turn',
    });
    try {
      const r = await researchWeb({ prompt: 'p', apiKey: 'k', logCost: false, parse: 'json_object' });
      assert.equal(r.sources.length, 1, 'nested search results must still be found');
      assert.equal(r.grounded, true);
    } finally { restore(); }
  });

  it('still refuses an answer with no searches at all', async () => {
    stub({
      content: [{ type: 'text', text: '{"valid":true}' }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: 'end_turn',
    });
    try {
      const r = await researchWeb({ prompt: 'p', apiKey: 'k', logCost: false });
      assert.equal(r.grounded, false, 'a purely parametric answer is not grounded');
    } finally { restore(); }
  });

  it('surfaces a tool-level error that arrived inside an HTTP 200', async () => {
    stub({
      content: [
        { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } },
        { type: 'text', text: '{}' },
      ],
      usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 1 } },
      stop_reason: 'end_turn',
    });
    try {
      const r = await researchWeb({ prompt: 'p', apiKey: 'k', logCost: false });
      assert.deepEqual(r.searchErrors, ['max_uses_exceeded']);
      assert.equal(r.grounded, false);
    } finally { restore(); }
  });
});
