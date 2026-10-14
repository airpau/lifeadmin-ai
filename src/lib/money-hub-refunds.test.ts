// src/lib/money-hub-refunds.test.ts
//
// Run: node --test --experimental-strip-types src/lib/money-hub-refunds.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRefundMerchantIndex,
  reclassifyAsRefund,
  refundMerchantKey,
  type RefundResolution,
} from './money-hub-refunds.ts';

const spend = (merchant: string, amount: number, category: string) => ({
  txn: { merchant_name: merchant },
  resolved: { amount, kind: 'spending', spendingCategory: category, incomeType: null } as RefundResolution,
});
const genericIncome = (amount: number): RefundResolution => ({ amount, kind: 'income', spendingCategory: null, incomeType: 'other' });

// Shapes taken from production rows on 2026-10-14.
const index = buildRefundMerchantIndex([
  spend('Tesco', -45.2, 'groceries'),
  spend('Tesco', -120, 'groceries'),
  spend('TESCO', -12.5, 'groceries'),
  spend('Deliveroo', -31.4, 'eating_out'),
  spend('Admiral', -55, 'insurance'),
  spend('Paybacker', -9.99, 'software'),
  spend('John Airey', -4800, 'property_management'),
  spend('Director', -500, 'other'),
  spend('Lender Co', -300, 'loan'),
]);

describe('reclassifyAsRefund: refunds from merchants the user spends with', () => {
  it('turns a Tesco credit into a groceries refund with a positive amount', () => {
    const out = reclassifyAsRefund({ merchant_name: 'Tesco' }, genericIncome(120), index, false);
    assert.equal(out.kind, 'spending');
    assert.equal(out.spendingCategory, 'groceries');
    assert.equal(out.amount, 120); // positive: the summariser nets -amount off the category
    assert.equal(out.incomeType, null);
  });

  it('matches merchant names case- and whitespace-insensitively', () => {
    assert.equal(refundMerchantKey({ merchant_name: '  DELIVEROO ' }), 'deliveroo');
    const out = reclassifyAsRefund({ merchant_name: 'DELIVEROO' }, genericIncome(25.93), index, false);
    assert.equal(out.spendingCategory, 'eating_out');
  });

  it('covers insurance refunds', () => {
    assert.equal(reclassifyAsRefund({ merchant_name: 'Admiral' }, genericIncome(55), index, false).kind, 'spending');
  });
});

describe('reclassifyAsRefund: leaves real income alone', () => {
  it('a credit larger than any debit to that merchant is not a refund', () => {
    // Paybacker: GBP 9.99 debits, GBP 2,000+ credits. That is money in.
    const out = reclassifyAsRefund({ merchant_name: 'Paybacker' }, genericIncome(2168.7), index, false);
    assert.equal(out.kind, 'income');
  });

  it('never treats credits from people, catch-all or debt merchants as refunds', () => {
    for (const m of ['John Airey', 'Director', 'Lender Co']) {
      assert.equal(reclassifyAsRefund({ merchant_name: m }, genericIncome(100), index, false).kind, 'income', m);
    }
  });

  it('respects a user category override', () => {
    assert.equal(reclassifyAsRefund({ merchant_name: 'Tesco' }, genericIncome(10), index, true).kind, 'income');
  });

  it('respects an income type the user (or a rule) stored', () => {
    assert.equal(reclassifyAsRefund({ merchant_name: 'Tesco', income_type: 'salary' }, genericIncome(10), index, false).kind, 'income');
  });

  it('only touches generic income, not salary or transfers', () => {
    const salary: RefundResolution = { amount: 10, kind: 'income', spendingCategory: null, incomeType: 'salary' };
    assert.equal(reclassifyAsRefund({ merchant_name: 'Tesco' }, salary, index, false), salary);
    const transfer: RefundResolution = { amount: 10, kind: 'transfer', spendingCategory: 'transfers', incomeType: 'transfer' };
    assert.equal(reclassifyAsRefund({ merchant_name: 'Tesco' }, transfer, index, false), transfer);
  });

  it('ignores unknown merchants and junk merchant names', () => {
    assert.equal(reclassifyAsRefund({ merchant_name: 'Acme Ltd' }, genericIncome(5), index, false).kind, 'income');
    assert.equal(refundMerchantKey({ merchant_name: 'ad' }), '');
    assert.equal(refundMerchantKey({ merchant_name: null }), '');
  });
});

describe('buildRefundMerchantIndex', () => {
  it('uses the most frequent category and the largest debit', () => {
    const idx = buildRefundMerchantIndex([
      spend('Amazon', -10, 'shopping'),
      spend('Amazon', -200, 'shopping'),
      spend('Amazon', -15, 'groceries'),
    ]);
    assert.deepEqual(idx.get('amazon'), { category: 'shopping', maxDebit: 200 });
  });

  it('skips credits, transfers and income when building', () => {
    const idx = buildRefundMerchantIndex([
      { txn: { merchant_name: 'Tesco' }, resolved: { amount: 20, kind: 'spending', spendingCategory: 'groceries', incomeType: null } },
      { txn: { merchant_name: 'Revolut' }, resolved: { amount: -50, kind: 'transfer', spendingCategory: 'transfers', incomeType: null } },
    ]);
    assert.equal(idx.size, 0);
  });
});
