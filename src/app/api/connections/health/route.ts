/**
 * GET /api/connections/health
 *
 * Returns any of the current user's email AND bank connections that
 * need attention. Used by <ConnectionHealthBanner /> on the dashboard
 * layout so silent OAuth expiry or IMAP / Yapily consent
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
 *   - 'revoked' stays out — user explicitly disconnected
 *
 * Bank EXPIRING (returned separately as `expiring_bank`):
 *   - status = 'expiring_soon' — set by the consent-renewal cron at 7
 *     days before the UK 90-day consent limit.
 *
 * Why expiring_soon is here now (Yapily build review, step 9):
 * this endpoint used to exclude it, on the stated grounds that
 * "the existing ConsentRenewalBanner handles that advance-warning
 * case". It didn't — that component was never mounted on any page, so
 * nothing rendered it and POST /api/bank/renew-consent was unreachable
 * from the product. The practical effect was that users were only told
 * about consent expiry AFTER sync had already stopped. Returning
 * expiring_soon (with consent_expires_at so the banner can show days
 * remaining) is what makes the advance warning real.
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
      .select('id, bank_name, provider, status, consent_expires_at, consent_reconfirm_by, yapily_consent_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .in('status', ['expired', 'expired_legacy', 'token_expired', 'expiring_soon']),
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

  const allBank = bankRes.data ?? [];

  // ── Renewable vs genuinely broken ────────────────────────────────
  //
  // A lapsed consent is NOT automatically a dead one. Yapily's UK
  // reconfirmation guidance is explicit: "If you later receive
  // reconfirmation from the user, access to the user's data can be
  // resumed from this date after you have confirmed to Yapily via the
  // extend consent endpoint." So an `expired` connection that still has
  // a yapily_consent_id can be restored with one tap and no bank login.
  //
  // Before 2026-08-21 every `expired` row was routed to the
  // reconnect-from-scratch banner instead, which meant:
  //   • we sent people through a full re-consent they didn't need;
  //   • the reminder email told them to "tap Renew on Money Hub" while
  //     the page actually rendered "Reconnect {bank}" pointing at
  //     /dashboard/subscriptions — a different label on a different
  //     page, so the instructions were simply wrong.
  //
  // `token_expired` and `expired_legacy` stay in the reconnect bucket:
  // the first is a credential problem, and the second predates
  // yapily_consent_id so there is no consent to extend.
  const isRenewable = (c: { status: string; yapily_consent_id?: string | null }) =>
    (c.status === 'expiring_soon' || c.status === 'expired') && !!c.yapily_consent_id;

  // Already broken — sync has stopped and only a full reconnect fixes it.
  const unhealthyBank = allBank
    .filter((c) => !isRenewable(c))
    .map((c) => ({
      id: c.id,
      bank_name: c.bank_name ?? 'Bank',
      provider: c.provider,
      status: c.status,
    }));

  // Renewable via POST /consents/{id}/extend rather than a full
  // re-consent — cheaper for the user and for Yapily.
  const expiringBank = allBank.filter(isRenewable).map((c) => {
    // reconfirm_by is Yapily's own deadline and wins where present;
    // consent_expires_at is our locally computed fallback.
    const deadline = c.consent_reconfirm_by || c.consent_expires_at;
    return {
      id: c.id,
      bank_name: c.bank_name ?? 'Bank',
      provider: c.provider,
      status: c.status,
      consent_expires_at: deadline,
      // Floored at 0 for display. An already-lapsed connection shows
      // "has expired" rather than a negative day count.
      days_left: deadline
        ? Math.max(
            0,
            Math.ceil((new Date(deadline).getTime() - now) / (24 * 60 * 60 * 1000)),
          )
        : 0,
    };
  });

  return NextResponse.json({
    unhealthy_email: unhealthyEmail,
    unhealthy_bank: unhealthyBank,
    expiring_bank: expiringBank,
  });
}
