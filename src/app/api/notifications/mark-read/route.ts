/**
 * POST /api/notifications/mark-read
 *
 * Body: `{ id?: string, ids?: string[], all?: boolean }`
 *   - `id` / `ids` — mark specific notifications as read
 *   - `all: true` — mark every unread notification as read
 *
 * Also bumps the matching dispute's `unread_reply_count` down when a
 * dispute_reply notification is read, so the badge on the list clears in sync
 * with the bell.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: string; ids?: string[]; all?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const now = new Date().toISOString();
  const targets: string[] = [];
  if (body.id) targets.push(body.id);
  if (Array.isArray(body.ids)) targets.push(...body.ids.filter((x): x is string => typeof x === 'string'));

  // Fetch the unread notifications we're about to mark, so we can roll back
  // any linked dispute counters atomically.
  let query = supabase
    .from('user_notifications')
    .select('id, dispute_id, type, read_at')
    .eq('user_id', user.id)
    .is('read_at', null);

  if (!body.all) {
    if (targets.length === 0) {
      return NextResponse.json({ error: 'No ids provided' }, { status: 400 });
    }
    query = query.in('id', targets);
  }

  const { data: toMark, error: selErr } = await query;
  if (selErr) {
    console.error('[notifications.markRead.select]', selErr);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }

  const ids = (toMark ?? []).map((n) => n.id);
  if (ids.length === 0) {
    return NextResponse.json({ success: true, marked: 0 });
  }

  const { error: updErr } = await supabase
    .from('user_notifications')
    .update({ read_at: now })
    .in('id', ids)
    .eq('user_id', user.id);

  if (updErr) {
    console.error('[notifications.markRead.update]', updErr);
    return NextResponse.json({ error: 'Failed to mark notifications as read' }, { status: 500 });
  }

  // For each dispute_reply notification we just cleared, decrement the
  // dispute's unread_reply_count. We bucket by dispute_id to avoid N+1 UPDATEs.
  const disputeCounts = new Map<string, number>();
  for (const n of toMark ?? []) {
    if (n.type === 'dispute_reply' && n.dispute_id) {
      disputeCounts.set(n.dispute_id, (disputeCounts.get(n.dispute_id) ?? 0) + 1);
    }
  }
  for (const [disputeId, delta] of disputeCounts) {
    const { data: d } = await supabase
      .from('disputes')
      .select('unread_reply_count')
      .eq('id', disputeId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!d) continue;
    const next = Math.max(0, (d.unread_reply_count ?? 0) - delta);
    await supabase
      .from('disputes')
      .update({ unread_reply_count: next })
      .eq('id', disputeId)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ success: true, marked: ids.length });
}
