/**
 * /api/cron/reverify-all-legal-refs — daily 03:30 UTC (configured in vercel.json)
 *
 * Propose-only nightly re-verifier. Pulls every legal reference (prioritised
 * by oldest last_verified, then oldest last_human_review_at), caps at 25 refs
 * per run, asks the shared web-research client for a verification verdict, and
 * writes any discrepancies as rows in legal_ref_corrections with status='pending'.
 *
 * Research goes through src/lib/research/web-research.ts.
 *
 * Does NOT mutate legal_references citation fields. Only touches
 * `last_verified` and `verification_notes` (observational fields). Founder
 * reviews the corrections queue and decides what to apply.
 *
 * Cost cap: ~25 calls/day. COST_PER_CALL_GBP below is the nominal per-call
 * figure recorded on the audit rows; the authoritative spend is now logged by
 * the research client into the cost ledger.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';
import { tryResearchWeb } from '@/lib/research/web-research';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MAX_PER_RUN = 25;
const RESEARCH_MODEL = 'claude-sonnet-4-6';
const COST_PER_CALL_GBP = 0.005;

/**
 * CITATION SOURCE RULE — unchanged from the previous provider. This is the
 * whole value of the call: the model must return null rather than fabricate
 * a primary citation.
 */
const SYSTEM_PROMPT = [
  'You are a UK consumer-law research assistant. Return STRICT JSON only — no markdown.',
  '',
  'CITATION SOURCE RULE (mandatory): Only return URLs from primary UK legal',
  'authorities. Acceptable sources: legislation.gov.uk, gov.uk and its',
  'subdomains (.fca.org.uk, .ofcom.org.uk, .ofgem.gov.uk, etc.),',
  'financial-ombudsman.org.uk, parliament.uk, bailii.org, judiciary.uk,',
  'supremecourt.uk, ico.org.uk, cma.gov.uk, caa.co.uk, orr.gov.uk, nhs.uk.',
  '',
  'NEVER cite trade associations (UK Finance, ABI, BSA), commentary sites,',
  'news sites, law-firm blogs, Wikipedia, MoneySavingExpert, Which?, or',
  'consumer-rights aggregators. They are commentary, not authority.',
  '',
  'If the only available source is a trade association or commentary site,',
  'return null for proposed_source_url rather than fabricating a primary citation.',
].join('\n');

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface PerplexityVerdict {
  status: 'current' | 'updated' | 'superseded' | 'url_dead' | 'unknown';
  proposed_law_name?: string | null;
  proposed_source_url?: string | null;
  superseded_by?: string | null;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
}

function buildPrompt(ref: { law_name: string; source_url: string; summary: string }): string {
  return `Verify this UK legal reference is still current and correctly named/linked.

Current values:
- law_name: ${ref.law_name}
- source_url: ${ref.source_url}
- summary: ${ref.summary}

Return STRICT JSON ONLY. Schema:
{
  "status": "current" | "updated" | "superseded" | "url_dead" | "unknown",
  "proposed_law_name": string | null,
  "proposed_source_url": string | null,
  "superseded_by": string | null,
  "reasoning": string,
  "confidence": "high" | "medium" | "low"
}

Rules:
- "current" means law_name + source_url are both correct today.
- "updated" means a newer official version of the same law exists; populate proposed_*.
- "superseded" means this law was replaced by a different statute; populate superseded_by + proposed_*.
- "url_dead" means the source URL no longer resolves to the right page.
- Only set confidence='high' if you can cite a definitive official source (legislation.gov.uk, gov.uk, regulator).`;
}

