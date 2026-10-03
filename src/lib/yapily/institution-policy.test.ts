// src/lib/yapily/institution-policy.test.ts
//
// Run: node --test --experimental-strip-types src/lib/yapily/institution-policy.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GENTLE_INSTITUTION_PREFIXES,
  gentleInstitutionPrefixes,
  isGentleInstitution,
} from './institution-policy.ts';

describe('isGentleInstitution', () => {
  it('treats every HSBC brand as gentle by default', () => {
    assert.equal(isGentleInstitution('hsbcbusiness_uk', undefined), true);
    assert.equal(isGentleInstitution('hsbc_uk', undefined), true);
    assert.equal(isGentleInstitution('hsbc_kinetic', undefined), true);
  });

  it('is case and whitespace insensitive', () => {
    assert.equal(isGentleInstitution('  HSBCBusiness_UK ', undefined), true);
  });

  it('leaves the banks that work alone', () => {
    assert.equal(isGentleInstitution('natwest', undefined), false);
    assert.equal(isGentleInstitution('natwest-sandbox', undefined), false);
    assert.equal(isGentleInstitution('mock-sandbox', undefined), false);
    // Contains "hsbc" but does not START with it: prefix match only.
    assert.equal(isGentleInstitution('not_hsbc', undefined), false);
  });

  it('does not treat an unknown institution as gentle', () => {
    // Otherwise a failed institution lookup would switch the upcoming
    // payments harvest off for every bank.
    assert.equal(isGentleInstitution(null, undefined), false);
    assert.equal(isGentleInstitution(undefined, undefined), false);
    assert.equal(isGentleInstitution('', undefined), false);
    assert.equal(isGentleInstitution('   ', undefined), false);
  });

  it('can be switched off entirely with "none"', () => {
    assert.equal(isGentleInstitution('hsbcbusiness_uk', 'none'), false);
    assert.equal(isGentleInstitution('hsbcbusiness_uk', ' NONE '), false);
  });

  it('honours an explicit override list, replacing the default', () => {
    assert.equal(isGentleInstitution('barclays_business', 'barclays'), true);
    assert.equal(isGentleInstitution('hsbcbusiness_uk', 'barclays'), false);
    assert.equal(isGentleInstitution('hsbcbusiness_uk', 'barclays, hsbc'), true);
  });

  it('falls back to the default when the override is blank', () => {
    assert.equal(isGentleInstitution('hsbcbusiness_uk', ''), true);
    assert.equal(isGentleInstitution('hsbcbusiness_uk', '   '), true);
  });
});

describe('gentleInstitutionPrefixes', () => {
  it('returns the default list when unset', () => {
    assert.deepEqual(gentleInstitutionPrefixes(undefined), DEFAULT_GENTLE_INSTITUTION_PREFIXES);
  });

  it('drops empty entries from a sloppy override', () => {
    assert.deepEqual(gentleInstitutionPrefixes('hsbc,, barclays ,'), ['hsbc', 'barclays']);
  });
});
