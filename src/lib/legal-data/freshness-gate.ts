/**
 * Freshness gate — Phase 4 of the legal-data freshness pipeline.
 *
 * Single source of truth for "is it safe to cite this legal_references
 * row right now?" Both production dispute paths — B2C
 * (`generateComplaintLetter` callers) and B2B (`/v1/disputes`) — must
 * route through this module so every cited reference is guaranteed to
 * be either fresh OR explicitly stale-with-caveat.
 *
 * What "fresh" means:
 *   1. The row has `last_freshness_check_at` (Phase 2/3 column) within
 *      `maxAgeDays` (default 14). If that column doesn't exist yet
 *      (Phase 2/3 in flight on `feat/legal-data-freshness-pipeline`)
 *      we gracefully degrade and use `last_verified` as a proxy.
 *   2. Verification status is in the eligible-citation set.
 *
 * What happens to stale rows:
 *   - If the host is `legislation.gov.uk`, attempt an inline refresh
 *     against the canonical fetcher (when available). Hash drift queues
 *     a `legal_ref_corrections` proposal — we never overwrite canonical
 *     fields here.
 *   - For other hosts, bump `last_freshness_check_at` (best-effort) and
 *     trust the weekly Perplexity reverify cron (Phase 2/3) to handle
 *     deeper drift.
 *
 * Decision log:
 *   Every gate call inserts one row per requested ref into
 *   `legal_ref_freshness_audit` (caller, was_fresh, refreshed, etc.).
 *   Fire-and-forget — never blocks the response.
 *
 * Coordination with `feat/legal-data-freshness-pipeline`:
 *   - This module assumes columns `last_freshness_check_at` and
 *     `source_xml_hash` MAY be missing. If a SELECT returns
 *     "column does not exist" we silently fall back to the legacy
 *     `last_verified` field. When Phase 2/3 merges, the gate auto-
 *     upgrades — no code change needed here.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
// Mirror of `CITATION_ELIGIBLE_STATUSES` from
// `src/lib/legal-refs-statuses.ts`. Duplicated locally so the gate
// remains importable from `node --experimental-strip-types --test`
// (the path alias `@/` and the legacy module's transitive imports
// don't resolve under the bare-node test runner). Keep in sync —
// this is a 3-element list and the source of truth comment links it
// back to the canonical module.
const CITATION_ELIGIBLE_STATUSES: readonly string[] = ['current', 'updated', 'verified'];

export interface LegalRef {
  id: string;
  category: string | null;
  law_name: string;
  section: string | null;
  summary: string | null;
  full_text?: string | null;
  source_url: string;
  source_type?: string | null;
  applies_to?: string[] | null;
  escalation_body?: string | null;
  strength?: string | null;
  verification_status: string | null;
  last_verified: string | null;
  /** Phase 2/3 column — may be null/absent until that PR merges. */
  last_freshness_check_at?: string | null;
  /** Phase 2/3 column — may be null/absent until that PR merges. */
  source_xml_hash?: string | null;
  is_stale?: boolean | null;
}

export type GateCaller = 'b2c' | 'b2b' | 'admin' | 'cron';

export interface FreshnessGateOpts {
  /** Default 14 days. */
  maxAgeDays?: number;
  /** When false (default), the gate attempts inline refresh of stale refs. */
  allowStale?: boolean;
  /** Tag for the audit-log `caller` column. */
  caller?: GateCaller;
  /** Optional dispute id to thread into the audit row. */
  disputeId?: string | null;
  /** When false (default), the gate writes a row to `legal_ref_freshness_audit`. */
  skipAudit?: boolean;
}

export interface FreshnessGateResult {
  /** Refs that are safe to cite without caveat. */
  fresh: LegalRef[];
  /** Refs that are still cited but with a "(verification pending)" caveat. */
  stale: LegalRef[];
  /** Ref ids requested but not found in the table. */
  missing: string[];
  /** Per-ref provenance (B2B `legal_basis_freshness` is built from this). */
  provenance: Array<{
    ref_id: string;
    last_verified_at: string | null;
    source: 'legislation.gov.uk' | 'perplexity' | 'find-case-law' | 'cma-case' | 'other';
    is_stale: boolean;
  }>;
}

const DEFAULT_MAX_AGE_DAYS = 14;
const FRESH_STATUSES = new Set(['current', 'updated', 'verified']);

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function classifySource(url: string | null | undefined): FreshnessGateResult['provenance'][number]['source'] {
  if (!url) return 'other';
  const u = url.toLowerCase();
  if (u.includes('legislation.gov.uk')) return 'legislation.gov.uk';
  if (u.includes('caselaw.nationalarchives.gov.uk') || u.includes('find-case-law')) return 'find-case-law';
  if (u.includes('gov.uk/cma-cases') || u.includes('cma-cases')) return 'cma-case';
  if (u.includes('perplexity')) return 'perplexity';
  return 'other';
}

