/**
 * GET /api/connections/health
 *
 * Returns any of the current user's email connections that need the
 * user's attention. Used by <ConnectionHealthBanner /> on the
 * dashboard layout so silent OAuth expiry or IMAP auth failures
 * surface as a "your sync is paused" callout rather than the
 * Watchdog cron quietly stopping.
 *
 * Archived rows are excluded — the user explicitly removed them.
 *
 * Banner shows a connection when either:
 *   - status is not 'active' (e.g. 'needs_reauth', 'expired',
 *     'disconnected', set by fetchers.ts / Watchdog on auth failure)
 *   - OR last_error was recorded in the last 24h and status is still
 *     marked active (covers transient failures that haven't tripped
 *     the status flip yet)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECENT_ERROR_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: emailConns } = await supabase
    .from('email_connections')
    .select('id, email_address, provider_type, status, last_error, last_error_at')
    .eq('user_id', user.id)
    .is('archived_at', null);

  const now = Date.now();
  const unhealthyEmail = (emailConns ?? []).filter((c) => {
    if (c.status !== 'active') return true;
    if (!c.last_error || !c.last_error_at) return false;
    return now - new Date(c.last_error_at).getTime() < RECENT_ERROR_WINDOW_MS;
  }).map((c) => ({
    id: c.id,
    email_address: c.email_address,
    provider_type: c.provider_type,
    status: c.status,
    // Strip stack traces / long tokens from the error string — the banner
    // shows a compact summary, not raw output.
    last_error: (c.last_error ?? '').slice(0, 120),
  }));

  return NextResponse.json({
    unhealthy_email: unhealthyEmail,
  });
}
