// Phase 5 — unit tests for the gov-uk-content drift-detection hash.
// Run with:
//   node --experimental-strip-types --test src/lib/legal-data/__tests__/gov-uk-content-hash.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { hashGovUkContentDoc } from '../gov-uk-content.ts';

describe('hashGovUkContentDoc', () => {
  const baseDoc = {
    base_path: '/cma-cases/example-case',
    title: 'Example CMA case',
    body: 'The CMA opened an investigation into pricing practices.',
    description: 'Decision page',
  };

  it('returns a 64-character lowercase hex SHA-256', async () => {
    const h = await hashGovUkContentDoc(baseDoc);
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  it('is stable across calls for identical input', async () => {
    const a = await hashGovUkContentDoc(baseDoc);
    const b = await hashGovUkContentDoc(baseDoc);
    assert.equal(a, b);
  });

  it('changes when the body changes', async () => {
    const a = await hashGovUkContentDoc(baseDoc);
    const b = await hashGovUkContentDoc({
      ...baseDoc,
      body: 'The CMA opened an investigation into pricing practices and fined the firm.',
    });
    assert.notEqual(a, b);
  });

  it('changes when the title changes', async () => {
    const a = await hashGovUkContentDoc(baseDoc);
    const b = await hashGovUkContentDoc({ ...baseDoc, title: 'Different title' });
    assert.notEqual(a, b);
  });

  it('falls back to description when body is null', async () => {
    const h = await hashGovUkContentDoc({ ...baseDoc, body: null });
    assert.match(h, /^[0-9a-f]{64}$/);
  });
});
