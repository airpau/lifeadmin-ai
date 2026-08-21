// src/lib/subscriptions/annual-detection.test.ts
//
// Guards the annual pass added 2026-08-21. Annual billing had been
// undetectable by arithmetic: the general rules need 3 occurrences with
// every interval inside one cadence window, two yearly intervals span
// 720+ days, and the lookback was 396. The `yearly` cadence existed and
// nothing could ever reach it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { qualifyAnnualSeries, qualifyRecurringSeries } from './recurring-qualification.ts';

const NOW = new Date('2026-08-21T00:00:00.000Z');
const ago = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString();

describe('annual detection', () => {
  it('the general path still cannot see an annual series (the original bug)', () => {
    const r = qualifyRecurringSeries(
      [{ date: ago(370), amount: 120 }, { date: ago(5), amount: 120 }], {});
    assert.equal(r.qualifies, false);
  });
  it('the annual pass detects two payments a year apart', () => {
    const r = qualifyAnnualSeries(
      [{ date: ago(370), amount: 120 }, { date: ago(5), amount: 120 }], NOW);
    assert.equal(r.qualifies, true);
    assert.equal(r.billingCycle, 'yearly');
    assert.equal(r.medianAmount, 120);
  });
  it('rejects two payments a month apart', () => {
    const r = qualifyAnnualSeries(
      [{ date: ago(35), amount: 120 }, { date: ago(5), amount: 120 }], NOW);
    assert.equal(r.qualifies, false);
  });
  it('rejects a lapsed annual series', () => {
    const r = qualifyAnnualSeries(
      [{ date: ago(1100), amount: 120 }, { date: ago(730), amount: 120 }], NOW);
    assert.equal(r.qualifies, false);
  });
  it('rejects inconsistent amounts', () => {
    const r = qualifyAnnualSeries(
      [{ date: ago(365), amount: 120 }, { date: ago(2), amount: 400 }], NOW);
    assert.equal(r.qualifies, false);
  });
});
