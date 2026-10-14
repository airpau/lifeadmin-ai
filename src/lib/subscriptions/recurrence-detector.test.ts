// src/lib/subscriptions/recurrence-detector.test.ts
//
// Run: node --experimental-strip-types --test src/lib/subscriptions/recurrence-detector.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRecurringSeries,
  exclusionReason,
  isKnownSubscriptionMerchant,
  isOneOffRetailMerchant,
  normaliseMerchantKey,
  reviewStatusFor,
} from './recurrence-detector.ts';

const NOW = new Date('2026-10-14T00:00:00.000Z');
const day = (iso: string) => `${iso}T09:30:00.000Z`;
/** Monthly dates on `dom` going back `n` months from Oct 2026. */
function monthly(n: number, dom: number, amount: number | ((i: number) => number)) {
  const out: Array<{ date: string; amount: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(2026, 9 - i, dom));
    out.push({ date: d.toISOString(), amount: typeof amount === 'function' ? amount(n - 1 - i) : amount });
  }
  return out;
}

describe('qualifying series', () => {
  it('monthly Netflix at a fixed price', () => {
    const r = detectRecurringSeries(monthly(12, 3, -10.99), { now: NOW, knownSubscription: true });
    assert.equal(r.qualifies, true);
    assert.equal(r.cadence, 'monthly');
    assert.equal(r.billingCycle, 'monthly');
    assert.equal(r.amount, 10.99);
    assert.equal(r.occurrences, 12);
    assert.ok(r.confidence >= 0.9, `confidence ${r.confidence}`);
    assert.equal(reviewStatusFor(r), 'confirmed');
  });

  it('monthly direct debit that slides to the next working day', () => {
    const dates = ['2026-05-01', '2026-06-01', '2026-07-01', '2026-08-03', '2026-09-01', '2026-10-01'];
    const r = detectRecurringSeries(dates.map((d) => ({ date: day(d), amount: 45 })), { now: NOW });
    assert.equal(r.qualifies, true);
    assert.equal(r.cadence, 'monthly');
  });

  it('annual insurance paid twice, a year apart', () => {
    const r = detectRecurringSeries(
      [
        { date: day('2025-09-20'), amount: 312.4 },
        { date: day('2026-09-18'), amount: 329.9 },
      ],
      { now: NOW },
    );
    assert.equal(r.qualifies, true);
    assert.equal(r.cadence, 'yearly');
    assert.equal(r.reason, 'qualified_annual');
    assert.equal(r.amount, 329.9);
  });

  it('price rise mid-year keeps the series and reports the new price', () => {
    const r = detectRecurringSeries(
      monthly(12, 15, (i) => (i < 6 ? 10.99 : 12.99)),
      { now: NOW },
    );
    assert.equal(r.qualifies, true);
    assert.equal(r.cadence, 'monthly');
    assert.equal(r.priceRises, 1);
    assert.equal(r.amount, 12.99);
    assert.equal(r.occurrences, 12);
  });

  it('weekly charge', () => {
    const out = [];
    for (let i = 0; i < 10; i++) {
      out.push({ date: new Date(NOW.getTime() - (2 + 7 * i) * 86_400_000).toISOString(), amount: 4.5 });
    }
    const r = detectRecurringSeries(out, { now: NOW });
    assert.equal(r.qualifies, true);
    assert.equal(r.cadence, 'weekly');
    assert.equal(r.billingCycle, 'weekly');
  });

  it('quarterly charge', () => {
    const dates = ['2025-11-10', '2026-02-10', '2026-05-11', '2026-08-10'];
    const r = detectRecurringSeries(dates.map((d) => ({ date: day(d), amount: 89 })), { now: NOW });
    assert.equal(r.qualifies, true);
    assert.equal(r.cadence, 'quarterly');
  });

  it('tolerates one missed month in a long series', () => {
    const rows = monthly(10, 8, 39).filter((_, i) => i !== 4);
    const r = detectRecurringSeries(rows, { now: NOW });
    assert.equal(r.qualifies, true);
    assert.equal(r.cadence, 'monthly');
  });

  it('a stray duplicate charge does not break a monthly series', () => {
    const rows = [...monthly(10, 8, 39), { date: day('2026-09-11'), amount: 39 }];
    const r = detectRecurringSeries(rows, { now: NOW });
    assert.equal(r.qualifies, true);
    assert.equal(r.cadence, 'monthly');
    assert.equal(r.occurrences, 10);
  });

  it('picks a fixed membership out of one-off purchases at the same merchant', () => {
    const prime = monthly(6, 12, 8.99);
    const shopping = [
      { date: day('2026-05-03'), amount: 23.5 },
      { date: day('2026-06-21'), amount: 112 },
      { date: day('2026-07-02'), amount: 8.49 },
      { date: day('2026-09-29'), amount: 41.99 },
    ];
    const r = detectRecurringSeries([...prime, ...shopping], { now: NOW });
    assert.equal(r.qualifies, true);
    assert.equal(r.amount, 8.99);
    assert.equal(r.occurrences, 6);
  });
});

