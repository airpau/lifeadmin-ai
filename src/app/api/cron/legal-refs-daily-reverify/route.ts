/**
 * GET /api/cron/legal-refs-daily-reverify
 *
 * Daily 04:00 UTC. The ONLY scheduled re-verifier since 2026-09-27; see
 * "WHY THIS ROUTE IS BOUNDED" below. Picks up to MAX_REFS_PER_RUN refs:
 *   1. Refs whose `last_verified` is NULL or older than MIN_AGE_DAYS,
 *      oldest first.
 *   2. Plus any ref cited in `legal_ref_usages` in the last 24 h that
 *      hasn't been verified in the last 7 days.
 *   3. Capped at MAX_REFS_PER_RUN refs total and at BUDGET_MS wall-clock.
 *
 * Research goes through src/lib/research/web-research.ts.
 *
 * ------------------------------------------------------------------
 * WHY THIS ROUTE IS BOUNDED (2026-09-27)
 * ------------------------------------------------------------------
 * Before the Perplexity -> Claude web_search migration (#608, 2026-09-16)
 * this cron and /api/cron/reverify-all-legal-refs both ran nightly, both
 * ordered by `last_verified ASC` and both stamped `last_verified`. That
 * was harmless at $0.005 a call and the calls were failing anyway. On
 * Claude web_search a call is ~£0.07, and between them the two jobs were
 * re-verifying every one of the 124 refs every ~3.5 days: ~35 Sonnet
 * calls and ~70 searches a night, ~$4/day on the Console, with this
 * route dying at Vercel's 300s maxDuration most nights (it had a 30-ref
 * cap and no wall-clock budget, at ~15s a call).
 *
 * Four controls now, each overridable by env so the dial can be turned
 * without a deploy:
 *
 * 1. STALENESS FLOOR - a ref is only re-verified when its last
 *    verification is older than MIN_AGE_DAYS (env DAILY_REVERIFY_MIN_AGE_DAYS,
 *    default 14). Legislation does not change nightly; the recently-cited
 *    path below still catches anything actually in use within 7 days.
 *    124 refs / 14 days is ~9 calls a night instead of ~35.
 * 2. HARD CALL CAP - MAX_REFS_PER_RUN (env DAILY_REVERIFY_MAX_REFS,
 *    default 12). The cost ceiling.
 * 3. WALL-CLOCK BUDGET - BUDGET_MS (240s) inside maxDuration (300s), so a
 *    slow night returns real counts (`skipped_no_budget`) instead of a
 *    504 with no body.
 * 4. CHEAP FIRST PASS - each ref is checked on Haiku with ONE web search.
 *    Only when Haiku proposes a change, or is not confident the citation
 *    is fine, is the same ref re-checked on Sonnet, and Sonnet's verdict
 *    is the one persisted. A ref that is simply "still current" (the
 *    overwhelming majority) never touches Sonnet.
 *
 * /api/cron/reverify-all-legal-refs is no longer in vercel.json. It is
 * kept for the admin "verify all" button (authorizeAdminOrCron).
 *
 * COMPLIANCE PRINCIPLE (non-negotiable): this cron is propose-only. Any
 * proposed change to canonical fields (law_name, source_url,
 * verification_status) is INSERTed into `legal_ref_corrections` with
 * status='pending'. Only the observational fields (last_verified,
 * verification_notes) are written directly here.
 *
 * Auto-apply (if any) happens in the dedicated η sweep cron after ζ has
 * attached enrichment_data.
 *
 * Auth: standard Vercel cron Bearer (CRON_SECRET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';
import { tryResearchWeb } from '@/lib/research/web-research';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Hard cap on research calls per run. The cost ceiling. */
const MAX_REFS_PER_RUN = envInt('DAILY_REVERIFY_MAX_REFS', 12);
/** A ref is only re-verified once its last verification is this old. */
const MIN_AGE_DAYS = envInt('DAILY_REVERIFY_MIN_AGE_DAYS', 14);
/** Web searches per research call. One is enough to confirm a URL resolves. */
const MAX_SEARCHES = envInt('DAILY_REVERIFY_MAX_SEARCHES', 1);
/** Stop issuing new calls after this long; maxDuration is 300s. */
const BUDGET_MS = 240_000;
const RECENT_USAGE_HOURS = 24;
const RECENT_USAGE_REVERIFY_DAYS = 7;

