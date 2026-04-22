/**
 * PATCH /api/disputes/[id]/correspondence/[entryId]
 *
 * Two modes, determined by the body payload:
 *
 * 1. EDIT — update content/title/entry_date of a user-owned entry
 *    Body: `{ content?: string; title?: string; entry_date?: string }`
 *    Any subset of those fields is accepted. The entry must belong to the
 *    caller. Auto-detected entries (detected_from_email = true) can be
 *    edited (AI can misread text) but not deleted.
 *
 * 2. MOVE — re-home an entry to a different dispute
 *    Body: `{ move_to_dispute_id: string }`
 *    Both disputes must belong to the caller. Decrements the source
 *    dispute's unread_reply_count if the entry was auto-imported.
 *
 * DELETE /api/disputes/[id]/correspondence/[entryId]
 *
 * Deletes a user-created correspondence entry. Auto-detected entries
 * (detected_from_email = true) are rejected with 403 — users can edit
 * the text but should not silently erase imported evidence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id: sourceDisputeId, entryId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  // ── MOVE MODE ──────────────────────────────────────────────────────────────────────────────
  if (body.move_to_dispute_id !== undefined) {
    const targetDisputeId: string = body.move_to_dispute_id;
    if (!targetDisputeId || typeof targetDisputeId !== 'string') {
      return NextResponse.json({ error: 'move_to_dispute_id must be a non-empty string' }, { status: 400 });
    }
    if (targetDisputeId === sourceDisputeId) {
      return NextResponse.json({ error: 'Source and target disputes are the same' }, { status: 400 });
    }

    // Ownership check on both disputes in one round-trip
    const { data: disputes, error: dErr } = await supabase
      .from('disputes')
      .select('id, unread_reply_count')
      .in('id', [sourceDisputeId, targetDisputeId])
      .eq('user_id', user.id);

    if (dErr) {
      console.error('[move-reply.disputes]', dErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const source = disputes?.find((d) => d.id === sourceDisputeId);
    const target = disputes?.find((d) => d.id === targetDisputeId);
    if (!source) return NextResponse.json({ error: 'Source dispute not found' }, { status: 404 });
    if (!target) {
      return NextResponse.json(
        { error: 'Target dispute not found — double-check the ID you pasted.' },
        { status: 404 },
      );
    }

    // Fetch the entry to confirm ownership
    const { data: entry, error: eErr } = await supabase
      .from('correspondence')
      .select('id, dispute_id, detected_from_email')
      .eq('id', entryId)
      .eq('dispute_id', sourceDisputeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (eErr) {
      console.error('[move-reply.entry]', eErr);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!entry) {
      return NextResponse.json({ error: 'Correspondence entry not found' }, { status: 404 });
    }

    const { error: uErr } = await supabase
      .from('correspondence')
      .update({ dispute_id: targetDisputeId })
      .eq('id', entryId)
      .eq('user_id', user.id);

    if (uErr) {
      console.error('[move-reply.update]', uErr);
      return NextResponse.json({ error: 'Failed to move reply' }, { status: 500 });
    }

    // Decrement unread counter on the source if it was auto-imported
    if (entry.detected_from_email) {
      const nextCount = Math.max(0, (source.unread_reply_count ?? 0) - 1);
      await supabase
        .from('disputes')
        .update({ unread_reply_count: nextCount })
        .eq('id', sourceDisputeId)
        .eq('user_id', user.id);
    }

    return NextResponse.json({ success: true, movedTo: targetDisputeId });
  }

  // ── EDIT MODE ──────────────────────────────────────────────────────────────────────────────
  const updates: Record<string, unknown> = {};
  if (body.content !== undefined) {
    if (typeof body.content !== 'string' || !body.content.trim()) {
      return NextResponse.json({ error: 'content must be a non-empty string' }, { status: 400 });
    }
    updates.content = body.content.trim();
  }
  if (body.title !== undefined) {
    updates.title = body.title ? String(body.title).trim() || null : null;
  }
  if (body.entry_date !== undefined) {
    updates.entry_date = body.entry_date;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided (content, title, entry_date)' }, { status: 400 });
  }

  // Verify the entry exists and belongs to the caller
  const { data: existingEntry, error: fetchErr } = await supabase
    .from('correspondence')
    .select('id, user_id, entry_type')
    .eq('id', entryId)
    .eq('dispute_id', sourceDisputeId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[edit-correspondence.fetch]', fetchErr);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  if (!existingEntry) {
    return NextResponse.json({ error: 'Correspondence entry not found' }, { status: 404 });
  }

  // AI-generated letters are read-only
  if (existingEntry.entry_type === 'ai_letter') {
    return NextResponse.json({ error: 'AI-generated letters cannot be edited' }, { status: 403 });
  }

  const { data: updated, error: updateErr } = await supabase
    .from('correspondence')
    .update(updates)
    .eq('id', entryId)
    .eq('dispute_id', sourceDisputeId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (updateErr) {
    console.error('[edit-correspondence.update]', updateErr);
    return NextResponse.json({ error: 'Failed to save changes' }, { status: 500 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> },
) {
  const { id: disputeId, entryId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch the entry to check ownership and whether it was auto-detected
  const { data: entry, error: fetchErr } = await supabase
    .from('correspondence')
    .select('id, user_id, detected_from_email, entry_type')
    .eq('id', entryId)
    .eq('dispute_id', disputeId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchErr) {
    console.error('[delete-correspondence.fetch]', fetchErr);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
  if (!entry) {
    return NextResponse.json({ error: 'Correspondence entry not found' }, { status: 404 });
  }

  // Auto-imported entries must not be silently deleted — only editing is allowed
  if (entry.detected_from_email) {
    return NextResponse.json(
      { error: 'Auto-imported entries cannot be deleted. You can edit the content if the AI misread it.' },
      { status: 403 },
    );
  }

  // AI-generated letters cannot be deleted either
  if (entry.entry_type === 'ai_letter') {
    return NextResponse.json(
      { error: 'AI-generated letters cannot be deleted from the dispute history.' },
      { status: 403 },
    );
  }

  const { error: deleteErr } = await supabase
    .from('correspondence')
    .delete()
    .eq('id', entryId)
    .eq('dispute_id', disputeId)
    .eq('user_id', user.id);

  if (deleteErr) {
    console.error('[delete-correspondence.delete]', deleteErr);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
