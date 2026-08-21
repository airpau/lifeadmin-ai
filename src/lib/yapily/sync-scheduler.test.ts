// src/lib/yapily/sync-scheduler.test.ts
//
// Tests for the staggered bank-refresh scheduler and the mandate
// projection that replaces the nightly re-poll of once-per-consent
// endpoints. Both were added 2026-08-21 after Yapily's pre-launch
// review — see sync-scheduler.ts and project-mandates.ts for the why.
//
// Run: node --test --experimental-strip-types src/lib/yapily/sync-scheduler.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SYNC_INTERVAL_MINUTES,
  MIN_SPACING_MINUTES,
  userBaseOffsetMinutes,
  assignSyncOffsetMinutes,
  computeNextSyncAt,
  staleClaimCutoff,
  SYNC_CLAIM_STALE_MINUTES,
} from './sync-scheduler.ts';
import { parseFrequency, projectMandateOccurrences } from './project-mandates.ts';

describe('userBaseOffsetMinutes', () => {
  it('always lands inside the cycle', () => {
    for (const id of [
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      'x',
      '',
    ]) {
      const offset = userBaseOffsetMinutes(id);
      assert.ok(
        Number.isInteger(offset) && offset >= 0 && offset < SYNC_INTERVAL_MINUTES,
        `offset ${offset} out of range for "${id}"`,
      );
    }
  });

  it('is deterministic', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    assert.equal(userBaseOffsetMinutes(id), userBaseOffsetMinutes(id));
  });

  it('spreads different users across the cycle', () => {
    // Not a distribution proof — just a guard against the hash
    // collapsing (e.g. a sign-bit bug making everything 0), which would
    // silently recreate the synchronised burst this exists to prevent.
    const offsets = new Set(
      Array.from({ length: 200 }, (_, i) =>
        userBaseOffsetMinutes(`user-${i}-0000-0000-0000-00000000`),
      ),
    );
    assert.ok(offsets.size > 50, `expected wide spread, got ${offsets.size} distinct offsets`);
  });
});

describe('assignSyncOffsetMinutes', () => {
  const userId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it("spaces a user's first three banks at least an hour apart", () => {
    // Migle's requirement was "at least an hour between calls for
    // different bank connections". Free allows 2 banks and Essential 3,
    // so the first three slots are the ones that matter most.
    const offsets = [0, 1, 2].map((i) => assignSyncOffsetMinutes(userId, i));

    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        // Circular distance — slot 230 and slot 10 are 20 minutes
        // apart, not 220, because the cycle wraps.
        const raw = Math.abs(offsets[i] - offsets[j]);
        const gap = Math.min(raw, SYNC_INTERVAL_MINUTES - raw);
        assert.ok(
          gap >= 60,
          `slots ${i} and ${j} are only ${gap} minutes apart (${offsets[i]} vs ${offsets[j]})`,
        );
      }
    }
  });

  it('stays inside the cycle even for a Pro user with many banks', () => {
    for (let i = 0; i < 20; i++) {
      const offset = assignSyncOffsetMinutes(userId, i);
      assert.ok(offset >= 0 && offset < SYNC_INTERVAL_MINUTES, `offset ${offset} out of range at index ${i}`);
    }
  });

  it('treats a negative index as the first slot rather than going out of range', () => {
    assert.equal(assignSyncOffsetMinutes(userId, -5), assignSyncOffsetMinutes(userId, 0));
  });

  it('advances by the configured spacing', () => {
    const first = assignSyncOffsetMinutes(userId, 0);
    const second = assignSyncOffsetMinutes(userId, 1);
    assert.equal(second, (first + MIN_SPACING_MINUTES) % SYNC_INTERVAL_MINUTES);
  });
});

describe('computeNextSyncAt', () => {
  it('returns a time strictly in the future', () => {
    const from = new Date('2026-08-21T09:17:00.000Z');
    for (const offset of [0, 1, 59, 120, 239]) {
      const next = computeNextSyncAt(offset, from);
      assert.ok(next.getTime() > from.getTime(), `offset ${offset} produced a non-future time`);
    }
  });

  it('never schedules more than one cycle ahead', () => {
    const from = new Date('2026-08-21T09:17:00.000Z');
    const cycleMs = SYNC_INTERVAL_MINUTES * 60_000;
    for (const offset of [0, 37, 120, 239]) {
      const delta = computeNextSyncAt(offset, from).getTime() - from.getTime();
      assert.ok(delta <= cycleMs, `offset ${offset} scheduled ${delta}ms ahead, over one cycle`);
    }
  });

  it('anchors to the epoch so the schedule does not drift on a late run', () => {
    // Two runs of the same connection, the second one 3 minutes late.
    // Both must resolve to the same next slot — otherwise every late
    // run pushes the connection later and the cadence creeps.
    const onTime = computeNextSyncAt(30, new Date('2026-08-21T08:30:00.000Z'));
    const late = computeNextSyncAt(30, new Date('2026-08-21T08:33:00.000Z'));
    assert.equal(onTime.toISOString(), late.toISOString());
  });

  it('does not re-arm itself for the same instant when run exactly on the offset', () => {
    // `<=` not `<` in the implementation. With `<`, a run landing
    // precisely on its own offset would schedule that same moment
    // again and spin.
    const exact = new Date('2026-08-21T08:30:00.000Z');
    const next = computeNextSyncAt(30, exact);
    assert.ok(next.getTime() > exact.getTime());
  });

  it('normalises an out-of-range or negative offset', () => {
    const from = new Date('2026-08-21T09:17:00.000Z');
    assert.equal(
      computeNextSyncAt(-30, from).toISOString(),
      computeNextSyncAt(SYNC_INTERVAL_MINUTES - 30, from).toISOString(),
    );
    assert.equal(
      computeNextSyncAt(SYNC_INTERVAL_MINUTES + 15, from).toISOString(),
      computeNextSyncAt(15, from).toISOString(),
    );
  });
});

