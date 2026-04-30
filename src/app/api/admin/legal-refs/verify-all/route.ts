/**
 * POST /api/admin/legal-refs/verify-all
 *
 * Founder-gated full re-verify. Reads every row in legal_references and
 * runs each through the same logic the per-id `/verify` endpoint uses,
 * in batches of 25 with 200 ms gaps between calls.
 *
 * Returns a JSON summary (counts + per-id results) at the end. We chose
 * a single final response over streaming because Vercel's serverless
 * boundary makes streaming JSON-lines fiddly to consume from the admin
 * page — the modal already shows progress against the existing
 * `/verify` endpoint when wired to a "verify all" button, and a 112-row
 * pass at <5 s/row finishes well inside `maxDuration = 800`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logPerplexityCall } from '@/lib/cost-ledger';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';

export const dynamic = 'force-dynamic';
export const maxDuration = 800;

const PERPLEXITY_MODEL = 'sonar-pro';
const BATCH = 25;
const INTER_CALL_GAP_MS = 200;

function getAdminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

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
  summary: string;
  category: string;
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
    `Return STRICT JSON only, no markdown, no commentary:`,
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
              'You are a UK legal-citation verification assistant. Return STRICT JSON only — no markdown, no commentary. If unsure, set confidence to "low" and explain in notes.',
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
              'return null for current_url rather than fabricating a primary citation.',
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

export async function POST(_request: NextRequest) {
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const allow = getAdminEmails();
    if (!user?.email || !allow.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  const { data: refs, error } = await admin
    .from('legal_references')
    .select('id, law_name, section, source_url, source_type, summary, category, created_at');

  if (error || !refs) {
    return NextResponse.json({ error: error?.message || 'Failed to read refs' }, { status: 500 });
  }

  const counts = { total: refs.length, verified: 0, updated: 0, superseded: 0, needs_review: 0, broken: 0, error: 0, auto_corrected: 0 };
  const perId: Array<{ id: string; status: string; auto_corrected: boolean }> = [];

  for (let i = 0; i < refs.length; i += BATCH) {
    const chunk = refs.slice(i, i + BATCH);
    for (const ref of chunk) {
      const verdict = await askPerplexity(buildPrompt(ref as LegalRefRow));
      if (!verdict) {
        counts.error += 1;
        perId.push({ id: ref.id, status: 'error', auto_corrected: false });
        continue;
      }
      logPerplexityCall({
        model: PERPLEXITY_MODEL,
        endpoint: '/api/admin/legal-refs/verify-all',
        userId,
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
      // Only treat current_url as a verified URL if it's from an
      // accepted UK legal authority. Same gate is applied to any URL
      // we would write into source_url below.
      const currentUrlAuthority = verdict.current_url
        ? checkUkLegalAuthority(verdict.current_url)
        : null;
      if (verdict.current_url && currentUrlAuthority?.reason === 'authority') {
        update.verified_url = verdict.current_url;
      }

      let autoCorrected = false;
      if (verdict.confidence === 'high' && verdict.superseded_by) {
        const parsed = parseSuperseded(verdict.superseded_by);
        const supersededUrlAuthority = parsed.url
          ? checkUkLegalAuthority(parsed.url)
          : null;
        update.law_name = parsed.law_name;
        if (parsed.url && supersededUrlAuthority?.reason === 'authority') {
          update.source_url = parsed.url;
        } else if (verdict.current_url && currentUrlAuthority?.reason === 'authority') {
          update.source_url = verdict.current_url;
        }
        status = 'superseded';
        autoCorrected = true;
      } else if (
        verdict.confidence === 'high' &&
        verdict.valid === false &&
        verdict.current_url &&
        currentUrlAuthority?.reason === 'authority'
      ) {
        update.source_url = verdict.current_url;
        status = 'updated';
        autoCorrected = true;
      } else if (verdict.confidence === 'medium') {
        status = 'needs_review';
      } else if (verdict.confidence === 'low') {
        status = 'broken';
      }

      update.verification_status = status;
      if (autoCorrected) update.auto_corrected = true;

      await admin.from('legal_references').update(update).eq('id', ref.id);

      // PR γ — audit-trail row.
      void admin.from('legal_ref_verifications').insert({
        ref_id: ref.id,
        verifier: 'perplexity-sonar-pro',
        triggered_by: userId ? 'manual-admin' : 'unknown',
        before_status: (ref as any).verification_status ?? null,
        after_status: status,
        before_url: (ref as any).source_url ?? null,
        after_url: (update.source_url as string | undefined) ?? (verdict.current_url ?? null),
        changes: { auto_corrected: autoCorrected },
        cost_gbp: 0.005 * 0.79,
        perplexity_response: verdict as any,
        notes: notes || null,
      });

      if (status === 'verified') counts.verified += 1;
      else if (status === 'updated') counts.updated += 1;
      else if (status === 'superseded') counts.superseded += 1;
      else if (status === 'needs_review') counts.needs_review += 1;
      else if (status === 'broken') counts.broken += 1;
      if (autoCorrected) counts.auto_corrected += 1;

      perId.push({ id: ref.id, status, auto_corrected: autoCorrected });
      await new Promise((r) => setTimeout(r, INTER_CALL_GAP_MS));
    }
  }

  return NextResponse.json({ ok: true, counts, results: perId });
}
