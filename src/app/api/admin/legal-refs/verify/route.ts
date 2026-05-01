/**
 * POST /api/admin/legal-refs/verify
 *
 * Founder-gated AI verification of a single legal_references row (or up
 * to 25 rows in a batch). Calls Perplexity sonar-pro with a strict-JSON
 * prompt asking whether the citation is still accurate, whether the URL
 * still resolves to the right document, and whether it has been
 * superseded.
 *
 * COMPLIANCE PRINCIPLE (non-negotiable):
 *   No code path may directly mutate a citation's law_name, source_url,
 *   source_type, or verification_status to a non-pending value without
 *   passing through `legal_ref_corrections` and a founder approval click.
 *
 * Implementation:
 *   - If Perplexity proposes a change to canonical fields (law_name /
 *     source_url) OR a new authoritative current_url, INSERT a
 *     `legal_ref_corrections` row with status='pending'. The auto-apply
 *     sweep (post-enrichment) decides if it can be applied without
 *     founder click.
 *   - If Perplexity says the citation is current with no proposed
 *     change, return `{status: 'no_change'}` and only touch
 *     `last_verified` / `verification_notes` (observational fields).
 *   - We never overwrite verification_status to a non-pending value
 *     directly from this route.
 *
 * Body (single):  { id: string }
 * Body (batch):   { ids: string[] }   // max 25
 *
 * Response (single): { updated: VerifyResult }
 * Response (batch):  { results: VerifyResult[] }
 *
 * VerifyResult.status is one of:
 *   - 'no_change'    — verdict matches canonical; only last_verified touched
 *   - 'queued'       — proposed correction inserted into legal_ref_corrections
 *   - 'auto_applied' — proposed correction passed all three auto-apply gates
 *                      (rare from this route — enrichment is usually run
 *                      separately by the ζ cron before the η sweep)
 *   - 'error'        — Perplexity / DB call failed
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { logPerplexityCall } from '@/lib/cost-ledger';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';
import {
  fetchStatuteByUri,
  isLegislationDocAuthoritative,
  isLegislationGovUkUrl,
  type LegislationDoc,
} from '@/lib/legal-data/legislation-gov-uk';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BATCH = 25;
const PERPLEXITY_MODEL = 'sonar-pro';
const COST_PER_CALL_GBP = 0.005;

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
  verification_status: string | null;
}

interface PerplexityVerdict {
  valid: boolean;
  current_url: string | null;
  superseded_by: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

interface VerifyResult {
  id: string;
  status: 'no_change' | 'queued' | 'auto_applied' | 'error';
  current_url: string | null;
  notes: string;
  correction_id?: string;
  error?: string;
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
  if (!apiKey) {
    console.warn('[legal-refs/verify] PERPLEXITY_API_KEY not set');
    return null;
  }
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          {
            role: 'system',
            content:
              [
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
              ].join('\n'),
          },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      console.error(`[legal-refs/verify] Perplexity ${res.status}`);
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const conf = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
      ? parsed.confidence
      : 'low';
    return {
      valid: !!parsed.valid,
      current_url: typeof parsed.current_url === 'string' ? parsed.current_url : null,
      superseded_by: typeof parsed.superseded_by === 'string' ? parsed.superseded_by : null,
      confidence: conf,
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
  } catch (err: any) {
    console.error('[legal-refs/verify] Perplexity error:', err?.message || err);
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

/**
 * Decide whether the verdict represents a real proposed change to canonical
 * citation fields, or whether it is a no-op (just confirming current state).
 */
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
  // Never propose a non-authority URL — drop instead.
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
  } else if (verdict.valid && verdict.confidence !== 'low') {
    // current — only count as a proposal if URL differs.
    proposed_status = null;
  } else if (verdict.confidence === 'low') {
    proposed_status = 'needs_review';
  }

  // Filter no-op URL.
  if (
    proposed_source_url &&
    normaliseUrl(proposed_source_url) === normaliseUrl(ref.source_url)
  ) {
    proposed_source_url = null;
  }
  // Filter no-op name.
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

/**
 * Build a PerplexityVerdict-shaped object from a canonical legislation.gov.uk
 * document. We reuse the existing verdict shape so the rest of the pipeline
 * (deriveProposal / corrections insert / auto-apply gates) is unchanged —
 * the only difference is the verifier label on the audit trail.
 */
