// src/lib/agents/__tests__/letter-formatting.test.ts
//
// Smoke tests for the post-generation letter cleanup pipeline:
//   1. stripMarkdownEmphasis — removes ** / * / __ / _ / backticks
//      from the letter body so WhatsApp + email + PDF + print all
//      render the same plain text the user can copy-paste.
//   2. stripSenderAddressBlock — drops the customer's home/postal
//      address from the top of the letter for privacy. The merchant
//      gets the account/reference number; never the user's home.
//   3. stripLetterFormatting — the combined pipeline used by the
//      engine before returning to every caller.
//
// Run with:
//   node --experimental-strip-types --test \
//     src/lib/agents/__tests__/letter-formatting.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripMarkdownEmphasis,
  stripSenderAddressBlock,
  stripLetterFormatting,
  reorderHeaderToTop,
} from '../letter-formatting.ts';

describe('stripMarkdownEmphasis', () => {
  it('removes **bold** asterisks', () => {
    assert.equal(stripMarkdownEmphasis('I am **writing** to dispute'), 'I am writing to dispute');
  });
  it('removes single *italic* asterisks', () => {
    assert.equal(stripMarkdownEmphasis('charge of *£85.00* on'), 'charge of £85.00 on');
  });
  it('removes __bold__ underscores', () => {
    assert.equal(stripMarkdownEmphasis('Section __75__ of'), 'Section 75 of');
  });
  it('removes _italic_ underscores', () => {
    assert.equal(stripMarkdownEmphasis('the _Consumer Rights Act_ 2015'), 'the Consumer Rights Act 2015');
  });
  it('removes `inline code` backticks', () => {
    assert.equal(stripMarkdownEmphasis('use `Re:` prefix'), 'use Re: prefix');
  });
  it('leaves plain text untouched', () => {
    const plain = 'Dear Octopus Energy Customer Services,\n\nI am writing to dispute charge.';
    assert.equal(stripMarkdownEmphasis(plain), plain);
  });
});

describe('stripSenderAddressBlock', () => {
  it('drops a leading address block when a UK postcode appears before the date', () => {
    const letter = [
      'Paul Airey',
      '12 Example Road',
      'London SW1A 1AA',
      '',
      '1 May 2026',
      '',
      'Octopus Energy Customer Services',
      'Re: Account 123456',
      '',
      'Dear Octopus Energy Customer Services,',
    ].join('\n');
    const out = stripSenderAddressBlock(letter);
    assert.ok(!/SW1A 1AA/.test(out), 'postcode should be removed');
    assert.ok(!/Example Road/.test(out), 'street should be removed');
    assert.ok(/Re: Account 123456/.test(out), 're: line preserved');
    assert.ok(/Dear Octopus/.test(out), 'salutation preserved');
  });
  it('leaves output untouched when there is no postcode in the head', () => {
    const letter = '1 May 2026\n\nDear Octopus,\n\nBody.';
    assert.equal(stripSenderAddressBlock(letter), letter);
  });

  it('treats ISO numeric date (YYYY-MM-DD) as an anchor and preserves the date line', () => {
    const letter = [
      'Paul Airey',
      '12 Example Road',
      'London SW1A 1AA',
      '',
      '2026-05-01',
      '',
      'Dear Octopus Energy,',
    ].join('\n');
    const out = stripSenderAddressBlock(letter);
    assert.ok(!/SW1A 1AA/.test(out), 'postcode removed');
    assert.ok(!/Example Road/.test(out), 'street removed');
    assert.ok(/2026-05-01/.test(out), 'ISO date preserved');
    assert.ok(/Dear Octopus/.test(out), 'salutation preserved');
  });

  it('treats UK slash numeric date (DD/MM/YYYY) as an anchor and preserves the date line', () => {
    const letter = [
      'Paul Airey',
      '12 Example Road',
      'London SW1A 1AA',
      '',
      '01/05/2026',
      '',
      'Dear Octopus Energy,',
    ].join('\n');
    const out = stripSenderAddressBlock(letter);
    assert.ok(!/SW1A 1AA/.test(out), 'postcode removed');
    assert.ok(/01\/05\/2026/.test(out), 'slash date preserved');
    assert.ok(/Dear Octopus/.test(out), 'salutation preserved');
  });

  it('treats short UK slash numeric date (D/M/YYYY) as an anchor', () => {
    const letter = [
      'Paul Airey',
      '12 Example Road',
      'London SW1A 1AA',
      '',
      '1/5/2026',
      '',
      'Dear Octopus Energy,',
    ].join('\n');
    const out = stripSenderAddressBlock(letter);
    assert.ok(!/SW1A 1AA/.test(out), 'postcode removed');
    assert.ok(/1\/5\/2026/.test(out), 'short slash date preserved');
    assert.ok(/Dear Octopus/.test(out), 'salutation preserved');
  });

  it('treats UK dot numeric date (DD.MM.YYYY) as an anchor and preserves the date line', () => {
    const letter = [
      'Paul Airey',
      '12 Example Road',
      'London SW1A 1AA',
      '',
      '01.05.2026',
      '',
      'Dear Octopus Energy,',
    ].join('\n');
    const out = stripSenderAddressBlock(letter);
    assert.ok(!/SW1A 1AA/.test(out), 'postcode removed');
    assert.ok(/01\.05\.2026/.test(out), 'dot date preserved');
    assert.ok(/Dear Octopus/.test(out), 'salutation preserved');
  });
});

