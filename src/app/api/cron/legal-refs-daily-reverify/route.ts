/**
 * GET /api/cron/legal-refs-daily-reverify
 *
 * Daily 04:00 UTC. Picks up to 30 refs per run:
 *   1. Top 20 oldest by `last_verified ASC NULLS FIRST`.
 *   2. Plus any ref cited in `legal_ref_usages` in the last 24 h that
 *      hasn't been verified in the last 7 days.
 *   3. Capped at 30 refs total to keep daily spend under £0.15.
 *
 * Each ref runs through the same Perplexity flow as the admin
 * `/api/admin/legal-refs/verify` endpoint, including the auto-overwrite
 * + audit-row write.
 *
 * Auth: standard Vercel cron Bearer (CRON_SECRET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { logPerplexityCall } from '@/lib/cost-ledger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PERPLEXITY_MODEL = 'sonar-pro';
const HARD_CAP = 30;
const OLDEST_TARGET = 20;
const RECENT_USAGE_HOURS = 24;
const RECENT_USAGE_REVERIFY_DAYS = 7;

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
          { role: 'system', content: 'You are a UK legal-citation verification assistant. Return STRICT JSON only.' },
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

function parseSuperseded(s: string): { law_name: string; url: string | null } {
  const urlMatch = s.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0].replace(/[)\].,;]+$/, '') : null;
  const title = s
    .replace(urlMatch?.[0] ?? '', '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[—–\-:]\s*/, '');
  return { law_name: title || s.trim(), url };
}

function deriveStatus(verdict: PerplexityVerdict): string {
  if (verdict.superseded_by) return 'superseded';
  if (!verdict.valid) return 'broken';
  if (verdict.valid && verdict.confidence !== 'low') return 'verified';
  return 'needs_review';
}

export async function GET(request: NextRequest) {
  // Cron secret — matches the existing pattern across the repo.
  const authHeader = request.headers.get('Authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  // 1. Oldest by last_verified, NULLS FIRST.
  const { data: oldest } = await admin
    .from('legal_references')
    .select('id, law_name, section, source_url, source_type, category, verification_status, last_verified, created_at')
    .order('last_verified', { ascending: true, nullsFirst: true })
    .limit(OLDEST_TARGET);

  // 2. Recently used + not verified in last 7 days.
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

  // Merge + dedupe + cap at HARD_CAP.
  const seen = new Set<string>();
  const queue: LegalRefRow[] = [];
  for (const r of [...(oldest || []), ...recentRefs] as LegalRefRow[]) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    queue.push(r);
    if (queue.length >= HARD_CAP) break;
  }

  const counts = { processed: 0, errors: 0, auto_corrected: 0 };

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

    let status = deriveStatus(verdict);
    const notes = verdict.superseded_by
      ? `Superseded by: ${verdict.superseded_by}. ${verdict.notes}`.trim()
      : verdict.notes;
    const update: Record<string, unknown> = {
      last_verified: new Date().toISOString(),
      verification_notes: notes || null,
    };
    if (verdict.current_url) update.verified_url = verdict.current_url;

    let autoCorrected = false;
    if (verdict.confidence === 'high' && verdict.superseded_by) {
      const parsed = parseSuperseded(verdict.superseded_by);
      update.law_name = parsed.law_name;
      if (parsed.url) update.source_url = parsed.url;
      else if (verdict.current_url) update.source_url = verdict.current_url;
      status = 'superseded';
      autoCorrected = true;
    } else if (verdict.confidence === 'high' && verdict.valid === false && verdict.current_url) {
      update.source_url = verdict.current_url;
      status = 'updated';
      autoCorrected = true;
    } else if (verdict.confidence === 'medium') {
      status = 'needs_review';
    } else if (verdict.confidence === 'low') {
      status = 'broken';
    }

    update.verification_status = status;
    if (autoCorrected) {
      update.auto_corrected = true;
      counts.auto_corrected += 1;
    }

    await admin.from('legal_references').update(update).eq('id', ref.id);

    void admin.from('legal_ref_verifications').insert({
      ref_id: ref.id,
      verifier: 'perplexity-sonar-pro',
      triggered_by: 'cron',
      before_status: ref.verification_status,
      after_status: status,
      before_url: ref.source_url,
      after_url: (update.source_url as string | undefined) ?? (verdict.current_url ?? null),
      changes: { auto_corrected: autoCorrected },
      cost_gbp: 0.005 * 0.79,
      perplexity_response: verdict as any,
      notes: notes || null,
    });

    counts.processed += 1;
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({ ok: true, queued: queue.length, counts });
}
