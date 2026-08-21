// src/lib/__tests__/brand-spelling-guard.test.ts
//
// The daily social cron publishes straight to Facebook, Instagram and X with
// no human in the loop. Live posts have gone out reading "Parybacker" and
// "Parabacked", so a prompt rule alone is not enough — findBrandSpellingErrors
// runs after generation and before the first Graph API call.
//
// Two failure modes matter equally here:
//   1. Letting a misspelling through, which publishes under a wrong brand.
//   2. Flagging a correct caption, which skips the post for no reason. Every
//      caption says "get your money back" and ends with the required
//      "Try it free at paybacker.co.uk" CTA, so a naive check on /\w*back\w*/i
//      would reject literally every post. The false-positive tests below are
//      the ones that keep the cron running at all.
//
// Run with:
//   npx tsx src/lib/__tests__/brand-spelling-guard.test.ts

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { findBrandSpellingErrors } from '../social/brand-spelling.ts';

describe('catches the misspellings that actually shipped', () => {
  test('Parybacker', () => {
    assert.deepEqual(
      findBrandSpellingErrors('Parybacker finds your overcharges.'),
      ['Parybacker'],
    );
  });

  test('Parabacked', () => {
    assert.deepEqual(
      findBrandSpellingErrors('Get Parabacked on your side.'),
      ['Parabacked'],
    );
  });

  // "payback" is ordinary English and allowed in lower case (below), but
  // capitalised it reads as the model reaching for the brand and missing.
  for (const variant of ['Paybacked', 'PayBacker', 'Paybackr', 'Payback', 'Paybacks']) {
    test(`near-miss: ${variant}`, () => {
      const found = findBrandSpellingErrors(`${variant} writes the letter for you.`);
      assert.ok(found.includes(variant), `expected ${variant} to be flagged, got ${JSON.stringify(found)}`);
    });
  }

  test('a misspelt domain is caught', () => {
    assert.deepEqual(
      findBrandSpellingErrors('Try it free at parybacker.co.uk'),
      ['parybacker.co.uk'],
    );
  });

  test('a misspelt hashtag is caught', () => {
    assert.deepEqual(
      findBrandSpellingErrors('Sorted. #parybacker #moneysaving'),
      ['#parybacker'],
    );
  });

  test('reports each distinct offender once', () => {
    const found = findBrandSpellingErrors('Parybacker. Yes, Parybacker. Also Parabacked.');
    assert.deepEqual(found.sort(), ['Parabacked', 'Parybacker']);
  });
});

describe('does not flag a correct caption', () => {
  // A realistic post, shaped like the ones the prompt actually asks for.
  const realistic = [
    'Your broadband bill went up in April. Paybacker spotted it and drafted the',
    'challenge letter in 30 seconds, citing the exact Ofcom rule.',
    '',
    'Get your money back without the phone queue.',
    '',
    'Try it free at paybacker.co.uk',
    '',
    '#consumerrights #moneysaving #ukfinance #paybacker #TelegramBot',
  ].join('\n');

  test('the realistic caption passes clean', () => {
    assert.deepEqual(findBrandSpellingErrors(realistic), []);
  });

  test('the production fallback caption passes clean', () => {
    // The literal fallback in route.ts. If the guard ever rejects this, the
    // cron can never post at all.
    const fallback =
      'UK consumers are owed billions in unclaimed refunds. Energy overcharges, ' +
      'broadband price rises, flight delay compensation. Paybacker writes the formal ' +
      'complaint letter for you, citing exact UK law, in 30 seconds.\n\n' +
      'Try it free at paybacker.co.uk\n\n' +
      '#consumerrights #fintech #moneysaving #ukfinance #paybacker';
    assert.deepEqual(findBrandSpellingErrors(fallback), []);
  });

  // Ordinary English. These are the false positives that would silently stop
  // the cron posting if the check were literal.
  for (const phrase of [
    'get your money back',
    'we have your back',
    'backdated to April',
    'a cashback offer',
    'in the background',
    'send us feedback',
    'a chargeback through your bank',
    'backed by UK consumer law',
  ]) {
    test(`ordinary English: "${phrase}"`, () => {
      assert.deepEqual(
        findBrandSpellingErrors(`Paybacker helps. ${phrase}. Try it free at paybacker.co.uk`),
        [],
      );
    });
  }

  // Lower-case "payback" is ordinary English, and likely copy for a refunds
  // product. Case is what separates it from a botched brand name.
  for (const phrase of [
    'the payback is immediate',
    'paybacks like this add up',
    'average payback of £180 a year',
  ]) {
    test(`lower-case payback is allowed: "${phrase}"`, () => {
      assert.deepEqual(
        findBrandSpellingErrors(`Paybacker helps. ${phrase}. Try it free at paybacker.co.uk`),
        [],
      );
    });
  }

  test('#payback hashtag is allowed', () => {
    assert.deepEqual(findBrandSpellingErrors('Sorted. #payback #moneysaving'), []);
  });

  test('#MoneyBack is allowed — a real hashtag from the live page', () => {
    // Taken verbatim from the 24 Apr 2026 Facebook post. An earlier version of
    // this guard flagged it, which would have skipped a perfectly good caption.
    assert.deepEqual(
      findBrandSpellingErrors('#Paybacker #AIDisputes #ConsumerRightsUK #Ofcom #MoneyBack'),
      [],
    );
  });

  test('the lowercase domain is not mistaken for prose', () => {
    assert.deepEqual(findBrandSpellingErrors('Visit paybacker.co.uk today'), []);
  });

  test('a full URL is not mistaken for prose', () => {
    assert.deepEqual(findBrandSpellingErrors('See https://paybacker.co.uk/dashboard now'), []);
  });

  test('the hashtag is accepted in any casing', () => {
    assert.deepEqual(findBrandSpellingErrors('#paybacker #Paybacker #PAYBACKER'), []);
  });

  test('empty caption is clean', () => {
    assert.deepEqual(findBrandSpellingErrors(''), []);
  });
});
