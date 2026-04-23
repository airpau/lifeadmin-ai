// src/lib/upcoming/detect-recurring.test.ts
//
// Unit tests for the upcoming-payment recurrence detector. Uses
// Node's built-in test runner so it can be run with
//   `node --experimental-strip-types --test src/lib/upcoming/detect-recurring.test.ts`
// without adding jest/vitest as a new dependency.
//
// Cases covered (per feature spec):
//   • Monthly salary — clean cadence, high confidence
//   • 4-weekly benefit — cadence distinct from monthly
//   • Weekly gym — small amount, frequent
//   • Skipped month — one missing cycle should still be detected
//   • Amount drift — ±2% variation kept in a single group
//   • Duplicate-in-same-day — pending+settled pair collapses to one

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRecurringUpcoming,
  normaliseCounterparty,
  type DetectorTransaction,
} from './detect-recurring.ts';

const NOW = new Date('2026-04-23T09:00:00Z');

function dateN(daysFromNow: number): string {
  // Build an ISO date N days from `NOW`.
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString();
}

test('normaliseCounterparty strips refs, dates, and entity suffixes', () => {
  assert.equal(normaliseCounterparty('NETFLIX LTD 4829312'), 'netflix');
  assert.equal(normaliseCounterparty('DD BRITISH GAS REF ABC123'), 'british gas');
  assert.equal(normaliseCounterparty('Tesco 12/04/2026'), 'tesco');
  assert.equal(normaliseCounterparty('Pret A Manger'), 'pret a manger');
});

