/**
 * /api/cron/reverify-all-legal-refs — daily 03:30 UTC (configured in vercel.json)
 *
 * Propose-only nightly re-verifier. Pulls every legal reference (prioritised
 * by oldest last_verified, then oldest last_human_review_at), caps at 25 refs
 * per run, asks Perplexity Sonar for a verification verdict, and writes any
 * discrepancies as rows in legal_ref_corrections with status='pending'.
 *
 * Does NOT mutate legal_references citation fields. Only touches
 * `last_verified` and `verification_notes` (observational fields). Founder
 * reviews the corrections queue and decides what to apply.
 *
 * Cost cap: ~25 calls × ~£0.005 = ~£0.13/day.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { logPerplexityCall } from '@/lib/cost-ledger';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const MAX_PER_RUN = 25;
const PERPLEXITY_MODEL = 'sonar-pro';
const COST_PER_CALL_GBP = 0.005;

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

async function verifyWithPerplexity(ref: {
  id: string;
  law_name: string;
  source_url: string;
  summary: string;
}): Promise<{ verdict: PerplexityVerdict; raw: unknown } | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  const prompt = `Verify this UK legal reference is still current and correctly named/linked.

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

  let res: Response;
  try {
    res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          {
            role: 'system',
            content:
              [
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
              ].join('\n'),
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 600,
        temperature: 0.1,
      }),
    });
  } catch (err) {
    console.error('[reverify] perplexity fetch failed', err);
    return null;
  }

  if (!res.ok) {
    console.error(`[reverify] perplexity ${res.status}`);
    return null;
  }
  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content || '';
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: PerplexityVerdict;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  return { verdict: parsed, raw: data };
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
      const result = await verifyWithPerplexity({
        id: ref.id,
        law_name: ref.law_name,
        source_url: ref.source_url,
        summary: ref.summary,
      });
      checked++;
      totalCost += COST_PER_CALL_GBP;

      // Fire-and-forget cost ledger
      try {
        logPerplexityCall({
          model: PERPLEXITY_MODEL,
          endpoint: '/api/cron/reverify-all-legal-refs',
          metadata: { ref_id: ref.id },
        });
      } catch {
        /* swallow */
      }

      if (!result) {
        await supabase
          .from('legal_references')
          .update({
            last_verified: nowIso,
            verification_notes: 'reverify-cron: perplexity unavailable',
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

      // If perplexity says current and didn't propose anything, no correction.
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
          void supabase.from('legal_ref_verifications').insert({
            ref_id: ref.id,
            verifier: 'perplexity-sonar-pro',
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
        proposer: 'perplexity-sonar-pro',
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