/**
 * Two-tier model choice. Haiku checks every ref; Sonnet only re-checks the
 * ones Haiku thinks have changed or cannot vouch for. Both go through the
 * same grounded web_search client, so Haiku's "still current" is a
 * retrieval-backed answer, not a recollection.
 */
const FIRST_PASS_MODEL = process.env.DAILY_REVERIFY_FIRST_PASS_MODEL || 'claude-haiku-4-5-20251001';
const ESCALATION_MODEL = process.env.DAILY_REVERIFY_ESCALATION_MODEL || 'claude-sonnet-4-6';
/**
 * Nominal per-call figure recorded on the audit rows. The authoritative
 * spend is now logged into the cost ledger by the research client itself.
 */
const COST_PER_CALL_GBP = 0.005;

function getAdmin() {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

interface LegalRefRow {
  id: string;
  law_name: string;
  section: string | null;
  source_url: string;
  source_type: string | null;
  category: string;
  verification_status: string | null;
  last_verified: string | null;
  created_at: string;
}

interface PerplexityVerdict {
  valid: boolean;
  current_url: string | null;
  superseded_by: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

/**
 * CITATION SOURCE RULE — carried over verbatim from the previous
 * provider. This route deliberately uses a shorter wording than
 * /api/admin/legal-refs/verify and /verify-all; reconciling the three is
 * a separate change with its own review.
 */
const SYSTEM_PROMPT = [
  'You are a UK legal-citation verification assistant. Return STRICT JSON only.',
  '',
  'CITATION SOURCE RULE (mandatory): Only return URLs from primary UK legal',
  'authorities — legislation.gov.uk, gov.uk subdomains, fca.org.uk, ofcom.org.uk,',
  'ofgem.gov.uk, financial-ombudsman.org.uk, parliament.uk, bailii.org,',
  'judiciary.uk, supremecourt.uk, ico.org.uk, cma.gov.uk, caa.co.uk, orr.gov.uk, nhs.uk.',
  'NEVER cite trade associations (UK Finance, ABI, BSA), commentary sites, news,',
  'law-firm blogs, Wikipedia, MoneySavingExpert, Which?, or aggregators. If the',
  'only available source is a non-authority site, return null rather than fabricating.',
].join('\n');

function buildPrompt(ref: LegalRefRow): string {
  const yearMatch = ref.created_at?.match(/^(\d{4})/);
  const year = yearMatch ? yearMatch[1] : 'unknown';
  const titleParts = [ref.law_name, ref.section].filter(Boolean).join(' — ');
  const source = ref.source_type || 'unknown';
  return [
    `Verify this UK legal citation:`,
    `title='${titleParts}',`,
    `source='${source}' (${year}),`,
    `current URL='${ref.source_url}'.`,
    `Confirm: (a) does the URL still resolve to the right document,`,
    `(b) is the citation accurate,`,
    `(c) has it been superseded by a newer reference.`,
    `Return STRICT JSON only:`,
    `{"valid": bool, "current_url": string|null, "superseded_by": string|null, "confidence": "high"|"medium"|"low", "notes": string}`,
  ].join(' ');
}

async function askResearch(
  prompt: string,
  model: string,
  refId: string,
  tier: 'first_pass' | 'escalation',
): Promise<PerplexityVerdict | null> {
  const res = await tryResearchWeb<any>({
    prompt,
    system: SYSTEM_PROMPT,
    model,
    parse: 'json_object',
    maxTokens: 500,
    temperature: 0.1,
    maxSearches: MAX_SEARCHES,
    // Verdicts from this cron become pending corrections against legal
    // citations, so they must be grounded in the live web rather than in
    // the model's memory. An ungrounded answer throws inside the client;
    // tryResearchWeb turns that into null, which lands in the existing
    // "research call failed" branch below.
    requireGrounding: true,
    endpoint: '/api/cron/legal-refs-daily-reverify',
    costMetadata: { ref_id: refId, tier },
    onError: (e) => console.error(`[legal-refs-daily-reverify] research error (${tier}, ${model}):`, e.message),
  });
  if (!res || !res.parsed) return null;
  const parsed = res.parsed;
  const conf = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low' ? parsed.confidence : 'low';
  return {
    valid: !!parsed.valid,
    current_url: typeof parsed.current_url === 'string' ? parsed.current_url : null,
    superseded_by: typeof parsed.superseded_by === 'string' ? parsed.superseded_by : null,
    confidence: conf,
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
  };
}

/**
 * Haiku first. Escalate to Sonnet only when the cheap pass is not a
 * confident "still current": any proposal, an invalid verdict, or low
 * confidence. Sonnet's verdict replaces Haiku's when it succeeds; if the
 * Sonnet call fails we keep Haiku's verdict rather than losing the ref
 * for the night, since the proposal still lands in the pending queue for
 * a human to look at.
 */
async function verifyTwoTier(
  ref: LegalRefRow,
): Promise<{ verdict: PerplexityVerdict; model: string; escalated: boolean } | null> {
  const prompt = buildPrompt(ref);
  const first = await askResearch(prompt, FIRST_PASS_MODEL, ref.id, 'first_pass');
  if (!first) return null;

  const needsEscalation =
    !first.valid ||
    first.confidence === 'low' ||
    deriveProposal(ref, first).hasProposal;
  if (!needsEscalation || ESCALATION_MODEL === FIRST_PASS_MODEL) {
    return { verdict: first, model: FIRST_PASS_MODEL, escalated: false };
  }

  const second = await askResearch(prompt, ESCALATION_MODEL, ref.id, 'escalation');
  if (!second) return { verdict: first, model: FIRST_PASS_MODEL, escalated: false };
  return { verdict: second, model: ESCALATION_MODEL, escalated: true };
}

function normaliseUrl(u: string | null | undefined): string {
  return (u ?? '').replace(/\/$/, '').trim().toLowerCase();
}

function parseSupersededTitle(s: string | null | undefined): string | null {
  if (!s) return null;
  const urlMatch = s.match(/https?:\/\/\S+/);
  const title = s
    .replace(urlMatch?.[0] ?? '', '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[—–\-:]\s*/, '');
  return title || null;
}

function deriveProposal(
  ref: LegalRefRow,
  verdict: PerplexityVerdict,
): {
  hasProposal: boolean;
  proposed_law_name: string | null;
  proposed_source_url: string | null;
  proposed_status: string | null;
  superseded_by: string | null;
} {
  let proposed_source_url: string | null = null;
  if (verdict.current_url) {
    const authority = checkUkLegalAuthority(verdict.current_url);
    if (authority.ok) proposed_source_url = verdict.current_url;
  }

  let proposed_law_name: string | null = null;
  let proposed_status: string | null = null;
  let superseded_by: string | null = null;

  if (verdict.superseded_by) {
    proposed_law_name = parseSupersededTitle(verdict.superseded_by);
    proposed_status = 'superseded';
    superseded_by = verdict.superseded_by;
  } else if (!verdict.valid && verdict.current_url) {
    proposed_status = 'updated';
  } else if (verdict.confidence === 'low') {
    proposed_status = 'needs_review';
  }

  if (
    proposed_source_url &&
    normaliseUrl(proposed_source_url) === normaliseUrl(ref.source_url)
  ) {
    proposed_source_url = null;
  }
  if (
    proposed_law_name &&
    proposed_law_name.trim().toLowerCase() === ref.law_name.trim().toLowerCase()
  ) {
    proposed_law_name = null;
  }

  const hasProposal = !!(
    proposed_law_name ||
    proposed_source_url ||
    proposed_status === 'superseded' ||
    proposed_status === 'updated'
  );

  return {
    hasProposal,
    proposed_law_name,
    proposed_source_url,
    proposed_status,
    superseded_by,
  };
}

export async function GET(request: NextRequest) {
  // Cron secret — matches the existing pattern across the repo.
  const authHeader = request.headers.get('Authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  const startedAt = Date.now();

  // STALENESS FLOOR: only refs not verified in the last MIN_AGE_DAYS. A ref
  // verified last week is not looked at again, however stale it is
  // relative to its neighbours. Never-verified refs (NULL) always qualify.
  const minAgeCutoff = new Date(Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldest } = await admin
    .from('legal_references')
    .select('id, law_name, section, source_url, source_type, category, verification_status, last_verified, created_at')
    .or(`last_verified.is.null,last_verified.lt.${minAgeCutoff}`)
    .order('last_verified', { ascending: true, nullsFirst: true })
    .limit(MAX_REFS_PER_RUN);

  const since24h = new Date(Date.now() - RECENT_USAGE_HOURS * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - RECENT_USAGE_REVERIFY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentlyUsed } = await admin
    .from('legal_ref_usages')
    .select('ref_id')
    .gte('used_at', since24h);
  const usedIds = Array.from(new Set((recentlyUsed || []).map((r: any) => r.ref_id))).filter(Boolean);

  let recentRefs: LegalRefRow[] = [];
  if (usedIds.length > 0) {
    const { data } = await admin
      .from('legal_references')
      .select('id, law_name, section, source_url, source_type, category, verification_status, last_verified, created_at')
      .in('id', usedIds)
      .or(`last_verified.is.null,last_verified.lt.${sevenDaysAgo}`);
    recentRefs = (data as LegalRefRow[]) || [];
  }

  // Recently-cited refs go FIRST: a citation that went out in a letter
  // yesterday matters more than the oldest row in the table.
  const seen = new Set<string>();
  const queue: LegalRefRow[] = [];
  for (const r of [...recentRefs, ...(oldest || [])] as LegalRefRow[]) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    queue.push(r);
    if (queue.length >= MAX_REFS_PER_RUN) break;
  }

  const counts = {
    processed: 0,
    errors: 0,
    queued: 0,
    no_change: 0,
    escalated_to_sonnet: 0,
    skipped_no_budget: 0,
  };

  for (let i = 0; i < queue.length; i++) {
    if (Date.now() - startedAt > BUDGET_MS) {
      counts.skipped_no_budget = queue.length - i;
      console.warn(
        `[legal-refs-daily-reverify] time budget exhausted after ${Date.now() - startedAt}ms; ` +
          `${counts.skipped_no_budget} of ${queue.length} refs not reached. They keep their ` +
          `stale last_verified and lead tomorrow's run.`,
      );
      break;
    }
    const ref = queue[i];
    const result = await verifyTwoTier(ref);
    if (!result) {
      counts.errors += 1;
      void admin.from('legal_ref_verifications').insert({
        ref_id: ref.id,
        verifier: 'claude-web-search',
        triggered_by: 'cron',
        before_status: ref.verification_status,
        after_status: 'error',
        before_url: ref.source_url,
        after_url: null,
        notes: 'Research call failed',
      });
      continue;
    }
    const { verdict, model: verdictModel, escalated } = result;
    if (escalated) counts.escalated_to_sonnet += 1;

    const notes = verdict.superseded_by
      ? `Superseded by: ${verdict.superseded_by}. ${verdict.notes}`.trim()
      : verdict.notes;

    // Touch ONLY observational fields. Never canonical from this route.
    const nowIso = new Date().toISOString();
    await admin
      .from('legal_references')
      .update({
        last_verified: nowIso,
        verification_notes: notes || null,
      })
      .eq('id', ref.id);

    const proposal = deriveProposal(ref, verdict);

    if (!proposal.hasProposal) {
      counts.no_change += 1;
      // The `perplexity_response` COLUMN name is unchanged — existing rows
      // and downstream queries key off it. Only the provenance label value
      // moves to the new provider.
      void admin.from('legal_ref_verifications').insert({
        ref_id: ref.id,
        verifier: 'claude-web-search',
        triggered_by: 'cron',
        before_status: ref.verification_status,
        after_status: ref.verification_status,
        before_url: ref.source_url,
        after_url: ref.source_url,
        changes: { no_change: true, model: verdictModel, escalated },
        cost_gbp: COST_PER_CALL_GBP * 0.79,
        perplexity_response: verdict as any,
        notes: notes || null,
      });
      counts.processed += 1;
      await new Promise((r) => setTimeout(r, 200));
      continue;
    }

    // Mark prior pending corrections for this ref as superseded.
    await admin
      .from('legal_ref_corrections')
      .update({
        status: 'superseded_by_newer',
        reviewed_at: nowIso,
        reviewed_by: 'daily-reverify-new-proposal',
      })
      .eq('ref_id', ref.id)
      .eq('status', 'pending');

    const { data: insertedRows, error: insErr } = await admin
      .from('legal_ref_corrections')
      .insert({
        ref_id: ref.id,
        proposer: 'claude-web-search',
        before_law_name: ref.law_name,
        before_source_url: ref.source_url,
        before_status: ref.verification_status,
        proposed_law_name: proposal.proposed_law_name,
        proposed_source_url: proposal.proposed_source_url,
        proposed_status: proposal.proposed_status,
        superseded_by: proposal.superseded_by,
        reasoning: notes || null,
        raw_response: verdict as any,
        confidence: verdict.confidence,
        cost_gbp: COST_PER_CALL_GBP,
        status: 'pending',
      })
      .select('id')
      .limit(1);

    const correctionId = insertedRows?.[0]?.id;

    if (insErr) {
      counts.errors += 1;
      void admin.from('legal_ref_verifications').insert({
        ref_id: ref.id,
        verifier: 'claude-web-search',
        triggered_by: 'cron',
        before_status: ref.verification_status,
        after_status: 'error',
        before_url: ref.source_url,
        after_url: null,
        changes: { corrections_insert_failed: true, error: insErr.message, model: verdictModel, escalated },
        cost_gbp: COST_PER_CALL_GBP * 0.79,
        perplexity_response: verdict as any,
        notes: `corrections insert failed: ${insErr.message}`,
      });
    } else {
      counts.queued += 1;
      void admin.from('legal_ref_verifications').insert({
        ref_id: ref.id,
        verifier: 'claude-web-search',
        triggered_by: 'cron',
        before_status: ref.verification_status,
        after_status: 'pending-correction-queued',
        before_url: ref.source_url,
        after_url: proposal.proposed_source_url,
        changes: {
          queued_correction: true,
          correction_id: correctionId ?? null,
          model: verdictModel,
          escalated,
          proposed_law_name: proposal.proposed_law_name,
          proposed_source_url: proposal.proposed_source_url,
          proposed_status: proposal.proposed_status,
        },
        cost_gbp: COST_PER_CALL_GBP * 0.79,
        perplexity_response: verdict as any,
        notes: notes || null,
      });
    }

    counts.processed += 1;
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    ok: true,
    queued: queue.length,
    counts,
    // Echoed so the dials actually in force are visible in the cron logs.
    max_refs_per_run: MAX_REFS_PER_RUN,
    min_age_days: MIN_AGE_DAYS,
    max_searches: MAX_SEARCHES,
    first_pass_model: FIRST_PASS_MODEL,
    escalation_model: ESCALATION_MODEL,
  });
}
