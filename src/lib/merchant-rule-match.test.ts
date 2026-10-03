// src/lib/merchant-rule-match.test.ts
//
// Run: node --test --experimental-strip-types src/lib/merchant-rule-match.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  merchantRuleMatches,
  merchantRuleMatchesEitherWay,
  merchantRuleRegexSource,
} from './merchant-rule-match.ts';

describe('merchantRuleMatches: the false positives found in production', () => {
  // Each of these was a real mislabelled line on 2026-10-03.
  const accidents: Array<[string, string]> = [
    ['TFL', 'PAYPROP CLIENT ACCRENTFLAT1         FP 01/10/26 1342'],
    ['TFL', 'SDM PROPERTY LTD  RENTFLAVIO        FP 11/06/26'],
    ['TFL', 'NETFLIX.COM'],
    ['RAC', 'TRACEY  ANN PARRY ENERGIE SEP 26'],
    ['RAC', 'RACHEL HUDSON     ENERGIE SEP 2026'],
    ['EE', 'WB FLEET N STRBUCK'],
    ['RING', 'RANOUSH CATERING L'],
    ['RING', 'RINGGO PARKING    MYRINGGO.COUK'],
    ['SSE', 'INVESTEC ASSET FIN'],
    ['ICO', '6790 10JUL26      TICOMBO GMBH      BERLIN D'],
    ['BT', 'PAUL AIREY        337FE33F30E44F8EABTPP SANT'],
    ['BP', '9384 17FEB26 C    GATE RETAIL WIZZ  GBP'],
    ['AA', 'SQUARE            T3M4FAAY0AM1RA0'],
    ['APPLE', 'Pearl Appleby     Energie'],
    ['BULB', 'SP EASY LIGHBULBS BALDOCK'],
    ['ESSO', 'NUMAN SAJJAD      Dema Lessons      VIA MOBI'],
    ['O2', 'MICHAEL HOLMES    6 WOODSTOCK, SO23 FP 15/09'],
  ];
  for (const [rule, line] of accidents) {
    it(`"${rule}" does not match "${line.trim()}"`, () => {
      assert.equal(merchantRuleMatches(rule, line), false);
    });
  }
});

describe('merchantRuleMatches: short rules still match the real thing', () => {
  const genuine: Array<[string, string]> = [
    ['TFL', '7209 25MAY26 CD   TFL TRAVEL CH     TFL.GOV.UK'],
    ['TFL', '9384 19JUL26      ZILCH TFL ROAD    CHG-PEN'],
    ['RAC', 'RAC MOTORING SERVICES'],
    ['EE', 'EE LIMITED        DD'],
    ['BT', 'BT GROUP PLC'],
    ['O2', 'O2 UK PAY MONTHLY'],
    ['BP', 'BP CONNECT HODDESDON'],
    ['BP ', 'BP CONNECT HODDESDON'], // stored with a trailing space
    ['APPLE', 'APPLE.COM/BILL    ITUNES.COM'],
    ['SKY', 'SKY DIGITAL       DD'],
    ['M&S', 'M&S SIMPLY FOOD'],
    ['B&Q', '1234 01JAN26      B&Q 1234          WARE'],
  ];
  for (const [rule, line] of genuine) {
    it(`"${rule.trim()}" matches "${line.trim()}"`, () => {
      assert.equal(merchantRuleMatches(rule, line), true);
    });
  }

  it('treats punctuation and underscores as word breaks', () => {
    assert.equal(merchantRuleMatches('TFL', 'PAYPAL *TFL'), true);
    assert.equal(merchantRuleMatches('TFL', 'CARD_TFL_TRAVEL'), true);
    assert.equal(merchantRuleMatches('EE', '(EE) TOPUP'), true);
  });
});

describe('merchantRuleMatches: longer rules tolerate run-together bank fields', () => {
  // Real, correct matches that a whole-word test would throw away.
  const runOn: Array<[string, string]> = [
    ['AIRBNB PAYMENTS UK', '6790 25SEP26      AIRBNB PAYMENTS UKLONDON'],
    ['SAINSBURY', 'SAINSBURYS- CHISWI'],
    ['GOOGLE ONE', 'GOOGLE *GOOGLE ONE8888888888'],
    ['YELLOW CAR DRIVER', 'YELLOW CAR DRIVERINV-0191          VIA MOBIL'],
    ['VODAFONE', 'PAYPAL *VODAFONELI'],
    ['WAITROSE', '7209 02JUL26 CD   WELCOME B/WAITROSESOUTH MI'],
    ['NETFLIX', 'NETFLIX.COM       AMSTERDAM'],
  ];
  for (const [rule, line] of runOn) {
    it(`"${rule}" matches "${line.trim()}"`, () => {
      assert.equal(merchantRuleMatches(rule, line), true);
    });
  }

  it('but a longer rule still has to START at a word', () => {
    assert.equal(merchantRuleMatches('NETFLIX', 'XNETFLIX'), false);
    assert.equal(merchantRuleMatches('VODAFONE', 'NOTVODAFONE LTD'), false);
  });

  it('matches a multi-word rule across a run of spaces', () => {
    assert.equal(merchantRuleMatches('SDM PROPERTY', 'SDM   PROPERTY LTD  OLAF'), true);
  });
});

describe('merchantRuleMatches: degenerate input', () => {
  it('never matches on an empty or one-character rule', () => {
    assert.equal(merchantRuleMatches('', 'ANYTHING'), false);
    assert.equal(merchantRuleMatches(' ', 'ANYTHING'), false);
    assert.equal(merchantRuleMatches('E', 'E'), false);
    assert.equal(merchantRuleMatches(null, 'ANYTHING'), false);
    assert.equal(merchantRuleRegexSource('x'), null);
  });

  it('never matches empty text', () => {
    assert.equal(merchantRuleMatches('TFL', ''), false);
    assert.equal(merchantRuleMatches('TFL', null), false);
  });

  it('treats regex metacharacters in a rule as literals', () => {
    assert.equal(merchantRuleMatches('APPLE.COM/BILL', 'APPLE.COM/BILL 0800'), true);
    assert.equal(merchantRuleMatches('APPLE.COM/BILL', 'APPLEXCOM/BILL'), false);
    assert.equal(merchantRuleMatches('A+B (UK)', 'A+B (UK) LTD'), true);
    assert.doesNotThrow(() => merchantRuleMatches('[*?', 'whatever'));
  });
});

describe('merchantRuleMatchesEitherWay', () => {
  it('matches a rule that is longer than the normalised line', () => {
    assert.equal(merchantRuleMatchesEitherWay('netflix.com', 'netflix'), true);
  });

  it('does not bring the substring problem back from the other side', () => {
    // The line "ee" must not match a rule merely because the rule
    // contains those letters.
    assert.equal(merchantRuleMatchesEitherWay('coffee republic', 'ee'), false);
    assert.equal(merchantRuleMatchesEitherWay('tfl', 'payprop client accrentflat'), false);
  });
});
