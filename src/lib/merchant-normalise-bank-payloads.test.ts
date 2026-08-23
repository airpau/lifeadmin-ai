// src/lib/merchant-normalise-bank-payloads.test.ts
//
// Regression tests for raw bank payloads that used to surface as ugly display
// names in Money Hub / Regular Payments. Run with Node's built-in test runner:
//
//   node --experimental-strip-types --test src/lib/merchant-normalise-bank-payloads.test.ts
//
// Closes the remaining half of the Cowork site-audit item "Add 14 new
// merchant_rules for clean display names": the raw descriptors below all
// title-cased the payment rail ("So To Mr P Airey", "Sq *The Coffee Hut")
// instead of resolving to a merchant or a stable banking label.
//
// Kept in its own file rather than merchant-normalise.test.ts so it does not
// collide with the in-flight PR #519, which owns that file.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normaliseMerchantName } from './merchant-normalise.ts';

function check(cases: Array<[string, string]>) {
  for (const [raw, expected] of cases) {
    assert.equal(normaliseMerchantName(raw), expected, `${raw} should resolve to ${expected}`);
  }
}

describe('normaliseMerchantName — payment rail prefixes', () => {
  it('strips the rail and keeps the payee', () => {
    check([
      ['SO TO MR P AIREY', 'Mr P Airey'],
      ['MOBILE PYMT TO J SMITH', 'J Smith'],
      ['TFR TO SAVINGS', 'Savings'],
      ['TRANSFER FROM SAVINGS', 'Savings'],
    ]);
  });

  it('still reaches the merchant map behind the rail', () => {
    check([
      ['DIRECT DEBIT PAYMENT TO BRITISH GAS', 'British Gas'],
      ['CARD PAYMENT TO TESCO STORES', 'Tesco'],
    ]);
  });
});

describe('normaliseMerchantName — banking references with no payee', () => {
  it('maps rail-only descriptions to stable labels', () => {
    check([
      ['CHQ 000123', 'Cheque'],
      ['DD PAYMENT', 'Direct Debit'],
      ['SO REF 12345678', 'Standing Order'],
      ['BANK GIRO CREDIT', 'Bank Giro Credit'],
      ['FASTER PAYMENT RECEIVED', 'Faster Payment'],
      ['FASTER PAYMENTS RECEIPT', 'Faster Payment'],
      ['CASH WITHDRAWAL AT ATM', 'Cash Withdrawal'],
      ['ATM WITHDRAWAL HSBC', 'Cash Withdrawal'],
      ['INTERNAL TRANSFER', 'Internal Transfer'],
      ['NON-STERLING TRANS FEE', 'Non-Sterling Fee'],
      ['REF: 4567 PAYMENT', 'Payment Reference'],
      ['GBP 45.00 @ 1.00', 'Currency Conversion'],
    ]);
  });

  it('leaves the pre-existing banking references untouched', () => {
    check([
      ['ARRANGED O/D FEE', 'Overdraft Fee'],
      ['CR INTEREST', 'Credit Interest'],
      ['BALANCE TRANSFER', 'Balance Transfer'],
    ]);
  });
});

describe('normaliseMerchantName — card acquirer prefixes', () => {
  it('strips Square, SumUp and Zettle wrappers', () => {
    check([
      ['SQ *THE COFFEE HUT', 'The Coffee Hut'],
      ['SUMUP *MARKET STALL', 'Market Stall'],
      ['ZETTLE_*BAKERY', 'Bakery'],
    ]);
  });

  it('leaves the pre-existing PayPal/Google wrappers working', () => {
    check([
      ['PAYPAL *LEBARA', 'Lebara'],
      ['PAYPAL *WWW.PLEX.TV', 'Plex'],
      ['GOOGLE *YOUTUBEPREMIUM', 'YouTube Premium'],
    ]);
  });
});

describe('normaliseMerchantName — UK merchants missing from the map', () => {
  it('resolves banks, building societies and BNPL', () => {
    check([
      ['HSBC BANK PLC', 'HSBC'],
      ['AMERICAN EXPRESS', 'American Express'],
      ['AMEX PAYMENT RECEIVED', 'American Express'],
      ['NATIONWIDE B.S.', 'Nationwide Building Society'],
      ['COVENTRY B.S.', 'Coventry Building Society'],
      ['YORKSHIRE B.S.', 'Yorkshire Building Society'],
      ['KLARNA*ORDER', 'Klarna'],
      ['CLEARPAY', 'Clearpay'],
    ]);
  });

  it('resolves energy and government payees', () => {
    check([
      ['SSE ENERGY', 'SSE Energy'],
      ['TV LICENCE', 'TV Licence'],
      ['TV LICENSING', 'TV Licence'],
    ]);
  });

  // 'e.on' would otherwise swallow the Next tariff via the startsWith pass.
  it('does not collapse E.ON Next into E.ON', () => {
    check([
      ['E.ON NEXT ENERGY', 'E.ON Next'],
      ['EON NEXT', 'E.ON Next'],
    ]);
  });

  it('leaves existing building-society and mortgage names working', () => {
    check([
      ['SKIPTON B.S.', 'Skipton Building Society'],
      ['LENDINVEST BTL LTD', 'LendInvest (Mortgage)'],
      ['COMMUNITYFIBRE LTD', 'Community Fibre'],
    ]);
  });
});

describe('normaliseMerchantName — unchanged fallbacks', () => {
  it('title-cases genuinely unknown merchants', () => {
    check([
      ['SOME UNKNOWN SHOP', 'Some Unknown Shop'],
      ['TESCO STORES 3456', 'Tesco'],
      ['THAMES WATER UTIL', 'Thames Water'],
      ['MCDONALDS 1234', "McDonald's"],
      ['SOUTHERN WATER', 'Southern Water'],
    ]);
  });
});
