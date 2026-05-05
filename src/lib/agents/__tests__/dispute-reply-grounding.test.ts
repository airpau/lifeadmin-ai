// src/lib/agents/__tests__/dispute-reply-grounding.test.ts
//
// Smoke tests for the unified dispute-reply engine.
//
// Run with:
//   node --experimental-strip-types --test src/lib/agents/__tests__/dispute-reply-grounding.test.ts
//
// What this covers:
//   1. Category detection — energy back-billing thread routes to the
//      'energy' category (so the engine pulls Ofgem SLC 21B / back-bill
//      rules + Limitation Act / CRA refs from legal_references).
//   2. The Pocket Agent system prompt on BOTH Telegram AND WhatsApp
//      contains the "DRAFTING RULE" — drift-detection so a future
//      refactor that strips the rule from one surface fails CI.
//   3. The shared draft_dispute_letter tool description names the
//      legal_references compliance index (so the LLM tool-router knows
//      to call it for ALL replies, not just initial complaints).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectReplyCategories } from '../dispute-reply-categories.ts';

describe('detectReplyCategories', () => {
  it('routes an energy back-billing thread to the energy category', () => {
    const cats = detectReplyCategories({
      issueType: 'energy_dispute',
      providerType: 'energy',
      scenarioText: 'Octopus Energy sent a back-bill for 18 months of usage going back beyond the 12-month Ofgem limit. Limitation Act may also apply.',
    });
    assert.ok(cats.includes('energy'), `expected 'energy' in ${JSON.stringify(cats)}`);
    // Limitation Act / debt-style language should also pull 'debt'.
    assert.ok(cats.includes('debt') || cats.includes('finance') || cats.includes('general'),
      `expected a debt/finance/general fallback in ${JSON.stringify(cats)}`);
  });

  it('routes a Section 75 / credit-card thread to finance', () => {
    const cats = detectReplyCategories({
      issueType: 'refund_request',
      providerType: 'finance',
      scenarioText: 'Bank refused my Section 75 claim on a credit card purchase that never arrived.',
    });
    assert.ok(cats.includes('finance'), `expected 'finance' in ${JSON.stringify(cats)}`);
  });

  it('routes a broadband mid-contract rise thread to broadband', () => {
    const cats = detectReplyCategories({
      issueType: null,
      providerType: 'broadband',
      scenarioText: 'TalkTalk hiked my broadband mid-contract price rise, Ofcom GC C1 says I can exit penalty-free.',
    });
    assert.ok(cats.includes('broadband'), `expected 'broadband' in ${JSON.stringify(cats)}`);
  });
});

describe('Pocket Agent DRAFTING RULE drift detection', () => {
  it('Telegram system prompt contains the DRAFTING RULE', () => {
    const src = readFileSync(new URL('../../telegram/user-bot.ts', import.meta.url), 'utf8');
    assert.match(src, /DRAFTING RULE — NON-NEGOTIABLE/);
    assert.match(src, /draft_dispute_letter tool/);
    assert.match(src, /legal_references/);
  });

  it('WhatsApp system prompt contains the DRAFTING RULE', () => {
    const src = readFileSync(new URL('../../whatsapp/user-bot.ts', import.meta.url), 'utf8');
    assert.match(src, /DRAFTING RULE — NON-NEGOTIABLE/);
    assert.match(src, /draft_dispute_letter tool/);
    assert.match(src, /legal_references/);
  });

  it('draft_dispute_letter tool description names the legal_references compliance index', () => {
    const src = readFileSync(new URL('../../telegram/tools.ts', import.meta.url), 'utf8');
    // The tool description must promise grounding so the LLM tool-router
    // knows it produces professional-style output (not freehand prose).
    assert.match(src, /legal_references compliance index/);
  });
});