describe('rejected series', () => {
  it('a single Amazon purchase', () => {
    const r = detectRecurringSeries([{ date: day('2026-09-01'), amount: 54.99 }], { now: NOW });
    assert.equal(r.qualifies, false);
    assert.equal(r.reason, 'too_few_occurrences');
    assert.equal(reviewStatusFor(r), 'dismissed_by_system');
  });

  it('two purchases a month apart (two-off, not a subscription)', () => {
    const r = detectRecurringSeries(
      [
        { date: day('2026-08-10'), amount: 20 },
        { date: day('2026-09-10'), amount: 20 },
      ],
      { now: NOW },
    );
    assert.equal(r.qualifies, false);
  });

  it('irregular spending at one shop', () => {
    const dates = ['2026-03-02', '2026-03-09', '2026-04-27', '2026-06-01', '2026-06-05', '2026-09-30'];
    const r = detectRecurringSeries(dates.map((d) => ({ date: day(d), amount: 12 })), { now: NOW });
    assert.equal(r.qualifies, false);
    assert.equal(r.reason, 'irregular_cadence');
  });

  it('wildly varying amounts on a monthly rhythm', () => {
    const amounts = [12, 87, 33, 150, 9, 61];
    const r = detectRecurringSeries(monthly(6, 20, (i) => amounts[i]), { now: NOW });
    assert.equal(r.qualifies, false);
  });

  it('coffee shop: retail merchant needs identical amounts', () => {
    const amounts = [3.65, 4.1, 3.65, 4.4, 3.95];
    const r = detectRecurringSeries(monthly(5, 9, (i) => amounts[i]), { now: NOW, highVariance: true });
    assert.equal(r.qualifies, false);
  });

  it('frequent identical purchases at a shop do not become a monthly subscription', () => {
    const rows = [];
    for (let i = 0; i < 40; i++) {
      // Every 2 to 5 days, same price: a regular lunch, not a subscription.
      rows.push({ date: new Date(NOW.getTime() - (3 + i * 3 + (i % 3)) * 86_400_000).toISOString(), amount: 3.65 });
    }
    const r = detectRecurringSeries(rows, { now: NOW, highVariance: true });
    assert.equal(r.qualifies, false);
  });

  it('a stopped subscription is lapsed, not live', () => {
    const rows = [
      { date: day('2025-12-05'), amount: 7.99 },
      { date: day('2026-01-05'), amount: 7.99 },
      { date: day('2026-02-05'), amount: 7.99 },
      { date: day('2026-03-05'), amount: 7.99 },
    ];
    const r = detectRecurringSeries(rows, { now: NOW });
    assert.equal(r.qualifies, false);
    assert.equal(r.lapsed, true);
    assert.equal(r.reason, 'series_lapsed');
    assert.equal(reviewStatusFor(r), 'needs_review');
  });

  it('a price that falls back down is two price points, not a rise', () => {
    const amounts = [10, 13, 10, 13, 10, 13];
    const r = detectRecurringSeries(monthly(6, 1, (i) => amounts[i]), { now: NOW });
    assert.equal(r.qualifies, false);
  });

  it('annual pass is not used for retail merchants', () => {
    const r = detectRecurringSeries(
      [
        { date: day('2025-10-01'), amount: 60 },
        { date: day('2026-10-01'), amount: 60 },
      ],
      { now: NOW, highVariance: true },
    );
    assert.equal(r.qualifies, false);
  });
});

describe('exclusions', () => {
  it('internal transfers, refunds, cash, fees, card repayments and BNPL', () => {
    assert.equal(exclusionReason({ description: 'X', transferPairId: 'abc' }), 'internal_transfer');
    assert.equal(exclusionReason({ description: 'TRANSFER TO SAVINGS POT' }), 'internal_transfer');
    assert.equal(exclusionReason({ description: 'AMAZON REFUND' }), 'refund');
    assert.equal(exclusionReason({ description: 'LINK ATM HIGH ST' }), 'cash_withdrawal');
    assert.equal(exclusionReason({ description: 'Non-Sterling Transaction Fee' }), 'bank_fee_or_interest');
    assert.equal(exclusionReason({ description: 'INTEREST' }), 'bank_fee_or_interest');
    assert.equal(exclusionReason({ description: 'BARCLAYCARD' }), 'credit_card_repayment');
    assert.equal(exclusionReason({ description: 'KLARNA*DUNELM SOFT LONDON' }), 'buy_now_pay_later');
    assert.equal(exclusionReason({ description: 'NETFLIX.COM', category: 'TRANSFERS' }), 'excluded_category');
    assert.equal(exclusionReason({ description: 'NETFLIX.COM', category: 'streaming' }), null);
    assert.equal(exclusionReason({ description: 'SPOTIFY P452056EF9' }), null);
  });
});

describe('merchant normalisation', () => {
  it('strips card numbers, dates, processors and references', () => {
    assert.equal(normaliseMerchantKey('9384 28JUL26      PAYPAL *LINKEDIN  35314369001'), 'linkedin');
    assert.equal(normaliseMerchantKey('Amazon Prime*T01E4amzn.co.uk/pm'), 'amazon prime');
    assert.equal(normaliseMerchantKey('MICROSOFT#G1535308MSBILL.INFO'), 'microsoft');
    assert.equal(normaliseMerchantKey('4239 01AUG26  D   PATREON*          MEMB'), 'patreon');
    assert.equal(normaliseMerchantKey('PAYBACKER.CO.UK   CAMDEN'), 'paybacker');
    assert.equal(normaliseMerchantKey('VIRGIN MEDIA PYMTS'), 'virgin media');
    assert.equal(
      normaliseMerchantKey('9384 17AUG26      WHOOP             BOST'),
      normaliseMerchantKey('9384 17SEP26      WHOOP             BOSTON US'),
    );
  });

  it('merchant hints', () => {
    assert.equal(isOneOffRetailMerchant('CD COSTA WINCHESTER'), true);
    assert.equal(isOneOffRetailMerchant('Greggs'), true);
    assert.equal(isOneOffRetailMerchant('DELIVEROO PLUS SUBS'), false);
    assert.equal(isOneOffRetailMerchant('NETFLIX.COM'), false);
    assert.equal(isKnownSubscriptionMerchant('NETFLIX.COM'), true);
  });
});
