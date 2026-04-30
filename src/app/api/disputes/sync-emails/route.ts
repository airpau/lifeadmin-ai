/**
 * POST /api/disputes/sync-emails
 *
 * On-demand email sync for all of the current user's active dispute watchdog
 * links. Called by the Telegram bot's `sync_dispute_emails` tool when the user
 * asks "have you checked my emails?" or similar.
 *
 * Unlike the cron which respects per-tier minimum intervals, this endpoint
 * performs an immediate sync regardless of when the last sync ran — it's
 * user-initiated, so latency is preferable to stale data.
 *
 * Auth: Supabase session cookie (same as all other dashboard API routes).
 *
 * Returns:
 *   { success, synced, totalNewMessages, repliesDetected, disputes: [...] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { syncLinkedThread } from '@/lib/dispute-sync/sync-runner';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getUserId(request: NextRequest): Promise<string | null> {
  // Try session cookie first (browser / dashboard context)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(_name: string, _value: string, _options: CookieOptions) {},
        remove(_name: string, _options: CookieOptions) {},
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (user?.id) return user.id;

  // Fallback: Bearer token containing userId (used by internal Telegram tool handler)
  const auth = request.headers.get('authorization') ?? '';
  const match = auth.match(/^Bearer user_(.+)$/);
  if (match) return match[1];

  return null;
}

export async function POST(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = admin();

  // Fetch all active watchdog links for this user
  const { data: links, error } = await db
    .from('dispute_watchdog_links')
    .select('id, dispute_id, last_synced_at, disputes(provider_name)')
    .eq('user_id', userId)
    .eq('sync_enabled', true)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: 'Failed to load linked threads' }, { status: 500 });
  }

  if (!links || links.length === 0) {
    return NextResponse.json({
      success: true,
      synced: 0,
      totalNewMessages: 0,
      repliesDetected: 0,
      message: 'No linked email threads found. Link a dispute to an email thread from the Disputes page to enable automatic monitoring.',
    });
  }

  let totalNewMessages = 0;
  let repliesDetected = 0;
  const disputeResults: Array<{
    disputeId: string;
    providerName: string;
    newMessages: number;
    lastSyncedAt: string | null;
    error?: string;
  }> = [];

  for (const link of links) {
    const providerName = (link.disputes as { provider_name?: string } | null)?.provider_name ?? 'Unknown';

    const result = await syncLinkedThread(link.id, { sendNotifications: true });

    disputeResults.push({
      disputeId: link.dispute_id,
      providerName,
      newMessages: result.imported,
      lastSyncedAt: new Date().toISOString(),
      error: result.error,
    });

    totalNewMessages += result.imported;
    if (result.imported > 0) repliesDetected++;
  }

  return NextResponse.json({
    success: true,
    synced: links.length,
    totalNewMessages,
    repliesDetected,
    checkedAt: new Date().toISOString(),
    disputes: disputeResults,
  });
}
