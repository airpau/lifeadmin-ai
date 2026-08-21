// src/lib/yapily/sync-window.test.ts
//
// Run: node --test --experimental-strip-types src/lib/yapily/sync-window.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTransactionWindow,
  FULL_HISTORY_DAYS,
  INCREMENTAL_OVERLAP_DAYS,
} from './sync-window.ts';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const DAY = 86_400_000;
const daysBefore = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

describe('computeTransactionWindow', () => {
  it('pulls the full history when there is no watermark', () => {
    const w = computeTransactionWindow(null, NOW);
    assert.equal(w.mode, 'full_history');
    assert.equal(
      w.from,
      new Date(NOW.getTime() - FULL_HISTORY_DAYS * DAY).toISOString(),
    );
  });

  it('ends tomorrow, not today', () => {
    // Banks emit future-dated rows (HSBC returns scheduled payments as
    // ordinary transactions dated on the due date). An upper bound of
    // "now" would silently drop them.
    const w = computeTransactionWindow(daysBefore(1), NOW);
    assert.equal(w.before, new Date(NOW.getTime() + DAY).toISOString());
  });

  it('starts one overlap period before the newest stored transaction', () => {
    const latest = daysBefore(1);
    const w = computeTransactionWindow(latest, NOW);
    assert.equal(w.mode, 'incremental');
    assert.equal(
      w.from,
      new Date(Date.parse(latest) - INCREMENTAL_OVERLAP_DAYS * DAY).toISOString(),
    );
  });

  it('makes the common case a small window, not 90 days', () => {
    // The whole point: a connection synced four hours ago should ask
    // for about a week, not re-pull a quarter of a year.
    const w = computeTransactionWindow(daysBefore(0.2), NOW);
    assert.equal(w.mode, 'incremental');
    assert.ok(w.spanDays <= INCREMENTAL_OVERLAP_DAYS + 2, `span was ${w.spanDays} days`);
  });

  it('overlaps far enough to catch a late-settling card payment', () => {
    // A Friday transaction that settles the following Tuesday appears
    // dated before rows we already stored. Without the overlap the
    // window would start after it and it would never be seen.
    const w = computeTransactionWindow(daysBefore(2), NOW);
    const from = Date.parse(w.from);
    const fridayFiveDaysAgo = NOW.getTime() - 5 * DAY;
    assert.ok(from < fridayFiveDaysAgo, 'window should reach back past a 5-day-old booking');
  });

  it('falls back to full history when the watermark is stale', () => {
    // A connection broken for months should re-pull rather than ask for
    // a 7-day window around a date long past.
    const w = computeTransactionWindow(daysBefore(120), NOW);
    assert.equal(w.mode, 'full_history');
  });

  it('never reaches further back than a full-history sync', () => {
    const w = computeTransactionWindow(daysBefore(FULL_HISTORY_DAYS - 1), NOW);
    const fullFrom = NOW.getTime() - FULL_HISTORY_DAYS * DAY;
    assert.ok(Date.parse(w.from) >= fullFrom, 'incremental window escaped the 90-day floor');
  });

  it('stays incremental when the newest stored row is future-dated', () => {
    // Regression, caught in production 2026-08-21 on the first run
    // after deploy. NatWest and HSBC return scheduled payments as
    // ordinary transactions dated on the DUE date, so the newest stored
    // row is routinely a few days ahead of now. The original guard
    // treated that as clock skew and fell back to a 91-day window on
    // every single run — for exactly the accounts that most need the
    // incremental path.
    const w = computeTransactionWindow(new Date(NOW.getTime() + 5 * DAY).toISOString(), NOW);
    assert.equal(w.mode, 'incremental');
    // Clamped to now, then backed off by the overlap.
    assert.equal(w.from, new Date(NOW.getTime() - INCREMENTAL_OVERLAP_DAYS * DAY).toISOString());
  });

  it('falls back to full history on an absurdly future watermark', () => {
    // A year out is not a scheduled payment, it is corrupt data or a
    // parsing bug, and should not silently narrow the window.
    const w = computeTransactionWindow(new Date(NOW.getTime() + 400 * DAY).toISOString(), NOW);
    assert.equal(w.mode, 'full_history');
  });

  it('falls back to full history on an unparseable watermark', () => {
    assert.equal(computeTransactionWindow('not-a-date', NOW).mode, 'full_history');
    assert.equal(computeTransactionWindow('', NOW).mode, 'full_history');
  });

  it('accepts a Date as well as an ISO string', () => {
    const asDate = computeTransactionWindow(new Date(daysBefore(1)), NOW);
    const asString = computeTransactionWindow(daysBefore(1), NOW);
    assert.deepEqual(asDate, asString);
  });

  it('always produces from < before', () => {
    for (const latest of [null, daysBefore(0), daysBefore(1), daysBefore(89), daysBefore(500)]) {
      const w = computeTransactionWindow(latest, NOW);
      assert.ok(
        Date.parse(w.from) < Date.parse(w.before),
        `inverted window for watermark ${latest}`,
      );
    }
  });
});
