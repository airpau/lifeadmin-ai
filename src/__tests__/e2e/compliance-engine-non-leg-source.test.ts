// src/__tests__/e2e/compliance-engine-non-leg-source.test.ts
//
// Negative case for the freshness gate: when the cited ref is hosted
// on a UK-authority domain that ISN'T legislation.gov.uk (e.g. a CMA
// case page on gov.uk), the gate must NOT attempt an inline refresh.
// Legislation.gov.uk has a structured XML/Atom feed that the gate can
// reliably re-fetch and diff. CMA case pages are unstructured HTML —
// inline refresh against them would produce false-positive drift and
// thrash the corrections queue. Those refs are trusted to the weekly
// reverify cron instead.
//
// Expected behaviour for a stale `gov.uk/cma_case/...` ref called via
// the B2C draft path:
//   - No outbound fetch to the case URL during the draft path.
//   - The gate either skips the ref or marks `was_fresh=false` and
//     bumps `last_freshness_check_at` (debouncing the cron) without
//     proposing a correction.
//   - The drafted letter still goes out — the gate must not block on
//     non-refreshable sources.
//   - In the response (or the stored audit), `is_stale=true` for
//     that ref so consumers can surface a "verified by cron" badge.
//
// Skips when the gate module isn't yet on this branch.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, inMemorySupabase, tryLoadFreshnessGate } from './_harness.ts';

describe('compliance-engine — non-legislation source degrades gracefully', () => {
  it('CMA case page ref: no inline refresh, draft still produced, ref marked stale for cron handling', async () => {
    const gate = await tryLoadFreshnessGate();
    if (!gate) {
      console.log('[skip] loadFreshLegalRefs not present on this branch — negative test deferred until gate lands.');
      return;
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();
    const mem = inMemorySupabase({
      legal_references: [
        {
          id: 'ref-cma-42',
          law_name: 'CMA Case 42 — Energy Price Practices',
          section: null,
          source_url: 'https://www.gov.uk/cma-cases/energy-price-practices-2024',
          source_type: 'gov.uk/cma_case',
          verification_status: 'verified',
          cached_text: 'CMA finding — provider must refund.',
          last_verified: thirtyDaysAgo,
          last_freshness_check_at: thirtyDaysAgo,
        },
      ],
      legal_ref_corrections: [],
      legal_ref_freshness_audit: [],
    });

    const recorder = mockFetch([
      {
        // If the gate erroneously tries to fetch the CMA URL, we let
        // it succeed so the test can detect the misuse via the
        // recorder rather than throwing on an unmocked call.
        match: (u) => u.includes('gov.uk/cma-cases'),
        respond: () => new Response('<html>case page</html>', { status: 200 }),
      },
    ]);

    try {
      const result = await gate.loadFreshLegalRefs({
        refIds: ['ref-cma-42'],
        caller: 'b2c',
        supabase: mem.client,
      });

      // No outbound fetch to the CMA case page — gate should skip it.
      const cmaFetches = recorder.calls.filter((c) => c.url.includes('gov.uk/cma-cases'));
      assert.equal(cmaFetches.length, 0, 'gate did not attempt inline refresh on non-legislation host');

      // No correction queued — drift detection is unsound for HTML pages.
      assert.equal(
        (mem.inserts.legal_ref_corrections ?? []).length,
        0,
        'no correction proposed for non-legislation source',
      );

      // The ref is still returned to the caller so the letter can draft.
      assert.ok(result, 'gate returned a result so the letter still drafts');

      // Audit row records the skip — either explicit `was_fresh=false` or
      // a bumped `last_freshness_check_at` with `correction_proposed=false`.
      const audits = mem.inserts.legal_ref_freshness_audit ?? [];
      if (audits.length > 0) {
        const a = audits[0];
        assert.equal(a.correction_proposed ?? false, false, 'correction_proposed=false for non-legislation host');
        // is_stale / was_fresh reporting is implementation-defined —
        // accept either tagging convention.
        const staleSignal = a.was_fresh === false || a.is_stale === true;
        assert.ok(staleSignal, 'audit reflects "stale, deferred to weekly cron"');
      }

      // If the gate exposes a per-ref freshness summary, assert is_stale=true
      // for the CMA ref so downstream UI/B2B response can surface the badge.
      const summary = (result as any)?.freshness ?? (result as any)?.legal_basis_freshness;
      if (Array.isArray(summary)) {
        const cma = summary.find((s: any) => s.ref_id === 'ref-cma-42' || s.id === 'ref-cma-42');
        if (cma) assert.equal(cma.is_stale, true, 'is_stale=true reported to caller for non-refreshable source');
      }
    } finally {
      recorder.restore();
    }
  });
});
