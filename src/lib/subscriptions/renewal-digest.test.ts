// src/lib/subscriptions/renewal-digest.test.ts
//
// Unit tests for the renewal-digest builder. Run with Node's built-in test
// runner (matches src/lib/category-taxonomy.test.ts):
//
//   node --experimental-strip-types --test src/lib/subscriptions/renewal-digest.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRenewalAmount,
  tierWindowDays,
  buildRenewalDigest,
} from './renewal-digest.ts';

describe('formatRenewalAmount', () => {
  it('renders a monthly amount with /mo and a correct monthly equivalent', () => {
    const r = formatRenewalAmount(12.99, 'monthly');
    assert.equal(r.display, '£12.99/mo');
    assert.equal(r.monthly, 12.99);
  });

  it('converts yearly to a monthly equivalent and labels /yr', () => {
    const r = formatRenewalAmount(540, 'yearly');
    assert.equal(r.display, '£540.00/yr');
    assert.equal(r.monthly, 45);
  });

  it('converts quarterly to a monthly equivalent', () => {
    const r = formatRenewalAmount(30, 'quarterly');
    assert.equal(r.display, '£30.00/qtr');
    assert.equal(r.monthly, 10);
  });

  it('does NOT fabricate /month for an unknown cycle (the council-tax bug)', () => {
    // A council-tax annual balance stored with a null cycle must not render
    // as "£2278.93/month".
    const r = formatRenewalAmount(2278.93, null);
    assert.equal(r.display, '£2278.93');
    assert.equal(r.monthly, 2278.93);
  });

  it('handles a loan balance with no cycle', () => {
    const r = formatRenewalAmount(4690.11, undefined);
    assert.equal(r.display, '£4690.11');
  });

  it('treats a NaN/garbage amount as £0.00', () => {
    const r = formatRenewalAmount(Number('not-a-number'), 'monthly');
    assert.equal(r.display, '£0.00/mo');
    assert.equal(r.monthly, 0);
  });
});

describe('tierWindowDays', () => {
  it('gives 30 days lead for >= £50/mo', () => {
    assert.equal(tierWindowDays(50), 30);
    assert.equal(tierWindowDays(120), 30);
  });
  it('gives 7 days lead for £10-50/mo', () => {
    assert.equal(tierWindowDays(10), 7);
    assert.equal(tierWindowDays(49.99), 7);
  });
  it('gives 3 days lead for < £10/mo', () => {
    assert.equal(tierWindowDays(9.99), 3);
    assert.equal(tierWindowDays(0), 3);
  });
});

describe('buildRenewalDigest', () => {
  it('builds a single-renewal message without numbering', () => {
    const d = buildRenewalDigest([
      { providerName: 'Netflix', amountDisplay: '£12.99/mo', daysLeft: 3 },
    ]);
    assert.match(d.whatsapp, /Netflix/);
    assert.match(d.whatsapp, /renews in 3 days/);
    assert.match(d.whatsapp, /Reply CANCEL to draft/);
    assert.doesNotMatch(d.whatsapp, /\(1\)/);
  });

  it('numbers a multi-renewal digest and keeps the WhatsApp copy single-line', () => {
    const d = buildRenewalDigest([
      { providerName: 'Broxbourne BC', amountDisplay: '£2278.93', daysLeft: 3 },
      { providerName: 'HSBC Loans', amountDisplay: '£4690.11', daysLeft: 3 },
      { providerName: 'Charge Security Gtee', amountDisplay: '£10.00/mo', daysLeft: 7 },
    ]);
    // WhatsApp body must be flattened (no raw newlines — Twilio 21656).
    assert.ok(!d.whatsapp.includes('\n'));
    assert.match(d.whatsapp, /You have 3 renewals/);
    assert.match(d.whatsapp, /\(1\) Broxbourne BC/);
    assert.match(d.whatsapp, /\(3\) Charge Security Gtee/);
    assert.match(d.whatsapp, /CANCEL 1, CANCEL 2/);
    // No fabricated "/month" on the unknown-cycle balances.
    assert.doesNotMatch(d.whatsapp, /2278\.93\/month/);
    // Telegram copy IS multi-line and numbered.
    assert.match(d.telegram, /1\. Broxbourne BC/);
    assert.ok(d.telegram.includes('\n'));
  });
});