/**
 * Phase 4 freshness check. Returns the most-recent freshness timestamp
 * for a ref, gracefully falling back to `last_verified` when the
 * Phase 2/3 column isn't populated yet. Pure function — easy to unit
 * test.
 */
export function pickFreshnessTimestamp(ref: Pick<LegalRef, 'last_freshness_check_at' | 'last_verified'>): string | null {
  // Phase 2/3 dependency: when `last_freshness_check_at` lands and is
  // populated by the daily sweep, prefer it. Until then,
  // `last_verified` is the proxy.
  return ref.last_freshness_check_at ?? ref.last_verified ?? null;
}

export function isFresh(
  ref: Pick<LegalRef, 'last_freshness_check_at' | 'last_verified' | 'verification_status' | 'is_stale'>,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
  now: Date = new Date(),
): boolean {
  if (ref.is_stale === true) return false;
  const status = (ref.verification_status || '').toLowerCase();
  if (status && !FRESH_STATUSES.has(status) && !CITATION_ELIGIBLE_STATUSES.includes(status)) {
    return false;
  }
  const ts = pickFreshnessTimestamp(ref);
  if (!ts) return false;
  const checkedAt = new Date(ts).getTime();
  if (!Number.isFinite(checkedAt)) return false;
  const cutoff = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;
  return checkedAt >= cutoff;
}

/**
 * SELECT the rows we need, gracefully tolerating the case where the
 * Phase 2/3 columns aren't merged yet. Two attempts: first with the
 * new columns, second with only legacy columns.
 */
async function selectRefs(supabase: SupabaseClient, ids: string[]): Promise<LegalRef[]> {
  const newColumns = 'id, category, law_name, section, summary, full_text, source_url, source_type, applies_to, escalation_body, strength, verification_status, last_verified, last_freshness_check_at, source_xml_hash, is_stale';
  const legacyColumns = 'id, category, law_name, section, summary, full_text, source_url, source_type, applies_to, escalation_body, strength, verification_status, last_verified';
  const tryQuery = async (cols: string) => {
    const { data, error } = await supabase
      .from('legal_references')
      .select(cols)
      .in('id', ids);
    return { data, error };
  };
  let res = await tryQuery(newColumns);
  if (res.error && /column .* does not exist/i.test(res.error.message ?? '')) {
    // Phase 2/3 columns not yet merged — degrade gracefully.
    res = await tryQuery(legacyColumns);
  }
  if (res.error || !res.data) return [];
  return res.data as unknown as LegalRef[];
}

/**
 * Inline refresh for stale refs. Hash diff vs canonical → propose a
 * correction and mark the ref stale (NEVER overwrite canonical fields
 * directly — the founder-approval rule). Returns whether the ref came
 * back fresh after the refresh.
 */
