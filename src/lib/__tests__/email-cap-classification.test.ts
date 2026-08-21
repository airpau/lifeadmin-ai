// src/lib/__tests__/email-cap-classification.test.ts
//
// Pins WHICH email types sit under the marketing cap, and the one case where a
// message is sent in two forms depending on the cap.
//
// The rule these tests encode: the test for "transactional" is not whether the
// email contains a link, it is whether someone who opted out of ALL marketing
// would still want the message. A service message carrying an OFFER is
// marketing. A message that only tells the user something about their own
// money is not.
//
// Run with tsx, not the bare node runner — this file imports the email builder,
// which resolves a `@/lib/...` path alias that node's stripper does not honour:
//   npx tsx src/lib/__tests__/email-cap-classification.test.ts
//
// (The sibling email-cap-channel-isolation.test.ts reads source instead of
// importing it, so that one runs under either.)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildRenewalEmail } from '../email/renewal-reminders.ts';

const RATE_LIMIT_SRC = readFileSync(
  join(process.cwd(), 'src/lib/email-rate-limit.ts'),
  'utf8',
);

function listMembers(constName: string): string[] {
  const block = RATE_LIMIT_SRC.match(
    new RegExp(`const ${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`),
  );
  assert.ok(block, `could not find ${constName}`);
  return [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
}

describe('email cap classification', () => {
  const marketing = listMembers('MARKETING_EMAIL_TYPES');
  const transactional = listMembers('TRANSACTIONAL_TYPES');

  test('a type is never in both lists', () => {
    const both = marketing.filter((t) => transactional.includes(t));
    assert.deepEqual(both, [], `types classified twice: ${both.join(', ')}`);
  });

  // These carry a real offer — a provider, a price, or a deals CTA.
  for (const type of [
    'deal_alert_email',
    'targeted_deal_email',
    'price_increase_alert',
    'daily_digest',
    'weekly_money_digest',
    'contract_end_alert',
  ]) {
    test(`${type} counts toward the marketing cap`, () => {
      assert.ok(
        marketing.includes(type),
        `${type} carries an offer, so it must count toward the cap`,
      );
    });
  }

  test('overcharge_alert is exempt — losing money is not marketing', () => {
    assert.ok(
      transactional.includes('overcharge_alert'),
      'Capping "you were overcharged" means a user can miss losing money ' +
        'because a deals email took the slot that morning.',
    );
  });

  test('contract_expiry_alert is exempt while its deal fields stay null', () => {
    assert.ok(
      transactional.includes('contract_expiry_alert'),
      'contract-expiry-alerts sends no promotional content',
    );

    // The exemption is only sound while the cron sends no offer. If someone
    // wires real deal data in, this fails and the type must be reclassified.
    const cron = readFileSync(
      join(process.cwd(), 'src/app/api/cron/contract-expiry-alerts/route.ts'),
      'utf8',
    );
    for (const field of ['deal_provider', 'deal_price', 'potential_saving_monthly', 'deal_url']) {
      assert.match(
        cron,
        new RegExp(`${field}:\\s*null`),
        `contract-expiry-alerts now sends a real ${field}, so the email carries ` +
          'an offer. Move contract_expiry_alert back into MARKETING_EMAIL_TYPES.',
      );
    }
  });
});

describe('renewal reminder degrades instead of being suppressed', () => {
  const renewals = [
    {
      provider_name: 'Netflix',
      amount: 12.99,
      category: 'streaming',
      next_billing_date: '2026-09-01',
      billing_cycle: 'monthly',
      contract_type: null,
      provider_type: null,
    },
  ] as Parameters<typeof buildRenewalEmail>[1];

  test('includes the deals block when marketing is permitted', () => {
    const { html } = buildRenewalEmail('Paul', renewals, 7, { includeDeals: true });
    assert.match(html, /Better deals available/);
    assert.match(html, /See Your Personalised Deals/);
  });

  test('strips the deals block when the cap is hit', () => {
    const { html } = buildRenewalEmail('Paul', renewals, 7, { includeDeals: false });
    assert.doesNotMatch(html, /Better deals available/);
    assert.doesNotMatch(html, /See Your Personalised Deals/);
    assert.doesNotMatch(html, /dashboard\/deals/);
  });

  test('still carries the renewal warning itself when stripped', () => {
    const { subject, html } = buildRenewalEmail('Paul', renewals, 7, { includeDeals: false });
    // The 30/14/7 promise survives the strip — that is the whole point.
    assert.match(html, /Netflix/);
    assert.match(html, /12\.99/);
    assert.ok(subject.length > 0, 'subject should still be present');
  });

  test('defaults to including deals when no option is passed', () => {
    const { html } = buildRenewalEmail('Paul', renewals, 7);
    assert.match(html, /Better deals available/);
  });

  test('the cron gates the deals block, not the email payload', () => {
    const cron = readFileSync(
      join(process.cwd(), 'src/app/api/cron/renewal-reminders/route.ts'),
      'utf8',
    );
    assert.match(
      cron,
      /includeDeals\s*=\s*rateCheck\.allowed/,
      'the cap should drive includeDeals',
    );
    assert.match(
      cron,
      /buildRenewalEmail\([^)]*includeDeals[^)]*\)/,
      'the flag should reach the builder',
    );
    assert.doesNotMatch(
      cron,
      /email:\s*\w+\s*\?\s*\{\s*subject/,
      'the email payload should no longer be conditional — the warning always sends',
    );
  });
});
