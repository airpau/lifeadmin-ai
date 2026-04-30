/**
 * POST /api/admin/legal-ref-corrections/:id/revert
 *
 * Founder one-click undo for an η auto-applied correction. Restores
 * the canonical `legal_references` row to the `before_*` snapshot
 * captured on the correction, marks the correction `status='reverted'`,
 * and writes an audit row.
 *
 * Founder-gated. Soft-fails if sibling tables are missing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason ?? 'Unauthorized' },
      { status: auth.status },
    );
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const supabase = getAdmin();

  // Load the correction row.
  let correction:
    | {
        id: string;
        legal_reference_id: string;
        status: string;
        before_law_name?: string | null;
        before_source_url?: string | null;
        before_section?: string | null;
      }
    | null = null;
  try {
    const { data, error } = await supabase
      .from('legal_ref_corrections')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json(
        { error: 'Correction not found (or table missing)' },
        { status: 404 },
      );
    }
    correction = data;
  } catch {
    return NextResponse.json(
      { error: 'legal_ref_corrections table unavailable' },
      { status: 503 },
    );
  }

  if (!correction || correction.status !== 'auto_applied') {
    return NextResponse.json(
      { error: 'Only auto_applied corrections can be reverted' },
      { status: 409 },
    );
  }

  // Restore canonical row from before_* snapshot.
  const restore: Record<string, unknown> = {};
  if (correction.before_law_name !== undefined && correction.before_law_name !== null)
    restore.law_name = correction.before_law_name;
  if (correction.before_source_url !== undefined && correction.before_source_url !== null)
    restore.source_url = correction.before_source_url;
  if (correction.before_section !== undefined && correction.before_section !== null)
    restore.section = correction.before_section;

  if (Object.keys(restore).length === 0) {
    return NextResponse.json(
      { error: 'No before_* snapshot to restore from' },
      { status: 422 },
    );
  }

  try {
    const { error } = await supabase
      .from('legal_references')
      .update(restore)
      .eq('id', correction.legal_reference_id);
    if (error) {
      return NextResponse.json(
        { error: `legal_references update failed: ${error.message}` },
        { status: 500 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'restore failed' },
      { status: 500 },
    );
  }

  // Mark correction as reverted.
  try {
    await supabase
      .from('legal_ref_corrections')
      .update({
        status: 'reverted',
        reviewed_by: 'founder-revert',
        notes: 'Founder reverted auto-applied change',
      })
      .eq('id', id);
  } catch {
    // best effort
  }

  // Audit row.
  try {
    await supabase.from('legal_ref_verifications').insert({
      legal_reference_id: correction.legal_reference_id,
      verifier: 'founder-revert',
      changes: { restored: restore, correction_id: correction.id },
      reasons: ['Founder one-click revert via admin UI'],
      verified_at: new Date().toISOString(),
    });
  } catch {
    // γ table may not exist — silent
  }

  return NextResponse.json({ ok: true, restored: restore });
}
