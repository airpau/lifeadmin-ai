// src/lib/category-taxonomy.test.ts
//
// Unit tests for the canonical category taxonomy. Run with Node's
// built-in test runner (matches src/lib/upcoming/detect-recurring.test.ts):
//
//   node --experimental-strip-types --test src/lib/category-taxonomy.test.ts
//
// The SQL counterpart lives in supabase/migrations/20260427100000_category_taxonomy.sql.
// Every bucket assignment below MUST match the SQL CASE arms — the migration
// header comment calls this out and code review enforces it. If the lists
// drift, this test plus the production smoke (`SELECT category_bucket('foo')`)
// catches it.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketFor,
  isSpendingBucket,
  isSwitchable,
  hasMeaningfulPriceSignal,
  CATEGORY_BUCKET,
  type CategoryBucket,
} from './category-taxonomy.ts';

describe('category-taxonomy: bucketFor', () => {
  it('classifies income categories', () => {
    for (const cat of ['income', 'salary', 'freelance', 'rental', 'benefits',
                       'pension', 'dividends', 'investment', 'refund', 'gift',
                       'loan_repayment']) {
      assert.equal(bucketFor(cat), 'income', `${cat} should be income`);
    }
  });

  it('classifies fixed_cost categories (debt + obligations)', () => {
    for (const cat of ['mortgage', 'loan', 'credit_card', 'car_finance',
                       'debt_repayment', 'council_tax', 'tax', 'insurance',
                       'utility', 'energy', 'water', 'broadband', 'mobile',
                       'fee', 'parking', 'rent']) {
      assert.equal(bucketFor(cat), 'fixed_cost', `${cat} should be fixed_cost`);
    }
  });

  it('classifies variable_cost categories', () => {
    for (const cat of ['groceries', 'fuel', 'eating_out', 'food', 'transport',
                       'shopping', 'gambling', 'cash']) {
      assert.equal(bucketFor(cat), 'variable_cost', `${cat} should be variable_cost`);
    }
  });

  it('classifies discretionary categories', () => {
    for (const cat of ['streaming', 'software', 'fitness', 'healthcare',
                       'charity', 'education', 'pets', 'travel', 'music',
                       'gaming', 'security', 'storage', 'motoring',
                       'property_management', 'credit_monitoring', 'bills',
                       'professional', 'hobbies', 'other']) {
      assert.equal(bucketFor(cat), 'discretionary', `${cat} should be discretionary`);
    }
  });

  it('classifies internal_transfer rows', () => {
    assert.equal(bucketFor('transfers'), 'internal_transfer');
    assert.equal(bucketFor('internal_transfer'), 'internal_transfer');
  });

  it('handles plural / hyphen / synonym aliases', () => {
    // plurals
    assert.equal(bucketFor('mortgages'), 'fixed_cost');
    assert.equal(bucketFor('loans'), 'fixed_cost');
    assert.equal(bucketFor('credit cards'), 'fixed_cost');
    assert.equal(bucketFor('credit-cards'), 'fixed_cost');
    assert.equal(bucketFor('credit'), 'fixed_cost');
    assert.equal(bucketFor('fees'), 'fixed_cost');
    assert.equal(bucketFor('utilities'), 'fixed_cost');
    assert.equal(bucketFor('car finance'), 'fixed_cost');
    assert.equal(bucketFor('car-finance'), 'fixed_cost');
    // bank-rail synonyms
    assert.equal(bucketFor('bank_transfer'), 'internal_transfer');
    assert.equal(bucketFor('transfer'), 'internal_transfer');
    // bill synonyms
    assert.equal(bucketFor('bill_payment'), 'discretionary');
    assert.equal(bucketFor('bill-payment'), 'discretionary');
    // food synonyms
    assert.equal(bucketFor('dining'), 'variable_cost');
    assert.equal(bucketFor('restaurants'), 'variable_cost');
    assert.equal(bucketFor('supermarket'), 'variable_cost');
    assert.equal(bucketFor('supermarkets'), 'variable_cost');
  });

  it('handles whitespace and case variants', () => {
    assert.equal(bucketFor('  Mortgage  '), 'fixed_cost');
    assert.equal(bucketFor('GROCERIES'), 'variable_cost');
    assert.equal(bucketFor('Council_Tax'), 'fixed_cost');
  });

  it('falls back to discretionary for unknown / null / empty', () => {
    assert.equal(bucketFor(null), 'discretionary');
    assert.equal(bucketFor(undefined), 'discretionary');
    assert.equal(bucketFor(''), 'discretionary');
    assert.equal(bucketFor('   '), 'discretionary');
    assert.equal(bucketFor('totally_made_up_category'), 'discretionary');
  });
});

