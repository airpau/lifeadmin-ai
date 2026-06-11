// src/lib/legal-data/legislation-intelligence.test.ts
//
// Tests for the pure decision core of the weekly legislation loop.
//
// Run with:
//   node --experimental-strip-types --test src/lib/legal-data/legislation-intelligence.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideLegislationStatus,
  detectRepeal,
  itemLabel,
  FAILURE_ESCALATION_THRESHOLD,
} from './legislation-intelligence.ts';
import type { LegislationDoc } from './legislation-gov-uk.ts';

function doc(partial: Partial<LegislationDoc>): LegislationDoc {
  return {
    title: 'Test Act 2015',
    fullCitation: 'Test Act 2015',
    sectionText: null,
    sectionNumber: null,
    inForceOn: null,
    lastAmended: null,
    sourceUrl: 'https://www.legislation.gov.uk/ukpga/2015/15',
    hasUnappliedEffects: false,
    raw: '<Legislation></Legislation>',
    ...partial,
  };
}

describe('decideLegislationStatus', () => {
  it('first-ever verification captures a confirmed baseline (non-material)', () => {
    const d = decideLegislationStatus({
      priorHash: null,
      newHash: 'abc',
      hasUnappliedEffects: false,
      repealDetected: false,
      consecutiveFailures: 0,
    });
    assert.equal(d.status, 'confirmed');
    assert.equal(d.changeType, 'confirmed_baseline');
    assert.equal(d.material, false);
    assert.equal(d.isChange, true);
  });

  it('unchanged hash → confirmed, no change logged', () => {
    const d = decideLegislationStatus({
      priorHash: 'abc',
      newHash: 'abc',
      hasUnappliedEffects: false,
      repealDetected: false,
      consecutiveFailures: 0,
    });
    assert.equal(d.status, 'confirmed');
    assert.equal(d.isChange, false);
    assert.equal(d.material, false);
  });

  it('hash drift → amended + material', () => {
    const d = decideLegislationStatus({
      priorHash: 'abc',
      newHash: 'xyz',
      hasUnappliedEffects: false,
      repealDetected: false,
      consecutiveFailures: 0,
    });
    assert.equal(d.status, 'amended');
    assert.equal(d.changeType, 'content_drift');
    assert.equal(d.material, true);
    assert.equal(d.isChange, true);
  });

  it('repeal detected → needs_review (safe demotion) + material', () => {
    const d = decideLegislationStatus({
      priorHash: 'abc',
      newHash: 'xyz',
      hasUnappliedEffects: false,
      repealDetected: true,
      consecutiveFailures: 0,
    });
    assert.equal(d.status, 'needs_review');
    assert.equal(d.changeType, 'repealed');
    assert.equal(d.material, true);
  });

  it('unapplied effects on a changed doc → amended/unapplied_effects', () => {
    const d = decideLegislationStatus({
      priorHash: 'abc',
      newHash: 'xyz',
      hasUnappliedEffects: true,
      repealDetected: false,
      consecutiveFailures: 0,
    });
    assert.equal(d.status, 'amended');
    assert.equal(d.changeType, 'unapplied_effects');
    assert.equal(d.material, true);
  });

  it('transient fetch failure below threshold → failed, retry, no escalation', () => {
    const d = decideLegislationStatus({
      priorHash: 'abc',
      newHash: null,
      hasUnappliedEffects: false,
      repealDetected: false,
      consecutiveFailures: 1,
    });
    assert.equal(d.status, 'failed');
    assert.equal(d.escalate, false);
    assert.equal(d.isChange, false);
  });

  it('fetch failure at threshold → needs_review + escalate + material', () => {
    const d = decideLegislationStatus({
      priorHash: 'abc',
      newHash: null,
      hasUnappliedEffects: false,
      repealDetected: false,
      consecutiveFailures: FAILURE_ESCALATION_THRESHOLD,
    });
    assert.equal(d.status, 'needs_review');
    assert.equal(d.changeType, 'url_dead');
    assert.equal(d.escalate, true);
    assert.equal(d.material, true);
  });
});

describe('detectRepeal', () => {
  it('no repeal markers → false', () => {
    assert.equal(detectRepeal(doc({ raw: '<P>A consumer may reject goods.</P>' })), false);
  });

  it('repeal in the effects envelope → true', () => {
    const raw = '<ukm:UnappliedEffects><ukm:Effect type="repeal" /></ukm:UnappliedEffects>';
    assert.equal(detectRepeal(doc({ raw })), true);
  });

  it('section text reading as repealed → true for a section item', () => {
    assert.equal(
      detectRepeal(doc({ sectionNumber: '9', sectionText: 'This section is repealed.', raw: 'repealed' })),
      true,
    );
  });

  it('cross-reference to another repealed Act does not flag a section item', () => {
    // raw mentions "repealed" but the tracked section text does not.
    assert.equal(
      detectRepeal(doc({ sectionNumber: '9', sectionText: 'A consumer may reject goods.', raw: 'see the repealed Sale of Goods Act' })),
      false,
    );
  });
});

describe('itemLabel', () => {
  it('includes the section when present', () => {
    assert.equal(itemLabel({ act_name: 'Consumer Rights Act 2015', section: 's.9' }), 'Consumer Rights Act 2015 (s.9)');
  });
  it('omits the section when absent', () => {
    assert.equal(itemLabel({ act_name: 'Communications Act 2003', section: null }), 'Communications Act 2003');
  });
});
