/**
 * GET /api/notifications/unread-count
 *
 * Small, fast endpoint polled by the NotificationBell to show the unread dot.
 * Returns `{ count: number }`. Safe to poll every 60s.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { count, error } = await supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) {
    console.error('[notifications.unreadCount]', error);
    return NextResponse.json({ error: 'Failed to load unread count' }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
