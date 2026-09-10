// src/lib/yapily/upcoming-mappers.test.ts
//
// Run: node --test --experimental-strip-types src/lib/yapily/upcoming-mappers.test.ts
//
// Every fixture below is a REAL payload captured from production
// (upcoming_endpoint_snapshots) on 2026-09-10. They are the payloads
// that caused the incident these tests exist to prevent: for four and a
// half months every HSBC Business direct debit and the NatWest BBLS
// standing order were recorded as money ARRIVING, £16,220 of it, which
// the mandate projector then re-forecast as future income.
//
// If you are here because a test failed after "simplifying" direction
// detection: read detectDirection's doc comment first.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapDirectDebits,
  mapPeriodicPayments,
  type YapilyDirectDebit,
  type YapilyPeriodicPayment,
} from './upcoming-mappers.ts';
import { parseFrequency } from './project-mandates.ts';

const TODAY = new Date().toISOString().slice(0, 10);

// ── HSBC Business, GET /accounts/{id}/direct-debits ────────────────
// Note the shape: payee and status are NESTED, and there is no
// nextPaymentDateTime or nextPaymentAmount at all.
const HSBC_AVIVA: YapilyDirectDebit = {
  reference: '100721886CCI',
  payeeDetails: { name: 'AVIVA' },
  statusDetails: { status: 'ACTIVE' },
  previousPaymentAmount: { amount: 268.05, currency: 'GBP' },
  previousPaymentDateTime: '2026-08-28T00:00:00.000Z',
};

const HSBC_HMRC: YapilyDirectDebit = {
  reference: '109409691',
  payeeDetails: { name: 'HMRC NDDS' },
  statusDetails: { status: 'ACTIVE' },
  previousPaymentAmount: { amount: 4606.35, currency: 'GBP' },
  previousPaymentDateTime: '2026-08-14T00:00:00.000Z',
};

// A dormant mandate: no amount, no dates. Two of these exist live.
const HSBC_DORMANT_SQUARE: YapilyDirectDebit = {
  reference: '1000823514',
  payeeDetails: { name: 'SQUARE' },
  statusDetails: { status: 'ACTIVE' },
};

describe('mapDirectDebits', () => {
  it('treats a direct debit as OUTGOING even though the amount is positive', () => {
    // The whole incident in one assertion. previousPaymentAmount is an
    // unsigned magnitude; it says nothing about direction.
    const [row] = mapDirectDebits([HSBC_AVIVA]);
    assert.equal(row.direction, 'outgoing');
  });

  it('never reports a bill as incoming, across the real HSBC mandate set', () => {
    const rows = mapDirectDebits([HSBC_AVIVA, HSBC_HMRC]);
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.direction),
      ['outgoing', 'outgoing'],
    );
  });

  it('reads the payee name out of the nested shape, not the reference', () => {
    // "100721886CCI" is a payment reference. It was what the Money Hub
    // displayed for four months, and it is why the list was unreadable.
    const [row] = mapDirectDebits([HSBC_AVIVA]);
    assert.equal(row.counterparty, 'AVIVA');
  });

  it('still reads a flat `name` when the bank sends that shape instead', () => {
    const [row] = mapDirectDebits([
      { name: 'THAMES WATER', reference: 'X1', previousPaymentDateTime: '2026-08-01T00:00:00.000Z' },
    ]);
    assert.equal(row.counterparty, 'THAMES WATER');
  });

  it('anchors on the previous payment date rather than stamping today', () => {
    // toDateOnly() returns today for a missing date, so the old code
    // put every mandate on today: the forward view piled 28 rows onto
    // "Today", and the projector then forecast the next occurrence a
    // month from the cron run instead of from the mandate's real cycle.
    const [row] = mapDirectDebits([HSBC_AVIVA]);
    assert.equal(row.expectedDate, '2026-08-28');
    assert.notEqual(row.expectedDate, TODAY);
  });

  it('prefers a real next payment date when the bank sends one', () => {
    const [row] = mapDirectDebits([
      {
        ...HSBC_AVIVA,
        nextPaymentDateTime: '2026-09-28T00:00:00.000Z',
        nextPaymentAmount: { amount: 270.0, currency: 'GBP' },
      },
    ]);
    assert.equal(row.expectedDate, '2026-09-28');
    assert.equal(row.amount, 270.0);
  });

  it('drops a mandate that carries no date at all', () => {
    // Better a missing row than one asserted to be due today.
    assert.deepEqual(mapDirectDebits([HSBC_DORMANT_SQUARE]), []);
  });

  it('drops cancelled and inactive mandates', () => {
    const rows = mapDirectDebits([
      { ...HSBC_AVIVA, statusDetails: { status: 'CANCELLED' } },
      { ...HSBC_AVIVA, status: 'INACTIVE' },
    ]);
    assert.deepEqual(rows, []);
  });

  it('keeps a mandate whose status the bank omits', () => {
    const rows = mapDirectDebits([
      { payeeDetails: { name: 'NEST' }, previousPaymentDateTime: '2026-09-04T00:00:00.000Z' },
    ]);
    assert.equal(rows.length, 1);
  });

  it('honours an explicit CREDIT indicator, so a real collection still works', () => {
    const [row] = mapDirectDebits([{ ...HSBC_AVIVA, creditDebitIndicator: 'CREDIT' }]);
    assert.equal(row.direction, 'incoming');
  });

  it('handles an empty or null payload', () => {
    assert.deepEqual(mapDirectDebits([]), []);
    assert.deepEqual(mapDirectDebits(null), []);
  });
});

