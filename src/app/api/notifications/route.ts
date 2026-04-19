/**
 * GET /api/notifications
 *
 * List the current user's notifications (newest first). By default returns the
 * last 30 entries, unread first. Query params:
 *   - unread=1  -> only unread notifications
 *   - limit=N   -> override default page size (max 100)
 *
 * Used by the NotificationBell dropdown on the dashboard header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === '1';
  const limitRaw = Number(url.searchParams.get('limit') ?? '30');
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 30, 1), 100);

  let query = supabase
    .from('user_notifications')
    .select('id, type, title, body, link_url, dispute_id, metadata, read_at, created_at')
    .eq('user_id', user.id);

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  const { data, error } = await query
    .order('read_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[notifications.list]', error);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }

  return NextResponse.json({ notifications: data ?? [] });
}
