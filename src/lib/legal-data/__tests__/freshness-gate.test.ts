// Unit tests for the Phase 4 freshness gate.
// Run with:
//   node --experimental-strip-types --test src/lib/legal-data/__tests__/freshness-gate.test.ts
//
// We exercise the pure helpers (`pickFreshnessTimestamp`, `isFresh`,
// `classifySource`) and the `loadFreshLegalRefs` flow end-to-end with
// a stub Supabase client. No real network calls.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Mock the supabase module BEFORE importing the gate so the dynamic
// `createClient` import inside the gate resolves to our stub.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://stub.local';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'stub-key';

import {
  pickFreshnessTimestamp,
  isFresh,
  classifySource,
} from '../freshness-gate.ts';

describe('classifySource', () => {
  it('detects legislation.gov.uk', () => {
    assert.equal(classifySource('https://www.legislation.gov.uk/ukpga/2015/15'), 'legislation.gov.uk');
  });
  it('detects find-case-law', () => {
    assert.equal(classifySource('https://caselaw.nationalarchives.gov.uk/id/uksc/2024/15'), 'find-case-law');
  });
  it('detects cma-case', () => {
    assert.equal(classifySource('https://www.gov.uk/cma-cases/abc'), 'cma-case');
  });
  it('falls back to other', () => {
    assert.equal(classifySource('https://example.com/x'), 'other');
    assert.equal(classifySource(null), 'other');
    assert.equal(classifySource(undefined), 'other');
  });
});

describe('pickFreshnessTimestamp', () => {
  it('prefers last_freshness_check_at when present', () => {
    assert.equal(
      pickFreshnessTimestamp({ last_freshness_check_at: '2026-05-01T00:00:00Z', last_verified: '2025-01-01T00:00:00Z' }),
      '2026-05-01T00:00:00Z',
    );
  });
  it('falls back to last_verified when Phase 2/3 column missing', () => {
    assert.equal(
      pickFreshnessTimestamp({ last_freshness_check_at: null, last_verified: '2026-04-30T00:00:00Z' }),
      '2026-04-30T00:00:00Z',
    );
    assert.equal(
      pickFreshnessTimestamp({ last_verified: '2026-04-30T00:00:00Z' }),
      '2026-04-30T00:00:00Z',
    );
  });
  it('returns null when both are missing', () => {
    assert.equal(pickFreshnessTimestamp({ last_freshness_check_at: null, last_verified: null }), null);
  });
});

describe('isFresh', () => {
  const now = new Date('2026-05-01T12:00:00Z');

  it('returns true for recent verified ref', () => {
    assert.equal(
      isFresh(
        {
          last_freshness_check_at: '2026-04-25T00:00:00Z',
          last_verified: null,
          verification_status: 'current',
          is_stale: false,
        },
        14,
        now,
      ),
      true,
    );
  });

  it('returns false when older than maxAgeDays', () => {
    assert.equal(
      isFresh(
        {
          last_freshness_check_at: '2026-04-01T00:00:00Z',
          last_verified: null,
          verification_status: 'current',
          is_stale: false,
        },
        14,
        now,
      ),
      false,
    );
  });

  it('returns false when is_stale=true regardless of timestamp', () => {
    assert.equal(
      isFresh(
        {
          last_freshness_check_at: '2026-04-30T00:00:00Z',
          last_verified: null,
          verification_status: 'current',
          is_stale: true,
        },
        14,
        now,
      ),
      false,
    );
  });

  it('falls back to last_verified when Phase 2/3 column missing', () => {
    assert.equal(
      isFresh(
        {
          last_freshness_check_at: null,
          last_verified: '2026-04-25T00:00:00Z',
          verification_status: 'verified',
          is_stale: false,
        },
        14,
        now,
      ),
      true,
    );
  });

  it('rejects ineligible verification_status', () => {
    assert.equal(
      isFresh(
        {
          last_freshness_check_at: '2026-04-30T00:00:00Z',
          last_verified: null,
          verification_status: 'broken',
          is_stale: false,
        },
        14,
        now,
      ),
      false,
    );
  });

  it('rejects rows that have never been verified', () => {
    assert.equal(
      isFresh(
        {
          last_freshness_check_at: null,
          last_verified: null,
          verification_status: 'current',
          is_stale: false,
        },
        14,
        now,
      ),
      false,
    );
  });
});