describe('stripLetterFormatting (combined)', () => {
  it('produces output with no asterisks, no underscores, no backticks, no postcode', () => {
    const dirty = [
      'Paul Airey',
      '12 Example Road',
      'London SW1A 1AA',
      '',
      '1 May 2026',
      '',
      'Octopus Energy Customer Services',
      'Re: **Account 123456**',
      '',
      'Dear Octopus Energy Customer Services,',
      '',
      'I am writing to dispute the *£85.00* charge under the _Consumer Rights Act_ 2015.',
    ].join('\n');
    const clean = stripLetterFormatting(dirty);
    assert.ok(!/\*/.test(clean), 'no asterisks');
    // Underscores between words could be legitimate in some contexts, so
    // we only check the emphasis-pair patterns are gone.
    assert.ok(!/_Consumer/.test(clean), 'no underscore-italic');
    assert.ok(!/SW1A 1AA/.test(clean), 'no postcode');
    assert.ok(/Account 123456/.test(clean), 'account number preserved');
    assert.ok(/Dear Octopus/.test(clean), 'salutation preserved');
    assert.ok(/£85\.00/.test(clean), 'amount preserved');
  });
});

describe('reorderHeaderToTop', () => {
  it('moves a date+recipient+Re:+Dear header from the end to the top', () => {
    // Mirrors the OneStream draft on 2026-05-01 where the LLM put the
    // body first and the header block last, so the user got the letter
    // opening in the LAST WhatsApp chunk instead of the first.
    const wrong = [
      'You have framed your calculation around 1.5 months of service charges, but this bears no relationship to the actual disruption.',
      '',
      'Although OneStream has chosen to opt out of the Ofcom Automatic Compensation Scheme, the scheme rate remains the appropriate benchmark.',
      '',
      'I am therefore requesting a revised settlement within fourteen days. If I do not receive an adequate response I will refer to CISAS.',
      '',
      'Yours faithfully,',
      'Paul',
      '',
      '1 May 2026',
      '',
      'OneStream Broadband',
      'Customer Relations Department',
      '',
      'Re: Rejection of £135 offer — accounts Flat 1 and Flat 2',
      '',
      'Dear Sir or Madam,',
      '',
      'Further to your message of 30 April 2026, I am writing to reject your revised offer of £135.',
    ].join('\n');
    const out = reorderHeaderToTop(wrong);
    const paras = out.split(/\n\n+/);
    // Date opens the letter
    assert.match(paras[0], /1 May 2026/, 'first paragraph is the date');
    // Header block (date through salutation) sits at the top, in order, before any body
    const headerSpan = paras.slice(0, 5).join('\n\n');
    assert.match(headerSpan, /1 May 2026/);
    assert.match(headerSpan, /OneStream Broadband/);
    assert.match(headerSpan, /Re: Rejection/);
    assert.match(headerSpan, /Dear Sir or Madam/);
    // Salutation comes BEFORE the body content that mentions £135 / CRA / CISAS
    const salutationPos = out.indexOf('Dear Sir or Madam');
    const bodyPos = out.indexOf('You have framed your calculation');
    assert.ok(salutationPos < bodyPos, 'salutation must appear before the body');
    assert.match(out, /Yours faithfully/, 'sign-off preserved somewhere in letter');
  });

  it('leaves a correctly ordered letter unchanged', () => {
    const correct = [
      '1 May 2026',
      '',
      'OneStream Broadband',
      '',
      'Re: account 12345',
      '',
      'Dear Sir or Madam,',
      '',
      'I am writing to dispute the charge.',
      '',
      'Yours faithfully,',
      'Paul',
    ].join('\n');
    assert.equal(reorderHeaderToTop(correct), correct);
  });

  it('does not move a body paragraph that merely says "Dear customer" with no date or Re:', () => {
    const text = [
      'Opening paragraph.',
      '',
      'Dear customer note: this is a body paragraph with a salutation-shaped phrase but no date or Re: line.',
    ].join('\n');
    assert.equal(reorderHeaderToTop(text), text);
  });

  it('returns short / single-paragraph input untouched', () => {
    assert.equal(reorderHeaderToTop(''), '');
    assert.equal(reorderHeaderToTop('Just one paragraph.'), 'Just one paragraph.');
  });
});
