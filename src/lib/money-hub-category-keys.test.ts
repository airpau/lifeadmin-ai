// src/lib/money-hub-category-keys.test.ts
//
// Run: node --test --experimental-strip-types src/lib/money-hub-category-keys.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpendingCategoryKey, SPENDING_CATEGORY_ALIASES } from './money-hub-category-keys.ts';

describe('normalizeSpendingCategoryKey: transfer spellings', () => {
  // Every one of these is a real stored or pickable value. Only 'transfers'
  // used to be excluded from spending, so the rest were counted as spend.
  for (const raw of ['transfer', 'Transfer ', 'internal_transfer', 'self_transfer', 'inter_account_transfer', 'TRANSFERS']) {
    it(`${JSON.stringify(raw)} -> transfers`, () => {
      assert.equal(normalizeSpendingCategoryKey(raw), 'transfers');
    });
  }
});

describe('normalizeSpendingCategoryKey: existing behaviour kept', () => {
  it('keeps the long-standing aliases', () => {
    assert.equal(normalizeSpendingCategoryKey('loans'), 'loan');
    assert.equal(normalizeSpendingCategoryKey('fees'), 'fee');
    assert.equal(normalizeSpendingCategoryKey('utilities'), 'utility');
    assert.equal(normalizeSpendingCategoryKey('BILL_PAYMENT'), 'bills');
    assert.equal(normalizeSpendingCategoryKey('restaurants'), 'eating_out');
    assert.equal(normalizeSpendingCategoryKey('supermarket'), 'groceries');
  });
  it('passes unknown keys through, lower-cased and trimmed', () => {
    assert.equal(normalizeSpendingCategoryKey('  Marketing '), 'marketing');
  });
  it('returns empty for empty input', () => {
    assert.equal(normalizeSpendingCategoryKey(null), '');
    assert.equal(normalizeSpendingCategoryKey(undefined), '');
    assert.equal(normalizeSpendingCategoryKey('   '), '');
  });
  it('never aliases a key onto another alias', () => {
    for (const target of Object.values(SPENDING_CATEGORY_ALIASES)) {
      assert.equal(SPENDING_CATEGORY_ALIASES[target], undefined, `${target} is itself aliased`);
    }
  });
});