// ── NatWest, GET /accounts/{id}/periodic-payments ──────────────────
const NATWEST_BBLS: YapilyPeriodicPayment = {
  frequency: { frequencyType: 'MONTHLY' },
  payeeDetails: { name: 'BBLS LOAN' },
  statusDetails: { status: 'ACTIVE' },
  nextPaymentAmount: { amount: 310.49, currency: 'GBP' },
  nextPaymentDateTime: '2026-09-18T00:00:00.000Z',
};

// An ended standing order HSBC still returns: status UNKNOWN, £0, and a
// final payment date already in the past. It was showing as due today.
const HSBC_ENDED_SO: YapilyPeriodicPayment = {
  frequency: {},
  reference: 'LOAN REPAYMENTS',
  payeeDetails: { name: 'PAUL AIREY' },
  statusDetails: { status: 'UNKNOWN' },
  finalPaymentDateTime: '2026-08-06T00:00:00.000Z',
};

describe('mapPeriodicPayments', () => {
  it('treats a loan repayment standing order as OUTGOING', () => {
    const [row] = mapPeriodicPayments([NATWEST_BBLS]);
    assert.equal(row.direction, 'outgoing');
    assert.equal(row.amount, 310.49);
  });

  it('reads the nested payee name instead of leaving it null', () => {
    // This row reached production with counterparty null, so the UI had
    // nothing to show for a £310.49 monthly payment.
    const [row] = mapPeriodicPayments([NATWEST_BBLS]);
    assert.equal(row.counterparty, 'BBLS LOAN');
  });

  it('drops a standing order that has already made its final payment', () => {
    assert.deepEqual(mapPeriodicPayments([HSBC_ENDED_SO]), []);
  });

  it('honours an explicit CREDIT indicator', () => {
    const [row] = mapPeriodicPayments([
      { ...NATWEST_BBLS, creditDebitIndicator: 'CREDIT', payer: { name: 'A TENANT' } },
    ]);
    assert.equal(row.direction, 'incoming');
    assert.equal(row.counterparty, 'A TENANT');
  });
});

describe('parseFrequency', () => {
  it('unwraps the object shape NatWest sends', () => {
    assert.deepEqual(parseFrequency({ frequencyType: 'MONTHLY' })?.days, 30);
    assert.deepEqual(parseFrequency({ frequencyType: 'WEEKLY' })?.days, 7);
  });

  it('still parses the OBIE string forms', () => {
    assert.equal(parseFrequency('IntrvlMnthDay:01:14')?.days, 30);
    assert.equal(parseFrequency('IntrvlWkDay:02:03')?.days, 14);
  });

  it('returns null for an empty object rather than guessing', () => {
    assert.equal(parseFrequency({}), null);
  });
});
