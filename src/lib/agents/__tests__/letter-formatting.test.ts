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
