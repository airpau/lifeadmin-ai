// Run: node --experimental-strip-types --test src/lib/category-config.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubscriptionCategory, getCategoryLabel, categoryMatchesFilterGroup } from './category-config.ts';

describe('subscription category rendering', () => {
  it('falls back to category_normalized when category is empty or generic', () => {
    assert.equal(resolveSubscriptionCategory(null, 'mobile'), 'mobile');
    assert.equal(resolveSubscriptionCategory('other', 'mobile'), 'mobile');
    assert.equal(resolveSubscriptionCategory(null, 'mortgages'), 'mortgage');
    assert.equal(resolveSubscriptionCategory('other', null), 'other');
    assert.equal(resolveSubscriptionCategory(null, null), null);
  });

  it('canonicalises case and aliases so labels render, not raw keys', () => {
    assert.equal(resolveSubscriptionCategory('Streaming'), 'streaming');
    assert.equal(resolveSubscriptionCategory('loans'), 'loan');
    assert.equal(resolveSubscriptionCategory('Internet', 'broadband'), 'broadband');
    assert.equal(getCategoryLabel(resolveSubscriptionCategory('Internet')!), 'Broadband');
    assert.equal(getCategoryLabel('tv'), 'TV');
    assert.equal(getCategoryLabel('sports'), 'Fitness & Gym');
  });

  it('resolved categories land in the right filter chip', () => {
    assert.equal(categoryMatchesFilterGroup(resolveSubscriptionCategory(null, 'mobile'), 'mobile'), true);
    assert.equal(categoryMatchesFilterGroup(resolveSubscriptionCategory('Internet'), 'broadband_tv'), true);
  });
});