function verdictFromLegislationDoc(
  ref: LegalRefRow,
  doc: LegislationDoc,
): PerplexityVerdict {
  // Same-host citation that resolves with a body and matching title is
  // by definition still valid. We never claim "superseded" from this
  // client; supersession is detected by the per-Act effects feed cron.
  const sameUrl = normaliseUrl(doc.sourceUrl) === normaliseUrl(ref.source_url) ||
    normaliseUrl(doc.sourceUrl).replace(/\/data\.xml$/, '') === normaliseUrl(ref.source_url);
  const titleMatches = doc.title.trim().toLowerCase() === ref.law_name.trim().toLowerCase();
  return {
    valid: true,
    // Strip /data.xml when proposing the canonical URL — we want the
    // human-readable URL on the row, not the XML representation.
    current_url: doc.sourceUrl.replace(/\/data\.xml$/, ''),
    superseded_by: null,
    confidence: titleMatches && sameUrl ? 'high' : doc.hasUnappliedEffects ? 'medium' : 'high',
    notes: [
      `Verified against legislation.gov.uk canonical XML.`,
      titleMatches ? null : `Title differs: canonical='${doc.title}', stored='${ref.law_name}'.`,
      doc.hasUnappliedEffects ? `Note: <ukm:UnappliedEffects> flagged — pending change not yet incorporated.` : null,
      doc.lastAmended ? `Last amended: ${doc.lastAmended}.` : null,
      `Source: legislation.gov.uk (Crown Copyright, OGL v3.0).`,
    ].filter(Boolean).join(' '),
  };
}

