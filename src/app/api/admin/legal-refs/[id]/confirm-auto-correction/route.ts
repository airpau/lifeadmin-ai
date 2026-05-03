/**
 * POST /api/admin/legal-refs/:id/confirm-auto-correction
 *
 * Founder-gated. Marks an auto-corrected legal_references row as
 * confirmed (i.e. the founder has eyeballed the AI-overwritten citation
 * and accepts it). Sets `auto_corrected = false` and stamps
 * `last_human_review_at` so the row drops out of the "AI auto-correction
 * — please review" badge in the Compliance Centre.
 *
 * No content mutations — this only flips the verification flag. The
 * underlying canonical fields (law_name, source_url, verification_status)
 * were already set by the auto-apply path; the founder is just
 * acknowledging them.
 *
 * Phase 1 of the actionable Compliance Centre UX: gives the founder a
 * one-click way to clear the amber flag without scrolling to a separate
 * panel. Pairs with the inline diff panel rendered under the
 * auto-corrected row in the Review queue.
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

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing ref id' }, { status: 400 });
  }

  const supabase = getAdmin();

  const { data: ref, error: refErr } = await supabase
    .from('legal_references')
    .select('id, auto_corrected')
    .eq('id', id)
    .maybeSingle();

  if (refErr) {
    return NextResponse.json({ error: refErr.message }, { status: 500 });
  }
  if (!ref) {
    return NextResponse.json({ error: 'Ref not found' }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('legal_references')
    .update({
      auto_corrected: false,
      last_human_review_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Audit row in legal_ref_verifications. Soft-fail if the table isn't
  // present (older snapshots / pre-γ environments).
  try {
    await supabase.from('legal_ref_verifications').insert({
      ref_id: id,
      verifier: 'manual-confirm-auto-correction',
      result_status: 'confirmed',
      reasoning: `Founder confirmed AI auto-correction is correct (cleared auto_corrected flag).`,
    });
  } catch {
    // table-not-present — non-fatal
  }

  return NextResponse.json({ ok: true });
}
