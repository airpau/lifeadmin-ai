/**
 * PATCH /api/disputes/[id]/correspondence/[entryId]
 *
 * Used to re-home a single correspondence entry from one dispute to another.
 * Primary use case: an auto-imported email reply was matched to the wrong
 * dispute and the user wants to move it to the right one.
 *
 * Body: `{ move_to_dispute_id: string }`
 *
 * Safety:
 *   - Both source and target disputes must belong to the caller.
 *   - Both must exist.
 *   - The entry must belong to the source dispute.
 *   - The source dispute's unread_reply_count is decremented if this was an
 *     auto-imported reply; the target's isn't bumped (the move is a user
 *     action — they've already "seen" it).
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
  const targetDisputeId: string | undefined = body?.move_to_dispute_id;
  if (!targetDisputeId || typeof targetDisputeId !== 'string') {
    return NextResponse.json(
      { error: 'Missing move_to_dispute_id in body' },
      { status: 400 },
    );
  }
  if (targetDisputeId === sourceDisputeId) {
    return NextResponse.json(
      { error: 'Source and target disputes are the same' },
      { status: 400 },
    );
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

  // Fetch the entry to confirm ownership + branch on type
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

  // Move the entry
  const { error: uErr } = await supabase
    .from('correspondence')
    .update({ dispute_id: targetDisputeId })
    .eq('id', entryId)
    .eq('user_id', user.id);

  if (uErr) {
    console.error('[move-reply.update]', uErr);
    return NextResponse.json({ error: 'Failed to move reply' }, { status: 500 });
  }

  // If it was an auto-imported reply, decrement the source's unread counter.
  // We don't bump the target's because the user explicitly moved it here —
  // they've already seen it.
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
