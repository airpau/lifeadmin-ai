// Unit tests for the canonical source router.
// Run with:
//   node --experimental-strip-types --test src/lib/legal-data/__tests__/source-router.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  pickCanonicalSource,
  SOURCE_LABEL,
  type CanonicalSourceKind,
} from '../source-router.ts';

describe('pickCanonicalSource', () => {
  it('routes legislation.gov.uk hosts to legislation', () => {
    assert.equal(
      pickCanonicalSource('https://www.legislation.gov.uk/ukpga/2015/15'),
      'legislation',
    );
    assert.equal(
      pickCanonicalSource('https://legislation.gov.uk/ukpga/2015/15/section/9'),
      'legislation',
    );
  });

  it('routes gov.uk /cma-cases/ paths to gov-uk-content', () => {
    assert.equal(
      pickCanonicalSource('https://www.gov.uk/cma-cases/example-case-2024'),
      'gov-uk-content',
    );
  });

  it('routes gov.uk /government/publications/ paths to gov-uk-content', () => {
    assert.equal(
      pickCanonicalSource(
        'https://www.gov.uk/government/publications/example-decision',
      ),
      'gov-uk-content',
    );
  });

  it('falls through to perplexity for unrelated gov.uk paths', () => {
    // /guidance/... is plain content — not a regulator decision page.
    assert.equal(
      pickCanonicalSource('https://www.gov.uk/guidance/consumer-rights'),
      'perplexity',
    );
    assert.equal(
      pickCanonicalSource('https://www.gov.uk/contact'),
      'perplexity',
    );
  });

  it('routes caselaw.nationalarchives.gov.uk to find-case-law', () => {
    assert.equal(
      pickCanonicalSource(
        'https://caselaw.nationalarchives.gov.uk/uksc/2024/15',
      ),
      'find-case-law',
    );
  });

  it('routes bailii.org and judiciary.uk to find-case-law', () => {
    assert.equal(
      pickCanonicalSource('https://www.bailii.org/ew/cases/EWCA/Civ/2023/1.html'),
      'find-case-law',
    );
    assert.equal(
      pickCanonicalSource('https://judiciary.uk/judgments/some-case'),
      'find-case-law',
    );
  });

  it('falls through to perplexity for everything else (FCA, Ofcom, Ofgem, FOS, ICO)', () => {
    assert.equal(
      pickCanonicalSource('https://www.fca.org.uk/handbook/CONC.7'),
      'perplexity',
    );
    assert.equal(
      pickCanonicalSource('https://www.ofcom.org.uk/some-rule'),
      'perplexity',
    );
    assert.equal(
      pickCanonicalSource('https://financial-ombudsman.org.uk/businesses/decisions'),
      'perplexity',
    );
  });

  it('handles missing / malformed / null inputs by defaulting to perplexity', () => {
    assert.equal(pickCanonicalSource(null), 'perplexity');
    assert.equal(pickCanonicalSource(undefined), 'perplexity');
    assert.equal(pickCanonicalSource(''), 'perplexity');
    assert.equal(pickCanonicalSource('not-a-url'), 'perplexity');
    assert.equal(pickCanonicalSource({ source_url: null }), 'perplexity');
    assert.equal(
      pickCanonicalSource({ source_url: 'https://example.com/x' }),
      'perplexity',
    );
  });

  it('accepts a row-shaped object via source_url or url', () => {
    assert.equal(
      pickCanonicalSource({ source_url: 'https://www.legislation.gov.uk/ukpga/2015/15' }),
      'legislation',
    );
    assert.equal(
      pickCanonicalSource({ url: 'https://caselaw.nationalarchives.gov.uk/x' }),
      'find-case-law',
    );
  });

  it('SOURCE_LABEL covers every CanonicalSourceKind', () => {
    const kinds: CanonicalSourceKind[] = [
      'legislation',
      'gov-uk-content',
      'find-case-law',
      'perplexity',
    ];
    for (const k of kinds) {
      assert.equal(typeof SOURCE_LABEL[k], 'string');
      assert.ok(SOURCE_LABEL[k].length > 0);
    }
  });
});
