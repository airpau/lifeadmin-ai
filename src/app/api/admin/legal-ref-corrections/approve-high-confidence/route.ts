/**
 * POST /api/admin/legal-ref-corrections/approve-high-confidence
 *
 * Founder-gated. One-click bulk approve of all pending corrections with
 * confidence='high'. Each row still goes through the same approve path
 * (one DB write per ref + one audit row per correction).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin(): Promise<
  { ok: true; email: string } | { ok: false; res: NextResponse }
> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes(user.email.toLowerCase())) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: user.email };
}

export async function POST(_request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const supabase = getAdmin();
  const nowIso = new Date().toISOString();

  const { data: pending, error: pendErr } = await supabase
    .from('legal_ref_corrections')
    .select('*')
    .eq('status', 'pending')
    .eq('confidence', 'high');

  if (pendErr) return NextResponse.json({ error: pendErr.message }, { status: 500 });
  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, approved: 0 });
  }

  let approved = 0;
  const errors: string[] = [];
  for (const c of pending) {
    const refUpdate: Record<string, unknown> = {
      last_human_review_at: nowIso,
      updated_at: nowIso,
    };
    if (c.proposed_law_name) refUpdate.law_name = c.proposed_law_name;
    if (c.proposed_source_url) refUpdate.source_url = c.proposed_source_url;
    if (c.proposed_status) refUpdate.verification_status = c.proposed_status;

    const { error: refErr } = await supabase
      .from('legal_references')
      .update(refUpdate)
      .eq('id', c.ref_id);
    if (refErr) {
      errors.push(`ref ${c.ref_id}: ${refErr.message}`);
      continue;
    }

    await supabase
      .from('legal_ref_corrections')
      .update({
        status: 'approved',
        reviewed_at: nowIso,
        reviewed_by: auth.email,
        applied_at: nowIso,
        notes: 'bulk-approved high-confidence',
      })
      .eq('id', c.id);

    try {
      await supabase.from('legal_ref_verifications').insert({
        ref_id: c.ref_id,
        verifier: 'manual-approval-of-correction',
        result_status: c.proposed_status ?? 'approved',
        reasoning: `Bulk approval (high confidence) of correction ${c.id}.`,
        raw_response: c.raw_response ?? null,
      });
    } catch {
      // γ table not present yet
    }
    approved++;
  }

  return NextResponse.json({ ok: true, approved, errors });
}
