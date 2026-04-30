/**
 * Smoke-style assertions for the legal-refs freshness guardrail.
 *
 * The repo doesn't run a unit-test runner in CI for these paths, so
 * these are pure type / shape checks that run via `tsc --noEmit`. The
 * goal is to catch contract drift on the helper exports — anyone who
 * changes the public surface of `legal-refs-guardrail` will see this
 * file fail to compile.
 *
 * Behavioural smoke results are documented in the PR body.
 */

import {
  freshnessOf,
  type LegalRef,
  type RefFreshness,
  type FreshnessReport,
} from '../legal-refs-guardrail';

// Fresh row → 'fresh'.
const freshRow: LegalRef = {
  id: 'r1',
  category: 'energy',
  law_name: 'Gas Act 1986',
  section: null,
  summary: '',
  source_url: 'https://example.test',
  verification_status: 'verified',
  last_verified: new Date().toISOString(),
};
const freshVerdict: RefFreshness = freshnessOf(freshRow);
if (freshVerdict !== 'fresh') {
  throw new Error('expected fresh row to classify as fresh');
}

// Old verified row → 'stale'.
const oldRow: LegalRef = {
  ...freshRow,
  id: 'r2',
  last_verified: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
};
const oldVerdict: RefFreshness = freshnessOf(oldRow);
if (oldVerdict !== 'stale') {
  throw new Error('expected 30-day-old row to classify as stale');
}

// Broken status → 'broken'.
const brokenRow: LegalRef = { ...freshRow, id: 'r3', verification_status: 'broken' };
const brokenVerdict: RefFreshness = freshnessOf(brokenRow);
if (brokenVerdict !== 'broken') {
  throw new Error('expected broken row to classify as broken');
}

// Type guard: FreshnessReport must have ok / stale / refs.
function consumeReport(r: FreshnessReport): boolean {
  return r.ok && r.stale.length === 0 && Array.isArray(r.refs);
}
void consumeReport;

export {};
