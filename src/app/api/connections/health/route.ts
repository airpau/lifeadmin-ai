/**
 * GET /api/connections/health
 *
 * Returns any of the current user's email AND bank connections that
 * need attention. Used by <ConnectionHealthBanner /> on the dashboard
 * layout so silent OAuth expiry or IMAP / TrueLayer / Yapily consent
 * expiry surfaces as a "your sync is paused" callout, instead of the
 * background cron quietly stopping with no UI trace.
 *
 * Archived + soft-deleted rows are excluded — the user explicitly
 * removed them.
 *
 * Email unhealthy when:
 *   - status is not 'active' (needs_reauth / expired / disconnected,
 *     set by fetchers.ts / Watchdog on auth failure)
 *   - OR last_error was recorded in the last 24h and status is still
 *     marked active (covers transient failures that haven't tripped
 *     the status flip yet)
 *
 * Bank unhealthy when:
 *   - status ∈ (expired, expired_legacy, token_expired) — the consent
 *     window has closed and the cron can't renew without the user
 *   - 'expiring_soon' stays out of here because the existing
 *     ConsentRenewalBanner handles that advance-warning case
 *   - 'revoked' stays out — user explicitly disconnected
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

  const [emailRes, bankRes] = await Promise.all([
    supabase
      .from('email_connections')
      .select('id, email_address, provider_type, status, last_error, last_error_at')
      .eq('user_id', user.id)
      .is('archived_at', null),
    supabase
      .from('bank_connections')
      .select('id, bank_name, provider, status')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .in('status', ['expired', 'expired_legacy', 'token_expired']),
  ]);

  const now = Date.now();
  const unhealthyEmail = (emailRes.data ?? []).filter((c) => {
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

  const unhealthyBank = (bankRes.data ?? []).map((c) => ({
    id: c.id,
    bank_name: c.bank_name ?? 'Bank',
    provider: c.provider,
    status: c.status,
  }));

  return NextResponse.json({
    unhealthy_email: unhealthyEmail,
    unhealthy_bank: unhealthyBank,
  });
}
