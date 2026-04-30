/**
 * POST /api/admin/legal-ref-corrections/:id/decision
 *
 * Founder-gated approval gate for proposed citation corrections.
 *
 * Body: { action: 'approve' | 'reject' | 'mark_duplicate', notes?: string }
 *
 * - approve        → applies proposed_law_name / proposed_source_url to the
 *                    matching legal_references row, sets verification_status
 *                    if proposed_status is set, stamps last_human_review_at,
 *                    writes audit row to legal_ref_verifications (γ table —
 *                    soft, swallowed if it doesn't exist yet).
 * - reject         → marks correction rejected. legal_references untouched.
 * - mark_duplicate → marks correction as duplicate. legal_references untouched.
 *
 * THIS IS THE HUMAN-IN-LOOP GATE. No code path may mutate a citation's
 * canonical fields except by approval here (or direct admin edit).
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

type Action = 'approve' | 'reject' | 'mark_duplicate';

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing correction id' }, { status: 400 });
  }

  let body: { action?: Action; notes?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const action = body.action;
  const notes = typeof body.notes === 'string' ? body.notes : undefined;

  if (!action || !['approve', 'reject', 'mark_duplicate'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be approve | reject | mark_duplicate' },
      { status: 400 },
    );
  }

  const supabase = getAdmin();

  const { data: correction, error: corrErr } = await supabase
    .from('legal_ref_corrections')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (corrErr) {
    return NextResponse.json({ error: corrErr.message }, { status: 500 });
  }
  if (!correction) {
    return NextResponse.json({ error: 'Correction not found' }, { status: 404 });
  }
  if (correction.status !== 'pending') {
    return NextResponse.json(
      { error: `Correction already ${correction.status}` },
      { status: 409 },
    );
  }

  const nowIso = new Date().toISOString();

  if (action === 'reject' || action === 'mark_duplicate') {
    const newStatus = action === 'reject' ? 'rejected' : 'duplicate';
    const { error: updErr } = await supabase
      .from('legal_ref_corrections')
      .update({
        status: newStatus,
        reviewed_at: nowIso,
        reviewed_by: auth.email,
        notes: notes ?? correction.notes ?? null,
      })
      .eq('id', id);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, status: newStatus });
  }

  // === approve ===
  const refUpdate: Record<string, unknown> = {
    last_human_review_at: nowIso,
    updated_at: nowIso,
  };
  if (correction.proposed_law_name) refUpdate.law_name = correction.proposed_law_name;
  if (correction.proposed_source_url) refUpdate.source_url = correction.proposed_source_url;
  if (correction.proposed_status) refUpdate.verification_status = correction.proposed_status;

  const { error: refErr } = await supabase
    .from('legal_references')
    .update(refUpdate)
    .eq('id', correction.ref_id);

  if (refErr) {
    return NextResponse.json(
      { error: `Failed to apply correction: ${refErr.message}` },
      { status: 500 },
    );
  }

  const { error: corrUpdErr } = await supabase
    .from('legal_ref_corrections')
    .update({
      status: 'approved',
      reviewed_at: nowIso,
      reviewed_by: auth.email,
      applied_at: nowIso,
      notes: notes ?? correction.notes ?? null,
    })
    .eq('id', id);

  if (corrUpdErr) {
    return NextResponse.json({ error: corrUpdErr.message }, { status: 500 });
  }

  // Audit log to γ's legal_ref_verifications table if it exists. PR γ may
  // not have landed yet — swallow the error so approvals don't break.
  try {
    await supabase.from('legal_ref_verifications').insert({
      ref_id: correction.ref_id,
      verifier: 'manual-approval-of-correction',
      result_status: correction.proposed_status ?? 'approved',
      reasoning: `Founder approved correction ${correction.id}. ${notes ?? ''}`.trim(),
      raw_response: correction.raw_response ?? null,
    });
  } catch {
    // γ table not present yet — notes-only fallback is the row above
  }

  return NextResponse.json({ ok: true, status: 'approved' });
}
