// src/lib/legal-data/__tests__/find-case-law.test.ts
//
// Run with:
//   node --experimental-strip-types --test src/lib/legal-data/__tests__/find-case-law.test.ts

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  fetchAtomRaw,
  isFindCaseLawUrl,
  isProductionEnabled,
  parseAtomFeed,
  searchAtom,
  searchUrl,
} from '../find-case-law.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'find-case-law-atom.xml'),
  'utf8',
);

describe('searchUrl', () => {
  it('appends query', () => {
    assert.equal(
      searchUrl('PPI'),
      'https://caselaw.nationalarchives.gov.uk/atom.xml?query=PPI',
    );
  });
  it('falls through to bare atom feed when no query', () => {
    assert.equal(
      searchUrl(''),
      'https://caselaw.nationalarchives.gov.uk/atom.xml',
    );
  });
});

describe('parseAtomFeed', () => {
  it('parses TNA atom entries with court + summary', () => {
    const hits = parseAtomFeed(FIXTURE);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].title, 'Smith v Example Bank plc [2026] EWCA Civ 123');
    assert.equal(
      hits[0].uri,
      'https://caselaw.nationalarchives.gov.uk/ewca/civ/2026/123',
    );
    assert.equal(hits[0].court, 'EWCA-Civil');
    assert.match(hits[0].summary ?? '', /PPI/);
  });

  it('returns [] on empty input', () => {
    assert.deepEqual(parseAtomFeed(''), []);
  });
});

describe('isFindCaseLawUrl', () => {
  it('matches TNA host', () => {
    assert.equal(
      isFindCaseLawUrl('https://caselaw.nationalarchives.gov.uk/x'),
      true,
    );
    assert.equal(isFindCaseLawUrl('https://example.com/x'), false);
    assert.equal(isFindCaseLawUrl(null), false);
  });
});

describe('isProductionEnabled / searchAtom (gated)', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    delete process.env.FIND_CASE_LAW_LICENCE_ACCEPTED;
    // @ts-expect-error — augment for test
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      text: async () => FIXTURE,
    });
  });
  after(() => {
    globalThis.fetch = realFetch;
    delete process.env.FIND_CASE_LAW_LICENCE_ACCEPTED;
  });

  it('returns [] while the licence env var is unset (dormant)', async () => {
    assert.equal(isProductionEnabled(), false);
    const hits = await searchAtom('PPI');
    assert.deepEqual(hits, []);
  });

  it('returns parsed hits when the gate is bypassed (test path)', async () => {
    const hits = await searchAtom('PPI', { bypassLicenceGate: true });
    assert.equal(hits.length, 2);
  });

  it('flips on when the env var is "true"', async () => {
    process.env.FIND_CASE_LAW_LICENCE_ACCEPTED = 'true';
    assert.equal(isProductionEnabled(), true);
    const hits = await searchAtom('PPI');
    assert.equal(hits.length, 2);
    delete process.env.FIND_CASE_LAW_LICENCE_ACCEPTED;
  });

  it('rejects truthy-looking values that are not literal "true"', async () => {
    process.env.FIND_CASE_LAW_LICENCE_ACCEPTED = '1';
    assert.equal(isProductionEnabled(), false);
    process.env.FIND_CASE_LAW_LICENCE_ACCEPTED = 'yes';
    assert.equal(isProductionEnabled(), false);
    delete process.env.FIND_CASE_LAW_LICENCE_ACCEPTED;
  });
});

describe('fetchAtomRaw', () => {
  const realFetch = globalThis.fetch;
  after(() => {
    globalThis.fetch = realFetch;
  });
  it('returns null on non-ok response', async () => {
    // @ts-expect-error — augment for test
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    });
    const xml = await fetchAtomRaw('PPI');
    assert.equal(xml, null);
  });
});