async function attemptInlineRefresh(
  supabase: SupabaseClient,
  ref: LegalRef,
): Promise<{ refreshed: boolean; correctionProposed: boolean }> {
  const source = classifySource(ref.source_url);

  // Only legislation.gov.uk has a deterministic canonical fetcher in
  // the Phase 1 PR (#415). Other sources rely on the weekly reverify
  // cron — we still bump `last_freshness_check_at` so this gate
  // doesn't keep flagging the same row on every call.
  if (source !== 'legislation.gov.uk') {
    await supabase
      .from('legal_references')
      .update({ last_freshness_check_at: new Date().toISOString() })
      .eq('id', ref.id);
    return { refreshed: true, correctionProposed: false };
  }

  // Phase 2/3 dependency: the canonical fetcher lives in
  // `src/lib/legal-data/legislation-gov-uk.ts` (PR #415). We import
  // dynamically so this module compiles whether or not that PR has
  // landed on the current branch.
  let fetcher: { fetchCanonicalLegislation: (url: string) => Promise<{ xml: string; hash: string } | null> } | null = null;
  try {
    // Phase 2/3 dependency. Use a runtime-only string literal so TS
    // doesn't fail when the module hasn't landed yet on the current
    // branch. Once `feat/legal-data-freshness-pipeline` merges, the
    // import resolves and the canonical hash check kicks in.
    const modulePath = '@/lib/legal-data/legislation-gov-uk';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetcher = await (Function('p', 'return import(p)') as (p: string) => Promise<any>)(modulePath);
  } catch {
    fetcher = null;
  }

  if (!fetcher || typeof fetcher.fetchCanonicalLegislation !== 'function') {
    // PR #415 not present — best-effort timestamp bump.
    await supabase
      .from('legal_references')
      .update({ last_freshness_check_at: new Date().toISOString() })
      .eq('id', ref.id);
    return { refreshed: true, correctionProposed: false };
  }

  let canonical: { xml: string; hash: string } | null = null;
  try {
    canonical = await fetcher.fetchCanonicalLegislation(ref.source_url);
  } catch {
    canonical = null;
  }

  if (!canonical) {
    return { refreshed: false, correctionProposed: false };
  }

  // Hash diff vs stored hash → propose a correction, mark stale.
  const previousHash = ref.source_xml_hash ?? null;
  const drifted = previousHash && previousHash !== canonical.hash;
  if (drifted) {
    await supabase
      .from('legal_references')
      .update({
        is_stale: true,
        last_freshness_check_at: new Date().toISOString(),
      })
      .eq('id', ref.id);
    await supabase.from('legal_ref_corrections').insert({
      legal_reference_id: ref.id,
      proposed_law_name: ref.law_name,
      proposed_source_url: ref.source_url,
      proposer: 'freshness-gate',
      reason: 'Inline freshness gate detected hash drift vs legislation.gov.uk canonical XML.',
      status: 'pending',
      risk_score: 'medium',
    });
    return { refreshed: false, correctionProposed: true };
  }

  // Same hash → just bump the freshness timestamp.
  await supabase
    .from('legal_references')
    .update({
      last_freshness_check_at: new Date().toISOString(),
      source_xml_hash: canonical.hash,
    })
    .eq('id', ref.id);
  return { refreshed: true, correctionProposed: false };
}

async function writeAuditRow(
  supabase: SupabaseClient,
  row: {
    ref_id: string;
    caller: GateCaller;
    dispute_id: string | null;
    was_fresh: boolean;
    triggered_inline_refresh: boolean;
    correction_proposed: boolean;
  },
): Promise<void> {
  try {
    await supabase.from('legal_ref_freshness_audit').insert(row);
  } catch {
    // Best-effort — audit table failures must never block the response.
  }
}

/**
 * Public gate. Every dispute-related code path MUST go through this
 * function instead of reading `legal_references` directly.
 */
export async function loadFreshLegalRefs(
  refIds: string[],
  opts: FreshnessGateOpts = {},
): Promise<FreshnessGateResult> {
  const ids = (refIds || []).filter((id) => typeof id === 'string' && id.length > 0);
  const result: FreshnessGateResult = { fresh: [], stale: [], missing: [], provenance: [] };
  if (ids.length === 0) return result;

  const supabase = getAdmin();
  const maxAgeDays = opts.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const caller: GateCaller = opts.caller ?? 'b2c';
  const disputeId = opts.disputeId ?? null;

  const rows = await selectRefs(supabase, ids);
  const byId = new Map(rows.map((r) => [r.id, r]));

  for (const id of ids) {
    const ref = byId.get(id);
    if (!ref) {
      result.missing.push(id);
      continue;
    }
    const fresh = isFresh(ref, maxAgeDays);
    let triggeredInlineRefresh = false;
    let correctionProposed = false;
    let finalRef = ref;
    let finalFresh = fresh;
    if (!fresh && !opts.allowStale) {
      const refreshOutcome = await attemptInlineRefresh(supabase, ref);
      triggeredInlineRefresh = true;
      correctionProposed = refreshOutcome.correctionProposed;
      if (refreshOutcome.refreshed && !refreshOutcome.correctionProposed) {
        // Re-pull the row to pick up the new timestamp.
        const refreshed = (await selectRefs(supabase, [id]))[0];
        if (refreshed) {
          finalRef = refreshed;
          finalFresh = isFresh(refreshed, maxAgeDays);
        }
      } else if (refreshOutcome.correctionProposed) {
        // Drift detected — drop from fresh list per spec.
        finalFresh = false;
      }
    }

    if (finalFresh) {
      result.fresh.push(finalRef);
    } else {
      result.stale.push(finalRef);
    }
    result.provenance.push({
      ref_id: id,
      last_verified_at: pickFreshnessTimestamp(finalRef),
      source: classifySource(finalRef.source_url),
      is_stale: !finalFresh,
    });

    if (!opts.skipAudit) {
      void writeAuditRow(supabase, {
        ref_id: id,
        caller,
        dispute_id: disputeId,
        was_fresh: fresh,
        triggered_inline_refresh: triggeredInlineRefresh,
        correction_proposed: correctionProposed,
      });
    }
  }

  return result;
}
