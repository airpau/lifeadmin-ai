/**
 * POST /api/disputes/[id]/sync-replies-now
 *
 * User-triggered Watchdog sync. Used by:
 *   • Free tier's "Sync now" button (their only way to get replies imported)
 *   • Paid tiers wanting to refresh on demand instead of waiting for the cron
 *
 * Plan ref: docs/DISPUTE_EMAIL_SYNC_PLAN.md §5
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncLinkedThread } from '@/lib/dispute-sync/sync-runner';

export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: disputeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Find the active link for this dispute owned by this user
  const { data: link, error } = await supabase
    .from('dispute_watchdog_links')
    .select('id, sync_enabled')
    .eq('dispute_id', disputeId)
    .eq('user_id', user.id)
    .eq('sync_enabled', true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 });
  if (!link) {
    return NextResponse.json(
      { error: 'no_link', message: 'This dispute has no linked email thread yet. Link one first.' },
      { status: 404 },
    );
  }

  const result = await syncLinkedThread(link.id, { sendNotifications: true });

  if (result.error) {
    return NextResponse.json(
      { success: false, imported: 0, error: result.error },
      { status: 502 },
    );
  }

  const debug = (globalThis as any).__lastWatchdogDebug ?? null;
  return NextResponse.json({
    success: true,
    imported: result.imported,
    disputeId: result.disputeId,
    debug,
  });
}