async function verifyRef(ref: {
  id: string;
  law_name: string;
  source_url: string;
  summary: string;
}): Promise<{ verdict: PerplexityVerdict; raw: unknown } | null> {
  const res = await tryResearchWeb<PerplexityVerdict>({
    prompt: buildPrompt(ref),
    system: SYSTEM_PROMPT,
    model: RESEARCH_MODEL,
    parse: 'json_object',
    maxTokens: 600,
    temperature: 0.1,
    // A verdict that is written to legal_ref_corrections must be grounded
    // in the live web, not in the model's memory. An ungrounded answer
    // throws inside the client; tryResearchWeb turns that into null, which
    // falls through to the existing "research unavailable" branch below.
    requireGrounding: true,
    endpoint: '/api/cron/reverify-all-legal-refs',
    costMetadata: { ref_id: ref.id },
    onError: (e) => console.error('[reverify] research failed', e.message),
  });

  if (!res || !res.parsed) return null;
  // `raw` is the untouched provider response — persisted verbatim to the
  // audit columns (legal_ref_corrections.raw_response and
  // legal_ref_verifications.perplexity_response).
  return { verdict: res.parsed, raw: res.raw };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();
  const { data: refs, error } = await supabase
    .from('legal_references')
    .select('id, law_name, source_url, summary, verification_status, last_verified, last_human_review_at')
    .order('last_verified', { ascending: true, nullsFirst: true })
    .order('last_human_review_at', { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!refs || refs.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, proposed: 0 });
  }

  const nowIso = new Date().toISOString();
  let checked = 0;
  let proposed = 0;
  let totalCost = 0;
  const errors: string[] = [];

  for (const ref of refs) {
    try {
      const result = await verifyRef({
        id: ref.id,
        law_name: ref.law_name,
        source_url: ref.source_url,
        summary: ref.summary,
      });
      checked++;
      totalCost += COST_PER_CALL_GBP;

      // Cost ledger rows are written by the research client itself.

      if (!result) {
        await supabase
          .from('legal_references')
          .update({
            last_verified: nowIso,
            verification_notes: 'reverify-cron: research unavailable',
          })
          .eq('id', ref.id);
        continue;
      }

      const { verdict, raw } = result;

      // Always update observational fields. NEVER mutate citation fields here.
      await supabase
        .from('legal_references')
        .update({
          last_verified: nowIso,
          verification_notes: `reverify-cron ${nowIso}: ${verdict.status} (${verdict.confidence}) — ${verdict.reasoning.slice(0, 280)}`,
        })
        .eq('id', ref.id);

      // If research says current and didn't propose anything, no correction.
      if (verdict.status === 'current' && !verdict.proposed_law_name && !verdict.proposed_source_url) {
        continue;
      }

      // Authority allowlist gate — never queue a correction whose
      // proposed source is a trade association, commentary site, or
      // unrecognised domain. Only run the check when a URL is actually
      // proposed (a name-only correction is fine).
      let extraNotes: string | null = null;
      let forcedConfidence: 'high' | 'medium' | 'low' = verdict.confidence;
      if (verdict.proposed_source_url) {
        const authority = checkUkLegalAuthority(verdict.proposed_source_url);
        if (!authority.ok) {
          const reasonNote =
            authority.reason === 'rejected'
              ? `rejected: non-authority source (${authority.hostname ?? 'unknown'})`
              : `unrecognised source (${authority.hostname ?? 'unknown'}) — consider adding to allowlist`;
          // Audit-log the drop so the founder can see what was filtered.
          // NOTE: the `verifier` / `proposer` VALUES now record the real
          // provenance ('claude-web-search'), matching the other five
          // legal-ref routes. Rows written before 2026-09-16 carry
          // 'perplexity-sonar-pro' and that is correct for them — this is
          // an audit trail, so the two values coexist on purpose. The
          // `perplexity_response` COLUMN name is unchanged; renaming it
          // would be a schema migration for no benefit.
          void supabase.from('legal_ref_verifications').insert({
            ref_id: ref.id,
            verifier: 'claude-web-search',
            triggered_by: 'reverify-cron',
            before_status: ref.verification_status,
            after_status: ref.verification_status,
            before_url: ref.source_url,
            after_url: null,
            changes: { dropped_by_authority_allowlist: true, proposed_url: verdict.proposed_source_url },
            cost_gbp: COST_PER_CALL_GBP,
            perplexity_response: raw as object,
            notes: reasonNote,
          });
          continue;
        }
        if (authority.reason === 'secondary') {
          forcedConfidence = 'low';
          extraNotes =
            `Source is secondary (${authority.matched_domain}) — verify against primary source before approving.`;
        }
      }

      // Mark prior pending corrections for the same ref as superseded.
      await supabase
        .from('legal_ref_corrections')
        .update({ status: 'superseded_by_newer', reviewed_at: nowIso, reviewed_by: 'reverify-cron' })
        .eq('ref_id', ref.id)
        .eq('status', 'pending');

      const finalReasoning = extraNotes
        ? `${extraNotes} ${verdict.reasoning}`.trim()
        : verdict.reasoning;

      const { error: insErr } = await supabase.from('legal_ref_corrections').insert({
        ref_id: ref.id,
        proposer: 'claude-web-search',
        before_law_name: ref.law_name,
        before_source_url: ref.source_url,
        before_status: ref.verification_status,
        proposed_law_name: verdict.proposed_law_name ?? null,
        proposed_source_url: verdict.proposed_source_url ?? null,
        proposed_status: verdict.status === 'unknown' ? null : verdict.status,
        superseded_by: verdict.superseded_by ?? null,
        reasoning: finalReasoning,
        raw_response: raw as object,
        confidence: forcedConfidence,
        cost_gbp: COST_PER_CALL_GBP,
        status: 'pending',
      });
      if (insErr) {
        errors.push(`insert ${ref.id}: ${insErr.message}`);
      } else {
        proposed++;
      }
    } catch (err) {
      errors.push(`${ref.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    proposed,
    cost_gbp: Number(totalCost.toFixed(4)),
    errors,
  });
}
