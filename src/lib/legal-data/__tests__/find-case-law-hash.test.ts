// Phase 5 — unit tests for find-case-law drift-detection hash + the
// licence-gate behaviour of `searchByQuery`.
// Run with:
//   node --experimental-strip-types --test src/lib/legal-data/__tests__/find-case-law-hash.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  hashFindCaseLawDoc,
  searchByQuery,
  isProductionEnabled,
} from '../find-case-law.ts';

describe('hashFindCaseLawDoc', () => {
  const baseDoc = {
    uri: 'https://caselaw.nationalarchives.gov.uk/uksc/2024/15',
    title: 'Smith v Acme Ltd [2024] UKSC 15',
    court: 'UKSC',
    summary: 'Consumer rights — implied terms — fitness for purpose.',
  };

  it('returns a 64-character lowercase hex SHA-256', async () => {
    const h = await hashFindCaseLawDoc(baseDoc);
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  it('is stable for identical input', async () => {
    assert.equal(
      await hashFindCaseLawDoc(baseDoc),
      await hashFindCaseLawDoc(baseDoc),
    );
  });

  it('changes when the title changes', async () => {
    const a = await hashFindCaseLawDoc(baseDoc);
    const b = await hashFindCaseLawDoc({ ...baseDoc, title: 'Different' });
    assert.notEqual(a, b);
  });
});

describe('searchByQuery licence gate', () => {
  it('returns [] (no fetch) when FIND_CASE_LAW_LICENCE_ACCEPTED is unset', async () => {
    delete process.env.FIND_CASE_LAW_LICENCE_ACCEPTED;
    assert.equal(isProductionEnabled(), false);
    const r = await searchByQuery('test');
    assert.deepEqual(r, []);
  });

  it('returns [] (no fetch) when FIND_CASE_LAW_LICENCE_ACCEPTED is "false"', async () => {
    process.env.FIND_CASE_LAW_LICENCE_ACCEPTED = 'false';
    assert.equal(isProductionEnabled(), false);
    const r = await searchByQuery('test');
    assert.deepEqual(r, []);
  });

  it('returns [] when FIND_CASE_LAW_LICENCE_ACCEPTED is "1" (strict literal "true")', async () => {
    process.env.FIND_CASE_LAW_LICENCE_ACCEPTED = '1';
    assert.equal(isProductionEnabled(), false);
    const r = await searchByQuery('test');
    assert.deepEqual(r, []);
  });

  it('flips isProductionEnabled to true when env is exactly "true"', () => {
    process.env.FIND_CASE_LAW_LICENCE_ACCEPTED = 'true';
    assert.equal(isProductionEnabled(), true);
    delete process.env.FIND_CASE_LAW_LICENCE_ACCEPTED;
  });
});
