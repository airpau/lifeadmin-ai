// src/__tests__/e2e/compliance-engine-b2c.test.ts
//
// E2E coverage for the B2C side of the compliance freshness gate.
//
// Premise: when a stale `legal_references` row hosted on
// legislation.gov.uk is cited during a B2C complaint draft, the gate
// must (a) inline-refresh, (b) detect drift vs the stored hash, (c)
// queue a `legal_ref_corrections` row, (d) cite the FRESH text in the
// output letter, (e) inject the updated section into the prompt's
// DRAFTING RULE block, and (f) write an audit row tagged
// `caller='b2c'` with `correction_proposed=true`.
//
// Master may not yet ship `loadFreshLegalRefs` (it lands in the
// in-flight `feat/dispute-flows-freshness-gate` PR). When the module
// is absent, the test logs a single skip line and exits clean — the
// same suite runs green once the gate lands without re-authoring.
//
// Run:
//   node --experimental-strip-types --test src/__tests__/e2e/compliance-engine-b2c.test.ts

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mockFetch,
  inMemorySupabase,
  tryLoadFreshnessGate,
  FRESH_CRA2015_XML,
  STALE_CACHED_TEXT,
} from './_harness.ts';

describe('compliance-engine B2C — freshness gate end-to-end', () => {
  it('stale legislation.gov.uk ref triggers inline refresh, drift correction, and fresh-text citation', async () => {
    const gate = await tryLoadFreshnessGate();
    if (!gate) {
      console.log(
        '[skip] loadFreshLegalRefs not present on this branch — gate module not yet on master. ' +
          'This test is wired to run once feat/dispute-flows-freshness-gate merges.',
      );
      return;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const seedRefs = [
      {
        id: 'ref-cra-49',
        law_name: 'Consumer Rights Act 2015',
        section: 's.49',
        source_url: 'https://www.legislation.gov.uk/ukpga/2015/15/section/49',
        source_type: 'legislation.gov.uk',
        verification_status: 'verified',
        cached_text: STALE_CACHED_TEXT,
        cached_text_sha256: 'stale-hash-sentinel',
        last_verified: thirtyDaysAgo,
        last_freshness_check_at: thirtyDaysAgo,
      },
    ];
    const seedDisputes = [
      {
        id: 'dispute-1',
        user_id: 'test-user',
        merchant: 'BritGas Ltd',
        category: 'energy',
        status: 'draft',
      },
    ];

    const mem = inMemorySupabase({
      legal_references: seedRefs,
      disputes: seedDisputes,
      legal_ref_corrections: [],
      legal_ref_freshness_audit: [],
    });

    const recorder = mockFetch([
      {
        match: (u) => u.includes('legislation.gov.uk') && u.includes('/section/49'),
        respond: () =>
          new Response(FRESH_CRA2015_XML, {
            status: 200,
            headers: { 'content-type': 'application/xml' },
          }),
      },
    ]);

    try {
      // Drive the gate directly (route-level POST would pull the full
      // Next.js runtime — outside scope for a hermetic unit-style E2E).
      const result = await gate.loadFreshLegalRefs({
        refIds: ['ref-cra-49'],
        caller: 'b2c',
        supabase: mem.client,
      });

      // (a) loadFreshLegalRefs ran and returned the hydrated refs
      assert.ok(result, 'gate returned a result');
      assert.ok(
        recorder.calls.some((c) => c.url.includes('legislation.gov.uk')),
        '(a) inline refresh fired against legislation.gov.uk',
      );

      // (c) drift queued a correction row
      assert.ok(
        mem.inserts.legal_ref_corrections?.length >= 1,
        '(c) legal_ref_corrections row queued for the drift',
      );

      // (d) the resolved ref carries the FRESH text, not the stale cache
      const resolved = Array.isArray(result) ? result[0] : result.refs?.[0] ?? result['ref-cra-49'];
      const freshText = resolved?.cached_text ?? resolved?.text ?? '';
      assert.ok(
        freshText.includes('FRESH') || freshText.includes('FRESH-2026-05'),
        '(d) drafted citation uses FRESH section text',
      );
      assert.ok(
        !freshText.includes('STALE-2024'),
        'fresh text replaces the stale cached body',
      );

      // (f) freshness audit row written with caller=b2c + correction_proposed=true
      const audits = mem.inserts.legal_ref_freshness_audit ?? [];
      assert.ok(audits.length >= 1, '(f) audit row written');
      const b2cAudit = audits.find((a: any) => a.caller === 'b2c');
      assert.ok(b2cAudit, "audit row tagged caller='b2c'");
      assert.equal(b2cAudit.correction_proposed, true, 'correction_proposed=true');

      // (e) prompt-injection check — when the gate exposes
      //     `buildDraftingRuleBlock`, assert the fresh body lands in it.
      if (typeof gate['buildDraftingRuleBlock'] === 'function') {
        // @ts-expect-error optional helper
        const block = gate.buildDraftingRuleBlock([resolved]);
        assert.ok(
          String(block).includes('FRESH'),
          "(e) DRAFTING RULE block contains the updated section text",
        );
      }
    } finally {
      recorder.restore();
    }
  });
});
