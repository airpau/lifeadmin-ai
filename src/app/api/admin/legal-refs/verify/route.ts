/**
 * POST /api/admin/legal-refs/verify
 *
 * Founder-gated AI verification of a single legal_references row (or up
 * to 25 rows in a batch). Calls Perplexity sonar-pro with a strict-JSON
 * prompt asking whether the citation is still accurate, whether the URL
 * still resolves to the right document, and whether it has been
 * superseded. Updates the row with the result and logs the spend to the
 * api_cost_ledger via logPerplexityCall.
 *
 * Body (single):  { id: string }
 * Body (batch):   { ids: string[] }   // max 25
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { logPerplexityCall } from '@/lib/cost-ledger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_BATCH = 25;
const PERPLEXITY_MODEL = 'sonar-pro';

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

interface VerifyResult {
  id: string;
  status: string;
  current_url: string | null;
  notes: string;
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
              'You are a UK legal-citation verification assistant. Return STRICT JSON only — no markdown, no commentary. If unsure, set confidence to "low" and explain in notes.',
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

function deriveStatus(verdict: PerplexityVerdict): string {
  if (verdict.superseded_by) return 'superseded';
  if (!verdict.valid) return 'broken';
  if (verdict.valid && verdict.confidence !== 'low') return 'verified';
  return 'needs_review';
}

/**
 * Best-effort parse of a free-text supersession string into a structured
 * (law_name, section, url) tuple. Perplexity returns things like:
 *   "Consumer Rights Act 2015, s.20 (https://...)" — extract the URL,
 *   strip it from the title, and use what remains as the new law_name.
 * If we can't pull a URL out, return only the trimmed title.
 */
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

async function verifyOne(id: string, userId: string | null): Promise<VerifyResult> {
  const admin = getAdmin();
  const { data: ref, error } = await admin
    .from('legal_references')
    .select('id, law_name, section, source_url, source_type, summary, category, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !ref) {
    return { id, status: 'error', current_url: null, notes: '', error: 'Reference not found' };
  }

  const verdict = await askPerplexity(buildPrompt(ref as LegalRefRow));
  if (!verdict) {
    // PR γ — record the failed attempt in the audit table too.
    void admin.from('legal_ref_verifications').insert({
      ref_id: id,
      verifier: 'perplexity-sonar-pro',
      triggered_by: userId ? 'manual-admin' : 'unknown',
      before_status: (ref as any).verification_status ?? null,
      after_status: 'error',
      before_url: (ref as any).source_url ?? null,
      after_url: null,
      changes: null,
      cost_gbp: null,
      perplexity_response: null,
      notes: 'Perplexity call failed',
    });
    return {
      id,
      status: 'error',
      current_url: null,
      notes: '',
      error: 'Perplexity call failed',
    };
  }

  // Log spend (fire-and-forget).
  logPerplexityCall({
    model: PERPLEXITY_MODEL,
    endpoint: '/api/admin/legal-refs/verify',
    userId,
    metadata: { legal_reference_id: id },
  });

  let status = deriveStatus(verdict);
  const notes = verdict.superseded_by
    ? `Superseded by: ${verdict.superseded_by}. ${verdict.notes}`.trim()
    : verdict.notes;

  const update: Record<string, unknown> = {
    last_verified: new Date().toISOString(),
    verification_notes: notes || null,
  };
  if (verdict.current_url) {
    update.verified_url = verdict.current_url;
  }

  // Auto-overwrite logic (PR α). High-confidence corrections rewrite the
  // canonical fields so a single "Verify all" run establishes a clean
  // baseline. Medium / low confidence never touches the canonical row —
  // founder reviews via the "auto_corrected" badge before relying on it.
  let autoCorrected = false;
  if (verdict.confidence === 'high' && verdict.superseded_by) {
    const parsed = parseSuperseded(verdict.superseded_by);
    update.law_name = parsed.law_name;
    if (parsed.url) update.source_url = parsed.url;
    else if (verdict.current_url) update.source_url = verdict.current_url;
    status = 'superseded';
    autoCorrected = true;
  } else if (
    verdict.confidence === 'high' &&
    verdict.valid === false &&
    verdict.current_url
  ) {
    update.source_url = verdict.current_url;
    status = 'updated';
    autoCorrected = true;
  } else if (verdict.confidence === 'medium') {
    // Never overwrite canonical on medium — keep status as needs_review
    // regardless of what deriveStatus returned. Only verified_url +
    // notes are written above.
    status = 'needs_review';
  } else if (verdict.confidence === 'low') {
    // Leave canonical untouched. Mark broken so the founder sees it.
    status = 'broken';
  }

  update.verification_status = status;
  if (autoCorrected) update.auto_corrected = true;

  const { error: updateError } = await admin
    .from('legal_references')
    .update(update)
    .eq('id', id);

  if (updateError) {
    return {
      id,
      status: 'error',
      current_url: verdict.current_url,
      notes,
      error: `DB update failed: ${updateError.message}`,
    };
  }

  // PR γ — audit-trail row.
  void admin.from('legal_ref_verifications').insert({
    ref_id: id,
    verifier: 'perplexity-sonar-pro',
    triggered_by: userId ? 'manual-admin' : 'unknown',
    before_status: (ref as any).verification_status ?? null,
    after_status: status,
    before_url: (ref as any).source_url ?? null,
    after_url: (update.source_url as string | undefined) ?? (verdict.current_url ?? null),
    changes: {
      auto_corrected: autoCorrected,
      law_name_changed: !!update.law_name,
      url_changed: !!update.source_url,
    },
    cost_gbp: 0.005 * 0.79,
    perplexity_response: verdict as any,
    notes: notes || null,
  });

  return {
    id,
    status,
    current_url: verdict.current_url,
    notes,
  };
}

export async function POST(request: NextRequest) {
  // Founder gate.
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
