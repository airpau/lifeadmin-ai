// src/lib/merchant-normalise.test.ts
//
// Unit tests for the shared merchant-name normaliser. Run with Node's
// built-in test runner (same pattern as src/lib/category-taxonomy.test.ts):
//
//   node --experimental-strip-types --test src/lib/merchant-normalise.test.ts
//
// normaliseMerchantName() is the display name every consumer surface shows
// (Money Hub, spending, deals, reports, chatbot, Telegram bot). A regression
// here shows raw bank gibberish to users, so the raw payloads called out in
// the 28 Mar site audit are pinned below.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseMerchantName } from './merchant-normalise.ts';

describe('normaliseMerchantName — raw payloads from the site audit', () => {
  it('resolves PayPal-wrapped names with concatenated reference numbers', () => {
    assert.equal(normaliseMerchantName('PAYPAL *DISNEYPLUS35314369001'), 'Disney+');
    assert.equal(normaliseMerchantName('PAYPAL *WWW.PLEX.TV'), 'Plex');
    assert.equal(normaliseMerchantName('PAYPAL *LEBARA'), 'Lebara');
  });

  it('resolves the raw names reported on the Regular Payments cards', () => {
    assert.equal(normaliseMerchantName('LENDINVEST BTL LTD'), 'LendInvest (Mortgage)');
    assert.equal(normaliseMerchantName('COMMUNITYFIBRE LTD'), 'Community Fibre');
    assert.equal(normaliseMerchantName('SKIPTON B.S.'), 'Skipton Building Society');
  });

  it('resolves the overrides that previously only existed in merchant-utils', () => {
    assert.equal(normaliseMerchantName('ENERGIE FI'), 'énergie Fitness');
    assert.equal(normaliseMerchantName('B/CARD PLAT'), 'Barclaycard Platinum Visa');
    assert.equal(normaliseMerchantName('DVLA-A15EYP'), 'DVLA');
    assert.equal(normaliseMerchantName('LBH'), 'LB Hounslow Council Tax');
    assert.equal(normaliseMerchantName('TESTVALLEY'), 'Test Valley Council Tax');
  });

  it('resolves Amazon marketplace payloads once the AMZN prefix is stripped', () => {
    assert.equal(normaliseMerchantName('AMZN MKTP UK*2B4XY'), 'Amazon');
    assert.equal(normaliseMerchantName('AMAZON PRIME*2B4XY'), 'Amazon Prime');
  });
});

describe('normaliseMerchantName — banking references', () => {
  it('detects account references before the digits are stripped as a reference number', () => {
    assert.equal(normaliseMerchantName('A/C 12345678'), 'Account Transfer');
    assert.equal(normaliseMerchantName('A/C XXXXXXXX'), 'Account Transfer');
  });

  it('still detects the amount-bearing and worded banking references', () => {
    assert.equal(normaliseMerchantName('A/C £334.17'), 'Account Interest');
    assert.equal(normaliseMerchantName('19MAR26 A/C £334.17'), 'Account Interest');
    assert.equal(normaliseMerchantName('CR INTEREST'), 'Credit Interest');
    assert.equal(normaliseMerchantName('DR INT'), 'Debit Interest');
    assert.equal(normaliseMerchantName('ARRANGED O/D FEE'), 'Overdraft Fee');
    assert.equal(normaliseMerchantName('BALANCE TRANSFER'), 'Balance Transfer');
  });
});

describe('normaliseMerchantName — existing behaviour is unchanged', () => {
  it('keeps stripping card prefixes, dates and trailing references', () => {
    assert.equal(normaliseMerchantName('TESCO STORES 3456'), 'Tesco');
    assert.equal(normaliseMerchantName('MCDONALDS 1234'), "McDonald's");
    assert.equal(normaliseMerchantName('SPOTIFY UK'), 'Spotify');
    assert.equal(normaliseMerchantName('THAMES WATER UTIL'), 'Thames Water');
  });

  it('keeps resolving the known brand map', () => {
    assert.equal(normaliseMerchantName('NETFLIX.COM'), 'Netflix');
    assert.equal(normaliseMerchantName('SKY DIGITAL'), 'Sky');
    assert.equal(normaliseMerchantName('NOW TV'), 'NOW TV');
    assert.equal(normaliseMerchantName('PUREGYM LTD'), 'PureGym');
    assert.equal(normaliseMerchantName('APPLE.COM/BILL'), 'Apple');
    assert.equal(normaliseMerchantName('GOOGLE *YOUTUBEPREMIUM'), 'YouTube Premium');
  });

  it('falls back to title case and never returns an empty label', () => {
    assert.equal(normaliseMerchantName('SOME UNKNOWN SHOP'), 'Some Unknown Shop');
    assert.equal(normaliseMerchantName(''), 'Unknown');
  });
});
