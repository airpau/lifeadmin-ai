import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/admin/legal-updates/[id]
 * Body: { action: 'approve' | 'reject', edited_update?: string }
 *
 * approve — applies proposed_update to the linked legal_reference, marks queue item approved
 * reject  — marks queue item rejected, no change to legal_references
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { action, edited_update } = body as { action: 'approve' | 'reject'; edited_update?: string };

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const admin = getAdmin();

  // Fetch the queue item
  const { data: item, error: fetchErr } = await admin
    .from('legal_update_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchErr || !item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (item.status !== 'pending') {
    return NextResponse.json({ error: 'Item already reviewed' }, { status: 409 });
  }

  if (action === 'reject') {
    await admin
      .from('legal_update_queue')
      .update({
        status: 'rejected',
        reviewed_by: user.email,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Log the rejection
    if (item.legal_reference_id) {
      await admin.from('legal_audit_log').insert({
        legal_reference_id: item.legal_reference_id,
        check_type: 'admin_review',
        result: 'rejected',
        details: `Rejected by ${user.email} on ${new Date().toISOString()}`,
      });
    }

    return NextResponse.json({ ok: true, action: 'rejected' });
  }

  // action === 'approve'
  const updateText = edited_update?.trim() || item.proposed_update;

  // Apply update to the legal reference if one is linked
  if (item.legal_reference_id && updateText) {
    const { error: updateErr } = await admin
      .from('legal_references')
      .update({
        summary: updateText,
        verification_status: 'updated',
        last_changed: new Date().toISOString(),
        verification_notes: `Admin-approved update by ${user.email} on ${new Date().toISOString()}. Change: ${item.detected_change_summary}`,
        updated_at: new Date().toISOString(),
        confidence_score: 100, // Reset confidence after manual review
      })
      .eq('id', item.legal_reference_id);

    if (updateErr) {
      return NextResponse.json({ error: 'Failed to update legal reference' }, { status: 500 });
    }

    await admin.from('legal_audit_log').insert({
      legal_reference_id: item.legal_reference_id,
      check_type: 'admin_review',
      result: 'approved',
      details: `Approved by ${user.email} on ${new Date().toISOString()}. Applied: ${updateText.slice(0, 200)}`,
    });
  }

  // Mark queue item as approved
  await admin
    .from('legal_update_queue')
    .update({
      status: 'approved',
      proposed_update: updateText, // save any edits the admin made
      reviewed_by: user.email,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  return NextResponse.json({ ok: true, action: 'approved', applied_to_ref: !!item.legal_reference_id });
}
