// src/lib/legal-data/__tests__/gov-uk-content.test.ts
//
// Mirrors legislation-gov-uk.test.ts: node:test, no jest/vitest. Run with:
//   node --experimental-strip-types --test src/lib/legal-data/__tests__/gov-uk-content.test.ts

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  fetchContent,
  isGovUkUrl,
  searchByDocumentType,
  discoverCmaCases,
} from '../gov-uk-content.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SEARCH_FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'cma-search.json'), 'utf8'),
);
const CONTENT_FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'cma-case.json'), 'utf8'),
);

const realFetch = globalThis.fetch;

function mockFetch(handler: (url: string) => { ok: boolean; body: unknown }) {
  // @ts-expect-error — augment for test
  globalThis.fetch = async (input: string) => {
    const url = typeof input === 'string' ? input : String(input);
    const { ok, body } = handler(url);
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response;
  };
}

describe('isGovUkUrl', () => {
  it('accepts gov.uk and www.gov.uk', () => {
    assert.equal(isGovUkUrl('https://www.gov.uk/cma-cases/x'), true);
    assert.equal(isGovUkUrl('https://gov.uk/cma-cases/x'), true);
  });
  it('rejects non-gov hosts', () => {
    assert.equal(isGovUkUrl('https://example.com'), false);
    assert.equal(isGovUkUrl(null), false);
    assert.equal(isGovUkUrl(''), false);
  });
});

describe('searchByDocumentType', () => {
  before(() => mockFetch(() => ({ ok: true, body: SEARCH_FIXTURE })));
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('parses search hits with web_url + organisations', async () => {
    const hits = await searchByDocumentType('merger', {
      documentType: 'cma_case',
      limit: 10,
    });
    assert.equal(hits.length, 2);
    assert.equal(hits[0].title, 'Example Co / Other Co merger inquiry');
    assert.equal(
      hits[0].webUrl,
      'https://www.gov.uk/cma-cases/example-merger-investigation',
    );
    assert.deepEqual(hits[0].organisations, ['Competition and Markets Authority']);
  });
});

describe('fetchContent', () => {
  before(() => mockFetch(() => ({ ok: true, body: CONTENT_FIXTURE })));
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('returns typed content with web_url and body', async () => {
    const c = await fetchContent('/cma-cases/example-merger-investigation');
    assert.ok(c, 'expected content');
    assert.equal(c?.document_type, 'cma_case');
    assert.equal(c?.title, 'Example Co / Other Co merger inquiry');
    assert.match(c?.web_url ?? '', /^https:\/\/www\.gov\.uk/);
    assert.match(c?.body ?? '', /Phase 2 investigation/);
  });

  it('rejects non-gov hosts', async () => {
    const c = await fetchContent('https://example.com/x');
    assert.equal(c, null);
  });
});

describe('discoverCmaCases', () => {
  before(() =>
    mockFetch((url) => ({
      ok: true,
      body: url.includes('/api/search.json') ? SEARCH_FIXTURE : CONTENT_FIXTURE,
    })),
  );
  after(() => {
    globalThis.fetch = realFetch;
  });

  it('returns hydrated hits up to limit', async () => {
    const out = await discoverCmaCases('merger', { limit: 1 });
    assert.equal(out.length, 1);
    assert.ok(out[0].content, 'expected hydrated content');
    assert.equal(out[0].content?.document_type, 'cma_case');
  });
});
