// src/lib/legal-refs-authority.test.ts
//
// Tests for the UK legal-authority allowlist used by the compliance
// pipeline.
//
// Run with:
//   node --experimental-strip-types --test src/lib/legal-refs-authority.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkUkLegalAuthority } from './legal-refs-authority.ts';

describe('checkUkLegalAuthority — primary authority', () => {
  it('legislation.gov.uk path → authority', () => {
    const r = checkUkLegalAuthority(
      'https://www.legislation.gov.uk/ukpga/1974/39/contents',
    );
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'authority');
    assert.equal(r.matched_domain, 'legislation.gov.uk');
  });

  it('plain legislation.gov.uk root → authority', () => {
    const r = checkUkLegalAuthority(
      'https://legislation.gov.uk/ukpga/1974/39',
    );
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'authority');
  });

  it('www.fca.org.uk → authority', () => {
    const r = checkUkLegalAuthority('https://www.fca.org.uk/firms/handbook');
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'authority');
  });

  it('handbook.fca.org.uk → authority', () => {
    const r = checkUkLegalAuthority(
      'https://handbook.fca.org.uk/handbook/CONC/5/3.html',
    );
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'authority');
  });

  it('financial-ombudsman.org.uk → authority', () => {
    const r = checkUkLegalAuthority(
      'https://www.financial-ombudsman.org.uk/consumers/complaints-can-help',
    );
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'authority');
  });

  it('hmrc.gov.uk via gov.uk parent → authority', () => {
    const r = checkUkLegalAuthority(
      'https://www.hmrc.gov.uk/some-page',
    );
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'authority');
  });

  it('bailii.org case → authority', () => {
    const r = checkUkLegalAuthority(
      'https://www.bailii.org/uk/cases/UKSC/2023/1.html',
    );
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'authority');
  });
});

describe('checkUkLegalAuthority — rejected', () => {
  it('ukfinance.org.uk → rejected (trade body)', () => {
    const r = checkUkLegalAuthority('https://www.ukfinance.org.uk/something');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'rejected');
  });

  it('en.wikipedia.org → rejected', () => {
    const r = checkUkLegalAuthority(
      'https://en.wikipedia.org/wiki/Section_75',
    );
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'rejected');
  });

  it('moneysavingexpert.com → rejected', () => {
    const r = checkUkLegalAuthority(
      'https://www.moneysavingexpert.com/reclaim/',
    );
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'rejected');
  });

  it('which.co.uk → rejected', () => {
    const r = checkUkLegalAuthority(
      'https://www.which.co.uk/consumer-rights/article/x',
    );
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'rejected');
  });

  it('abi.org.uk → rejected (insurer trade body)', () => {
    const r = checkUkLegalAuthority('https://www.abi.org.uk/');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'rejected');
  });
});

describe('checkUkLegalAuthority — secondary', () => {
  it('citizensadvice.org.uk → secondary', () => {
    const r = checkUkLegalAuthority(
      'https://www.citizensadvice.org.uk/consumer/',
    );
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'secondary');
  });

  it('moneyhelper.org.uk → secondary', () => {
    const r = checkUkLegalAuthority(
      'https://www.moneyhelper.org.uk/en/everyday-money',
    );
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'secondary');
  });
});

describe('checkUkLegalAuthority — unrecognised', () => {
  it('random blog → unrecognised', () => {
    const r = checkUkLegalAuthority('https://random-blog.com/uk-law');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unrecognised');
  });

  it('empty / garbage → unrecognised', () => {
    assert.equal(checkUkLegalAuthority('').reason, 'unrecognised');
    assert.equal(checkUkLegalAuthority('not a url').reason, 'unrecognised');
  });
});

describe('checkUkLegalAuthority — domain-spoofing safety', () => {
  it('badactor-legislation.gov.uk.fake.com → NOT authority', () => {
    const r = checkUkLegalAuthority(
      'https://badactor-legislation.gov.uk.fake.com/spoof',
    );
    assert.notEqual(r.reason, 'authority');
  });

  it('legislation.gov.uk.evil.com → NOT authority', () => {
    const r = checkUkLegalAuthority('https://legislation.gov.uk.evil.com/x');
    assert.notEqual(r.reason, 'authority');
  });

  it('notgov.uk → NOT authority (no label boundary)', () => {
    const r = checkUkLegalAuthority('https://notgov.uk/page');
    assert.notEqual(r.reason, 'authority');
  });

  it('xukfinance.org.uk → NOT rejected as ukfinance (label-bounded regex)', () => {
    // The \b in the rejection pattern means xukfinance.org.uk does not
    // match the ukfinance.org.uk literal. It will be unrecognised.
    const r = checkUkLegalAuthority('https://xukfinance.org.uk/');
    assert.equal(r.reason, 'unrecognised');
  });
});

describe('checkUkLegalAuthority — gov.uk/blog', () => {
  it('gov.uk/blog path → rejected (commentary, not authority)', () => {
    const r = checkUkLegalAuthority(
      'https://www.gov.uk/blog/2024/01/some-post',
    );
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'rejected');
  });
});
