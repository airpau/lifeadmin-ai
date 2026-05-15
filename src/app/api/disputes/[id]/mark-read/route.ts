/**
 * POST /api/disputes/[id]/mark-read
 *
 * Zero out unread_reply_count on a dispute when the user opens the
 * detail page. The "NEW REPLY · N" badge on the disputes list is
 * driven by that column, so without this endpoint the badge keeps
 * showing replies the user has already read.
 *
 * Also clears the matching dispute_reply / dispute_reply_action rows
 * in user_notifications (read_at = now) so the bell badge stays in
 * sync — same pattern /api/notifications/mark-read uses but scoped
 * to a single dispute.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAlertInteraction } from '@/lib/alert-interactions';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: dispute, error: fetchErr } = await supabase
    .from('disputes')
    .select('id, unread_reply_count')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (fetchErr || !dispute) {
    return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
  }

  if ((dispute.unread_reply_count ?? 0) === 0) {
    return NextResponse.json({ ok: true, already_read: true });
  }

  await supabase
    .from('disputes')
    .update({ unread_reply_count: 0 })
    .eq('id', id)
    .eq('user_id', user.id);

  await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('dispute_id', id)
    .is('read_at', null)
    .in('type', ['dispute_reply', 'dispute_reply_action']);

  void logAlertInteraction({
    userId: user.id,
    alertType: 'dispute_reply',
    alertKey: id,
    action: 'viewed',
    surface: 'web',
    metadata: { unread_before: dispute.unread_reply_count ?? 0 },
  });

  return NextResponse.json({ ok: true });
}