test('monthly salary — predicts next payday with high confidence', () => {
  const txns: DetectorTransaction[] = [];
  // 6 monthly pay cycles on the 25th, ending 25 Mar 2026.
  for (let i = 0; i < 6; i++) {
    const d = new Date('2026-03-25T09:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - i);
    txns.push({
      id: `sal-${i}`,
      amount: 2800,
      counterparty: 'ACME CORPORATION LTD',
      date: d.toISOString(),
    });
  }
  const [pred, ...rest] = detectRecurringUpcoming(txns, NOW);
  assert.equal(rest.length, 0, 'only one prediction for the series');
  assert.equal(pred.cadence, 'monthly');
  assert.equal(pred.direction, 'incoming');
  assert.equal(pred.amount, 2800);
  assert.ok(pred.confidence >= 0.75, `confidence ${pred.confidence}`);
  // Next payday should be 25 Apr or slightly later (cadence=30).
  assert.ok(pred.expectedDate >= '2026-04-24');
});

test('4-weekly benefit — not misclassified as monthly', () => {
  const txns: DetectorTransaction[] = [];
  // 13 four-weekly payments ending 1 Apr 2026.
  const last = new Date('2026-04-01T08:00:00Z');
  for (let i = 0; i < 13; i++) {
    const d = new Date(last);
    d.setUTCDate(d.getUTCDate() - i * 28);
    txns.push({
      id: `dwp-${i}`,
      amount: 334.80,
      counterparty: 'DWP UC 0294728',
      date: d.toISOString(),
    });
  }
  const [pred] = detectRecurringUpcoming(txns, NOW);
  assert.equal(pred.cadence, 'four_weekly');
  assert.equal(pred.direction, 'incoming');
  assert.ok(pred.confidence >= 0.75);
});

test('weekly gym — small amount, frequent cadence', () => {
  const txns: DetectorTransaction[] = [];
  for (let i = 0; i < 10; i++) {
    txns.push({
      id: `gym-${i}`,
      amount: -14.99,
      counterparty: 'PUREGYM LIMITED',
      date: dateN(-7 * i),
    });
  }
  const [pred] = detectRecurringUpcoming(txns, NOW);
  assert.equal(pred.cadence, 'weekly');
  assert.equal(pred.direction, 'outgoing');
  assert.equal(pred.amount, 14.99);
});

test('skipped month — still detected with confidence ≥ 0.6', () => {
  // 6 monthly, but Feb is missing.
  const txns: DetectorTransaction[] = [
    { id: '1', amount: -9.99, counterparty: 'SPOTIFY', date: '2025-11-01T10:00:00Z' },
    { id: '2', amount: -9.99, counterparty: 'SPOTIFY', date: '2025-12-01T10:00:00Z' },
    { id: '3', amount: -9.99, counterparty: 'SPOTIFY', date: '2026-01-01T10:00:00Z' },
    // Feb skipped
    { id: '4', amount: -9.99, counterparty: 'SPOTIFY', date: '2026-03-01T10:00:00Z' },
    { id: '5', amount: -9.99, counterparty: 'SPOTIFY', date: '2026-04-01T10:00:00Z' },
  ];
  const result = detectRecurringUpcoming(txns, NOW);
  assert.equal(result.length, 1, 'one row despite a skip');
  const [pred] = result;
  // Either monthly (≥70% of intervals hit) or accept-on-fallback is
  // fine — the spec only requires confidence ≥ 0.6 and detection.
  assert.ok(['monthly', 'four_weekly'].includes(pred.cadence));
  assert.ok(pred.confidence >= 0.6, `confidence ${pred.confidence}`);
});

test('amount drift — ±2% variation stays in one group', () => {
  const txns: DetectorTransaction[] = [
    { id: 'b1', amount: -48.00, counterparty: 'BRITISH GAS', date: '2025-11-15T10:00:00Z' },
    { id: 'b2', amount: -48.50, counterparty: 'BRITISH GAS', date: '2025-12-15T10:00:00Z' },
    { id: 'b3', amount: -48.96, counterparty: 'BRITISH GAS', date: '2026-01-15T10:00:00Z' },
    { id: 'b4', amount: -47.85, counterparty: 'BRITISH GAS', date: '2026-02-15T10:00:00Z' },
    { id: 'b5', amount: -48.32, counterparty: 'BRITISH GAS', date: '2026-03-15T10:00:00Z' },
  ];
  const result = detectRecurringUpcoming(txns, NOW);
  assert.equal(result.length, 1, `expected one prediction, got ${result.length}`);
  assert.equal(result[0].cadence, 'monthly');
});

test('duplicate-in-same-day — pending + settled collapse to one', () => {
  // Same day, same amount, same counterparty — banks often duplicate
  // a DD across pending and settled rows. Must not inflate sample.
  const txns: DetectorTransaction[] = [
    { id: 'p1', amount: -9.99, counterparty: 'NETFLIX', date: '2025-11-10T10:00:00Z' },
    { id: 'p1b', amount: -9.99, counterparty: 'NETFLIX', date: '2025-11-10T22:00:00Z' },
    { id: 'p2', amount: -9.99, counterparty: 'NETFLIX', date: '2025-12-10T10:00:00Z' },
    { id: 'p3', amount: -9.99, counterparty: 'NETFLIX', date: '2026-01-10T10:00:00Z' },
    { id: 'p4', amount: -9.99, counterparty: 'NETFLIX', date: '2026-02-10T10:00:00Z' },
  ];
  const result = detectRecurringUpcoming(txns, NOW);
  assert.equal(result.length, 1);
  // 5 raw rows, but same-day dup collapses → sample size = 4
  assert.equal(result[0].sampleSize, 4);
});

test('fewer than 3 occurrences — no prediction emitted', () => {
  const txns: DetectorTransaction[] = [
    { id: '1', amount: -40, counterparty: 'VIRGIN MEDIA', date: '2026-02-01T00:00:00Z' },
    { id: '2', amount: -40, counterparty: 'VIRGIN MEDIA', date: '2026-03-01T00:00:00Z' },
  ];
  assert.deepEqual(detectRecurringUpcoming(txns, NOW), []);
});

test('expected date never in the past', () => {
  // Series that last fired a full year ago — predictor should roll
  // forward rather than emit a stale YYYY-MM date.
  const txns: DetectorTransaction[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date('2025-04-20T10:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - i);
    txns.push({ id: `old-${i}`, amount: -12, counterparty: 'ICLOUD', date: d.toISOString() });
  }
  const [pred] = detectRecurringUpcoming(txns, NOW);
  if (pred) {
    assert.ok(pred.expectedDate >= NOW.toISOString().slice(0, 10));
  }
});