async function verifyOne(id: string, userId: string | null): Promise<VerifyResult> {
  const admin = getAdmin();
  const { data: ref, error } = await admin
    .from('legal_references')
    .select('id, law_name, section, source_url, source_type, summary, category, created_at, verification_status')
    .eq('id', id)
    .maybeSingle();

  if (error || !ref) {
    return { id, status: 'error', current_url: null, notes: '', error: 'Reference not found' };
  }

  // PRIMARY SOURCE: legislation.gov.uk.
  // Per docs/legal-data-api-research-2026-05-01.md, every UK statute we
  // cite is hosted on legislation.gov.uk and can be fetched canonically
  // as Akoma-Ntoso XML. If the stored source_url is on that host, we
  // try the canonical fetcher FIRST and only fall back to Perplexity
  // when the fetch fails or returns no body.
  let verdict: PerplexityVerdict | null = null;
  let verifierLabel: 'legislation-gov-uk' | 'perplexity-sonar-pro' = 'perplexity-sonar-pro';
  if (isLegislationGovUkUrl((ref as LegalRefRow).source_url)) {
    const doc = await fetchStatuteByUri((ref as LegalRefRow).source_url);
    // We must NOT treat the canonical fetch as authoritative just because
    // the XML parsed and had a title. If the URL targets a section but the
    // parser didn't find that section, OR the URL targets a whole Act but
    // the title doesn't match the stored law_name, we have to fall through
    // to Perplexity — otherwise an unmatched fetch silently masquerades as
    // "no_change" and never gets re-grounded. (Codex P1 #415)
    const auth = isLegislationDocAuthoritative(doc, ref as LegalRefRow);
    if (doc && auth.authoritative) {
      verdict = verdictFromLegislationDoc(ref as LegalRefRow, doc);
      verifierLabel = 'legislation-gov-uk';
    } else {
      console.warn(
        '[legal-refs/verify] legislation.gov.uk fetch not authoritative; falling back to Perplexity',
        { ref_id: id, source_url: (ref as LegalRefRow).source_url, reason: auth.reason },
      );
    }
  }

  if (!verdict) {
    verdict = await askPerplexity(buildPrompt(ref as LegalRefRow));
  }
  if (!verdict) {
    void admin.from('legal_ref_verifications').insert({
      ref_id: id,
      verifier: verifierLabel,
      triggered_by: userId ? 'manual-admin' : 'unknown',
      before_status: (ref as any).verification_status ?? null,
      after_status: 'error',
      before_url: (ref as any).source_url ?? null,
      after_url: null,
      changes: null,
      cost_gbp: null,
      perplexity_response: null,
      notes: 'Verification call failed (legislation.gov.uk + Perplexity)',
    });
    return {
      id,
      status: 'error',
      current_url: null,
      notes: '',
      error: 'Verification call failed',
    };
  }

  // Log spend (fire-and-forget) — only when we actually paid Perplexity.
  if (verifierLabel === 'perplexity-sonar-pro') {
    logPerplexityCall({
      model: PERPLEXITY_MODEL,
      endpoint: '/api/admin/legal-refs/verify',
      userId,
      metadata: { legal_reference_id: id },
    });
  }

  const refRow = ref as LegalRefRow;
  const proposal = deriveProposal(refRow, verdict);
  const notes = verdict.superseded_by
    ? `Superseded by: ${verdict.superseded_by}. ${verdict.notes}`.trim()
    : verdict.notes;

  // ALWAYS touch the observational fields (last_verified, verification_notes).
  // NEVER touch canonical fields (law_name, source_url, source_type) or set
  // verification_status to a non-pending value here.
  void admin
    .from('legal_references')
    .update({
      last_verified: new Date().toISOString(),
      verification_notes: notes || null,
    })
    .eq('id', id);

  // No proposed change → no_change. Don't pollute the corrections queue.
  if (!proposal.hasProposal) {
    void admin.from('legal_ref_verifications').insert({
      ref_id: id,
      verifier: verifierLabel,
      triggered_by: userId ? 'manual-admin' : 'unknown',
      before_status: refRow.verification_status,
      after_status: refRow.verification_status,
      before_url: refRow.source_url,
      after_url: refRow.source_url,
      changes: { no_change: true },
      cost_gbp: verifierLabel === 'perplexity-sonar-pro' ? COST_PER_CALL_GBP * 0.79 : 0,
      perplexity_response: verdict as any,
      notes: notes || null,
    });
    return {
      id,
      status: 'no_change',
      current_url: verdict.current_url,
      notes,
    };
  }

  // Mark prior pending corrections for this ref as superseded.
  await admin
    .from('legal_ref_corrections')
    .update({
      status: 'superseded_by_newer',
      reviewed_at: new Date().toISOString(),
      reviewed_by: 'verify-route-new-proposal',
    })
    .eq('ref_id', id)
    .eq('status', 'pending');

  // Insert the proposed correction. Founder reviews via /dashboard/admin/legal-refs.
  const { data: insertedRows, error: insErr } = await admin
    .from('legal_ref_corrections')
    .insert({
      ref_id: id,
      proposer: verifierLabel,
      before_law_name: refRow.law_name,
      before_source_url: refRow.source_url,
      before_status: refRow.verification_status,
      proposed_law_name: proposal.proposed_law_name,
      proposed_source_url: proposal.proposed_source_url,
      proposed_status: proposal.proposed_status,
      superseded_by: proposal.superseded_by,
      reasoning: notes || null,
      raw_response: verdict as any,
      confidence: verdict.confidence,
      cost_gbp: verifierLabel === 'perplexity-sonar-pro' ? COST_PER_CALL_GBP : 0,
      status: 'pending',
    })
    .select('id')
    .limit(1);

  if (insErr) {
    return {
      id,
      status: 'error',
      current_url: verdict.current_url,
      notes,
      error: `Corrections insert failed: ${insErr.message}`,
    };
  }

  const correctionId = insertedRows?.[0]?.id;

  // Audit row in legal_ref_verifications.
  void admin.from('legal_ref_verifications').insert({
    ref_id: id,
    verifier: verifierLabel,
    triggered_by: userId ? 'manual-admin' : 'unknown',
    before_status: refRow.verification_status,
    after_status: 'pending-correction-queued',
    before_url: refRow.source_url,
    after_url: proposal.proposed_source_url,
    changes: {
      queued_correction: true,
      correction_id: correctionId ?? null,
      proposed_law_name: proposal.proposed_law_name,
      proposed_source_url: proposal.proposed_source_url,
      proposed_status: proposal.proposed_status,
    },
    cost_gbp: verifierLabel === 'perplexity-sonar-pro' ? COST_PER_CALL_GBP * 0.79 : 0,
    perplexity_response: verdict as any,
    notes: notes || null,
  });

  return {
    id,
    status: 'queued',
    current_url: verdict.current_url,
    notes,
    correction_id: correctionId,
  };
}

export async function POST(request: NextRequest) {
  // Founder gate — accepts both founder cookie auth AND Bearer CRON_SECRET
  // (the weekly /api/cron/legal-refs-reverify cron calls into this route).
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason || 'Unauthorized' }, { status: auth.status });
  }
  const userId: string | null = auth.userId ?? null;

  let body: { id?: string; ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (body.id && typeof body.id === 'string') {
    const result = await verifyOne(body.id, userId);
    return NextResponse.json({ updated: result });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    if (body.ids.length > MAX_BATCH) {
      return NextResponse.json(
        { error: `Too many ids — max ${MAX_BATCH} per request` },
        { status: 400 }
      );
    }
    const results: VerifyResult[] = [];
    // Sequential to avoid Perplexity rate limits.
    for (const id of body.ids) {
      if (typeof id !== 'string') continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await verifyOne(id, userId);
      results.push(r);
    }
    return NextResponse.json({ results });
  }

  return NextResponse.json({ error: 'Body must be { id } or { ids: [...] }' }, { status: 400 });
}
