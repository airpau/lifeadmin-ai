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
              'You are a UK consumer-law research assistant. Return STRICT JSON only — no markdown.',
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

      // Mark prior pending corrections for the same ref as superseded.
      await supabase
        .from('legal_ref_corrections')
        .update({ status: 'superseded_by_newer', reviewed_at: nowIso, reviewed_by: 'reverify-cron' })
        .eq('ref_id', ref.id)
        .eq('status', 'pending');

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
        reasoning: verdict.reasoning,
        raw_response: raw as object,
        confidence: verdict.confidence,
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