describe('staleClaimCutoff', () => {
  it('sits exactly the stale window in the past', () => {
    const from = new Date('2026-08-21T12:00:00.000Z');
    const cutoff = Date.parse(staleClaimCutoff(from));
    assert.equal(from.getTime() - cutoff, SYNC_CLAIM_STALE_MINUTES * 60_000);
  });

  it('is longer than the cron maxDuration so a slow run is not stolen from', () => {
    // bank-sync sets maxDuration = 60 (seconds). A stale window shorter
    // than that would let a second run claim a connection the first is
    // still actively syncing — the exact concurrent-consent-token
    // situation the claim exists to prevent.
    assert.ok(SYNC_CLAIM_STALE_MINUTES * 60 > 60);
  });
});

describe('parseFrequency', () => {
  const cases: Array<[string, number]> = [
    ['IntrvlMnthDay:01:14', 30],
    ['IntrvlMnthDay:03:01', 90],
    ['IntrvlWkDay:01:03', 7],
    ['IntrvlWkDay:02:03', 14],
    ['WkInMnthDay:01:05', 30],
    ['QtrDay:ENGLISH', 91],
    ['EvryDay', 1],
    ['EvryWorkgDay', 1],
    ['Monthly', 30],
    ['WEEKLY', 7],
    ['Fortnightly', 14],
    ['Annual', 365],
  ];

  for (const [input, days] of cases) {
    it(`parses ${input} as ~${days} days`, () => {
      assert.equal(parseFrequency(input)?.days, days);
    });
  }

  it('returns null for values it cannot interpret', () => {
    // Deliberate: the caller then declines to project rather than
    // guessing a cadence. A missing row is a smaller lie than an
    // invented one.
    assert.equal(parseFrequency(undefined), null);
    assert.equal(parseFrequency(''), null);
    assert.equal(parseFrequency('   '), null);
    assert.equal(parseFrequency(42), null);
    assert.equal(parseFrequency('SomethingElse'), null);
  });
});

describe('projectMandateOccurrences', () => {
  it('projects a monthly direct debit across the horizon', () => {
    const out = projectMandateOccurrences({
      lastKnownDate: '2026-08-14',
      frequency: 'IntrvlMnthDay:01:14',
      source: 'direct_debit',
      afterIso: '2026-08-21',
      horizonIso: '2026-11-30',
    });
    assert.deepEqual(out, ['2026-09-14', '2026-10-14', '2026-11-14']);
  });

  it('keeps a month-end mandate anchored to month-end', () => {
    // 31 Jan + 1 month naively overflows to 3 March. A direct debit on
    // the 31st should land on the last day of each month instead of
    // walking forward through the calendar.
    const out = projectMandateOccurrences({
      lastKnownDate: '2026-01-31',
      frequency: 'Monthly',
      source: 'direct_debit',
      afterIso: '2026-01-31',
      horizonIso: '2026-05-01',
    });
    assert.deepEqual(out, ['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('projects weekly standing orders in whole-day steps', () => {
    const out = projectMandateOccurrences({
      lastKnownDate: '2026-08-20',
      frequency: 'IntrvlWkDay:01:04',
      source: 'standing_order',
      afterIso: '2026-08-20',
      horizonIso: '2026-09-17',
    });
    assert.deepEqual(out, ['2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17']);
  });

  it('assumes monthly when the bank sent no usable frequency', () => {
    // UK direct debits are overwhelmingly monthly, and showing nothing
    // for a mandate the bank has confirmed exists is the worse failure.
    // These rows are emitted as predictions, not bank-confirmed.
    const out = projectMandateOccurrences({
      lastKnownDate: '2026-08-10',
      frequency: undefined,
      source: 'direct_debit',
      afterIso: '2026-08-21',
      horizonIso: '2026-10-31',
    });
    assert.deepEqual(out, ['2026-09-10', '2026-10-10']);
  });

  it('excludes dates at or before afterIso', () => {
    const out = projectMandateOccurrences({
      lastKnownDate: '2026-08-14',
      frequency: 'Monthly',
      source: 'direct_debit',
      afterIso: '2026-09-14',
      horizonIso: '2026-10-31',
    });
    assert.deepEqual(out, ['2026-10-14']);
  });

  it('caps output for a daily cadence over a long horizon', () => {
    const out = projectMandateOccurrences({
      lastKnownDate: '2026-08-20',
      frequency: 'EvryDay',
      source: 'standing_order',
      afterIso: '2026-08-20',
      horizonIso: '2027-08-20',
      max: 10,
    });
    assert.equal(out.length, 10);
  });

  it('terminates on a far-past start date without walking forever', () => {
    // Guards the ITERATION_CAP. A 2015 start with a daily cadence and a
    // 2026 horizon is ~4000 steps; without the cap this is a hang.
    const out = projectMandateOccurrences({
      lastKnownDate: '2015-01-01',
      frequency: 'EvryDay',
      source: 'standing_order',
      afterIso: '2026-08-21',
      horizonIso: '2026-09-21',
      max: 5,
    });
    assert.ok(Array.isArray(out));
  });

  it('returns nothing for an unparseable date', () => {
    assert.deepEqual(
      projectMandateOccurrences({
        lastKnownDate: 'not-a-date',
        frequency: 'Monthly',
        source: 'direct_debit',
        afterIso: '2026-08-21',
        horizonIso: '2026-10-31',
      }),
      [],
    );
  });
});