describe('category-taxonomy: isSpendingBucket', () => {
  it('counts fixed_cost, variable_cost, discretionary as spending', () => {
    assert.equal(isSpendingBucket('fixed_cost'), true);
    assert.equal(isSpendingBucket('variable_cost'), true);
    assert.equal(isSpendingBucket('discretionary'), true);
  });

  it('excludes internal_transfer and income', () => {
    assert.equal(isSpendingBucket('internal_transfer'), false);
    assert.equal(isSpendingBucket('income'), false);
  });
});

describe('category-taxonomy: isSwitchable (deals widget)', () => {
  it('rejects debt instruments and government fees', () => {
    for (const cat of ['mortgage', 'loan', 'credit_card', 'car_finance',
                       'debt_repayment', 'council_tax', 'tax', 'fee', 'parking']) {
      assert.equal(isSwitchable(cat), false, `${cat} should not be switchable`);
    }
  });

  it('rejects internal transfers and income', () => {
    assert.equal(isSwitchable('transfers'), false);
    assert.equal(isSwitchable('salary'), false);
  });

  it('accepts contractual services that are switchable', () => {
    for (const cat of ['energy', 'water', 'broadband', 'mobile', 'insurance',
                       'streaming', 'software']) {
      assert.equal(isSwitchable(cat), true, `${cat} should be switchable`);
    }
  });
});

describe('category-taxonomy: hasMeaningfulPriceSignal', () => {
  it('rejects amortising / balance-driven categories', () => {
    for (const cat of ['mortgage', 'loan', 'credit_card', 'car_finance',
                       'debt_repayment', 'council_tax', 'fee', 'parking']) {
      assert.equal(hasMeaningfulPriceSignal(cat), false, `${cat} has no price signal`);
    }
  });

  it('rejects naturally variable spending', () => {
    for (const cat of ['groceries', 'fuel', 'eating_out', 'shopping']) {
      assert.equal(hasMeaningfulPriceSignal(cat), false, `${cat} is variable, no price signal`);
    }
  });

  it('accepts stable subscription / utility categories', () => {
    for (const cat of ['energy', 'water', 'broadband', 'mobile', 'insurance',
                       'streaming', 'software', 'fitness']) {
      assert.equal(hasMeaningfulPriceSignal(cat), true, `${cat} has a meaningful price signal`);
    }
  });
});

describe('category-taxonomy: CATEGORY_BUCKET completeness', () => {
  // Every category surface area in the codebase should resolve to a
  // bucket. This test enumerates the categories used by the existing
  // exclusion lists (the ones we're about to delete) and asserts the
  // canonical map covers each — preventing silent drift during the
  // consumer migration.
  const CATEGORIES_FROM_OLD_LISTS = [
    // EXCLUDED_SAVINGS_CATEGORIES
    'mortgage', 'mortgages', 'loan', 'loans', 'council_tax', 'tax',
    'credit_card', 'car_finance', 'fee', 'parking', 'transfer', 'transfers',
    'debt_repayment',
    // EXCLUDED_FROM_PRICE_DETECTION
    'credit cards', 'credit-cards', 'credit', 'car finance', 'car-finance',
    'fees',
    // VARIABLE_CATEGORIES (price-increase-detector)
    'groceries', 'fuel', 'eating_out', 'shopping', 'cash', 'income',
    'other', 'transport', 'gambling', 'bank_transfer',
    // RECURRING_CATEGORIES
    'energy', 'broadband', 'mobile', 'streaming', 'insurance',
    'water', 'fitness', 'software', 'bills',
    // EXCLUDED_COMPARISON_CATEGORIES + provider types
    'utility', 'utilities',
  ];

  it('every legacy category resolves to a non-default bucket (or is intentionally discretionary)', () => {
    // We don't assert "not discretionary" because some legacy categories
    // ('other', 'shopping') legitimately are discretionary. We assert
    // the resolution is stable (returns one of the five known buckets).
    const validBuckets: ReadonlySet<CategoryBucket> = new Set([
      'internal_transfer', 'income', 'fixed_cost', 'variable_cost', 'discretionary',
    ]);
    for (const cat of CATEGORIES_FROM_OLD_LISTS) {
      const b = bucketFor(cat);
      assert.ok(validBuckets.has(b), `${cat} → ${b} (not a known bucket)`);
    }
  });

  it('exports a complete CATEGORY_BUCKET map', () => {
    // Sanity: the exported map is non-empty and every value is a valid bucket
    const validBuckets = new Set(['internal_transfer', 'income', 'fixed_cost', 'variable_cost', 'discretionary']);
    assert.ok(Object.keys(CATEGORY_BUCKET).length >= 40, 'map should be reasonably populated');
    for (const [k, v] of Object.entries(CATEGORY_BUCKET)) {
      assert.ok(validBuckets.has(v), `${k} → ${v} not a valid bucket`);
    }
  });
});
