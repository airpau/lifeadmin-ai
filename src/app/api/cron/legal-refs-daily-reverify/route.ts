/**
 * GET /api/cron/legal-refs-daily-reverify
 *
 * Daily 04:00 UTC. Picks up to 30 refs per run:
 *   1. Top 20 oldest by `last_verified ASC NULLS FIRST`.
 *   2. Plus any ref cited in `legal_ref_usages` in the last 24 h that
 *      hasn't been verified in the last 7 days.
 *   3. Capped at 30 refs total to keep daily spend under £0.15.
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
import { logPerplexityCall } from '@/lib/cost-ledger';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PERPLEXITY_MODEL = 'sonar-pro';
const HARD_CAP = 30;
const OLDEST_TARGET = 20;
const RECENT_USAGE_HOURS = 24;
const RECENT_USAGE_REVERIFY_DAYS = 7;
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

async function askPerplexity(prompt: string): Promise<PerplexityVerdict | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          { role: 'system', content: [
              'You are a UK legal-citation verification assistant. Return STRICT JSON only.',
              '',
              'CITATION SOURCE RULE (mandatory): Only return URLs from primary UK legal',
              'authorities — legislation.gov.uk, gov.uk subdomains, fca.org.uk, ofcom.org.uk,',
              'ofgem.gov.uk, financial-ombudsman.org.uk, parliament.uk, bailii.org,',
              'judiciary.uk, supremecourt.uk, ico.org.uk, cma.gov.uk, caa.co.uk, orr.gov.uk, nhs.uk.',
              'NEVER cite trade associations (UK Finance, ABI, BSA), commentary sites, news,',
              'law-firm blogs, Wikipedia, MoneySavingExpert, Which?, or aggregators. If the',
              'only available source is a non-authority site, return null rather than fabricating.',
            ].join('\n') },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const conf = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low' ? parsed.confidence : 'low';
    return {
      valid: !!parsed.valid,
      current_url: typeof parsed.current_url === 'string' ? parsed.current_url : null,
      superseded_by: typeof parsed.superseded_by === 'string' ? parsed.superseded_by : null,
      confidence: conf,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch {
    return null;
  }
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

  const { data: oldest } = await admin
    .from('legal_references')
    .select('id, law_name, section, source_url, source_type, category, verification_status, last_verified, created_at')
    .order('last_verified', { ascending: true, nullsFirst: true })
    .limit(OLDEST_TARGET);

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

  const seen = new Set<string>();
  const queue: LegalRefRow[] = [];
  for (const r of [...(oldest || []), ...recentRefs] as LegalRefRow[]) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    queue.push(r);
    if (queue.length >= HARD_CAP) break;
  }

  const counts = { processed: 0, errors: 0, queued: 0, no_change: 0 };

  for (const ref of queue) {
    const verdict = await askPerplexity(buildPrompt(ref));
    if (!verdict) {
      counts.errors += 1;
      void admin.from('legal_ref_verifications').insert({
        ref_id: ref.id,
        verifier: 'perplexity-sonar-pro',
        triggered_by: 'cron',
        before_status: ref.verification_status,
        after_status: 'error',
        before_url: ref.source_url,
        after_url: null,
        notes: 'Perplexity call failed',
      });
      continue;
    }

    logPerplexityCall({
      model: PERPLEXITY_MODEL,
      endpoint: '/api/cron/legal-refs-daily-reverify',
      userId: null,
      metadata: { legal_reference_id: ref.id },
    });

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
      void admin.from('legal_ref_verifications').insert({
        ref_id: ref.id,
        verifier: 'perplexity-sonar-pro',
        triggered_by: 'cron',
        before_status: ref.verification_status,
        after_status: ref.verification_status,
        before_url: ref.source_url,
        after_url: ref.source_url,
        changes: { no_change: true },
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
        proposer: 'perplexity-sonar-pro',
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
        verifier: 'perplexity-sonar-pro',
        triggered_by: 'cron',
        before_status: ref.verification_status,
        after_status: 'error',
        before_url: ref.source_url,
        after_url: null,
        changes: { corrections_insert_failed: true, error: insErr.message },
        cost_gbp: COST_PER_CALL_GBP * 0.79,
        perplexity_response: verdict as any,
        notes: `corrections insert failed: ${insErr.message}`,
      });
    } else {
      counts.queued += 1;
      void admin.from('legal_ref_verifications').insert({
        ref_id: ref.id,
        verifier: 'perplexity-sonar-pro',
        triggered_by: 'cron',
        before_status: ref.verification_status,
        after_status: 'pending-correction-queued',
        before_url: ref.source_url,
        after_url: proposal.proposed_source_url,
        changes: {
          queued_correction: true,
          correction_id: correctionId ?? null,
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

  return NextResponse.json({ ok: true, queued: queue.length, counts });
}
