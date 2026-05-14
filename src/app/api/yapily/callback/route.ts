import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getAccounts, getHostedConsentRequest } from '@/lib/yapily';
import { snapshotAccounts, upsertYapilyConnection } from '@/lib/yapily/connection-store';

/**
 * GET /api/yapily/callback?consent=xxx&consent-id=xxx&state=xxx
 *
 * Yapily redirects here after the user grants (or re-grants) consent
 * at their bank. The flow is intentionally idempotent:
 *
 *   1. Validate state (CSRF) and consent token.
 *   2. Fetch the linked accounts via Yapily /accounts.
 *   3. Compute account_identifications_hash for each account from the
 *      bank's sort code + account number (UK) or IBAN (EU). These
 *      hashes are stable across reconnects.
 *   4. Hand off to upsertYapilyConnection — that helper looks for an
 *      existing live connection for this (user, institution, hashes)
 *      and either updates it in place or inserts a new row. If the
 *      user just re-authorised the same bank, we never end up with two
 *      rows.
 *   5. Trigger an initial 12-month sync in the background.
 *   6. Redirect back to the dashboard.
 *
 * The callback's job is purely orchestration; the dedup invariants live
 * in connection-store.ts so the bank-sync cron can reuse them.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Hosted Pages returns ONLY consentRequestId on the redirect — the
  // consentToken comes from GET /hosted/consent-requests/{id} below.
  // Legacy /account-auth-requests returns ?consent=<token>&consent-id=<id>.
  // We detect which mode we're in by which params are present.
  const consentRequestId =
    searchParams.get('consentRequestId') ||
    searchParams.get('consent-request-id') ||
    '';
  let consentToken = searchParams.get('consent') || '';
  let yapilyConsentId =
    searchParams.get('consent-id') ||
    searchParams.get('consentId') ||
    (consentRequestId ? '' : searchParams.get('id') || '') ||
    '';
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // ── Handle bank-side errors ──
  if (errorParam) {
    console.error('Yapily callback error:', errorParam);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=bank_auth_failed', request.url),
    );
  }

  // We need either a consentToken (legacy) or a consentRequestId (hosted)
  // and always need state for CSRF.
  if ((!consentToken && !consentRequestId) || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=invalid_callback', request.url),
    );
  }

  // ── Verify user auth ──
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // ── Verify state (CSRF check) ──
  let stateData: { userId: string; institutionId: string; returnTo?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=state_mismatch', request.url),
    );
  }
  if (stateData.userId !== user.id) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=state_mismatch', request.url),
    );
  }

  const institutionId = stateData.institutionId;
  const returnTo = stateData.returnTo || '/dashboard/money-hub';

  // ── Hosted Pages: resolve consentToken + consentId from consentRequestId ──
  // On the legacy flow Yapily puts both in the redirect query. On Hosted
  // Pages we get only consentRequestId — fetch the rest before continuing.
  // Tutorial step 4: check status before proceeding.
  //
  // Schema (verified against Yapily OpenAPI 12.3.4 on 29 Apr 2026):
  //   data.consentRequestId  — the request handle (already in our query)
  //   data.consentId         — the underlying consent identifier; the
  //                             same shape /account-auth-requests/{id}
  //                             accepts. THIS is what we persist into
  //                             bank_connections.yapily_consent_id so
  //                             renew + delete keep working.
  //   data.consentToken      — the credential we attach to data calls.
  //   data.status            — AUTHORIZED once the user has completed
  //                             the bank-side flow.
  if (consentRequestId && !consentToken) {
    try {
      const hosted = await getHostedConsentRequest(consentRequestId);
      const hostedStatus = (hosted.status || '').toUpperCase();
      if (hostedStatus !== 'AUTHORIZED' && hostedStatus !== 'AUTHORISED') {
        console.warn(
          `[yapily.callback] hosted consent ${consentRequestId} status=${hostedStatus} — redirecting user back to retry`,
        );
        return NextResponse.redirect(
          new URL(`/dashboard/money-hub?error=hosted_consent_${hostedStatus.toLowerCase() || 'unknown'}`, request.url),
        );
      }
      if (!hosted.consentToken) {
        console.error(`[yapily.callback] hosted consent ${consentRequestId} authorised but no consentToken returned`);
        return NextResponse.redirect(
          new URL('/dashboard/money-hub?error=hosted_consent_token_missing', request.url),
        );
      }
      if (!hosted.consentId) {
        // AUTHORIZED responses MUST carry consentId per OpenAPI 12.3.4.
        // If Yapily ever returns AUTHORIZED without one, we bail rather
        // than persist the consentRequestId in the wrong slot — the
        // renew + disconnect flows would silently break otherwise.
        console.error(`[yapily.callback] hosted consent ${consentRequestId} authorised but no consentId returned`);
        return NextResponse.redirect(
          new URL('/dashboard/money-hub?error=hosted_consent_id_missing', request.url),
        );
      }
      consentToken = hosted.consentToken;
      yapilyConsentId = hosted.consentId;
    } catch (err) {
      console.error(`[yapily.callback] hosted consent fetch failed for ${consentRequestId}:`, err);
      return NextResponse.redirect(
        new URL('/dashboard/money-hub?error=hosted_consent_fetch_failed', request.url),
      );
    }
  }

  if (!consentToken) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=invalid_callback', request.url),
    );
  }

  // ── Fetch the accounts the user just authorised ──
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  try {
    accounts = await getAccounts(consentToken);
  } catch (err) {
    console.error('Failed to fetch Yapily accounts:', err);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=account_fetch_failed', request.url),
    );
  }

  if (accounts.length === 0) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=no_accounts', request.url),
    );
  }

  const accountSnapshots = snapshotAccounts(accounts);
  const bankName = accounts[0]?.institution?.name || institutionId;

  // ── 90-day UK consent expiry ──
  const consentExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  // ── Persist via the dedup-aware store ──
  let upsertResult;
  try {
    upsertResult = await upsertYapilyConnection({
      userId: user.id,
      institutionId,
      bankName,
      consentToken,
      yapilyConsentId,
      yapilyConsentRequestId: consentRequestId || null,
      consentExpiresAt,
      accounts: accountSnapshots,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[yapily.callback] upsert failed:', msg);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=save_failed', request.url),
    );
  }

  console.log(
    `[yapily.callback] ${upsertResult.reused ? 'reused' : 'inserted'} connection ${upsertResult.connectionId}` +
    (upsertResult.previousConnectionIds.length ? ` (demoted ${upsertResult.previousConnectionIds.length} stale rows)` : ''),
  );

  // ── Mark the pending Hosted Pages request resolved (if any) ──
  // The abandonment poller treats anything still 'pending' after 15 min
  // as abandoned. Closing the loop here keeps its working set small.
  if (consentRequestId) {
    try {
      const adminBg = createAdmin(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      await adminBg
        .from('yapily_pending_consent_requests')
        .update({ status: 'completed', resolved_at: new Date().toISOString() })
        .eq('consent_request_id', consentRequestId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`[yapily.callback] pending row update failed (non-fatal): ${msg}`);
    }
  }

  // ── Award loyalty points ──
  import('@/lib/loyalty')
    .then(({ awardPoints }) => {
      awardPoints(user.id, 'bank_connected');
      awardPoints(user.id, 'first_scan');
    })
    .catch(() => { /* non-fatal */ });

  // ── Trigger initial 12-month sync in the background ──
  // The body carries the account snapshots so the sync doesn't have
  // to re-fetch /accounts (saves a round-trip + uses identical hashes
  // to whatever we just stored).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';
  fetch(`${appUrl}/api/yapily/initial-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      connectionId: upsertResult.connectionId,
      userId: user.id,
      consentToken,
      accountSnapshots,
    }),
  }).catch((err) => console.error('[yapily.callback] initial-sync trigger failed:', err));

  // ── Also kick the upcoming-payments sync once. The cron at 06:00 UTC
  // pulls scheduled payments + standing orders + direct debits, but on a
  // fresh connect the user expects "Upcoming pending payments" to
  // populate immediately rather than waiting for tomorrow. The endpoint
  // is single-use per consent for each deterministic source, so calling
  // it here is safe — the cron will short-circuit when it next runs.
  fetch(`${appUrl}/api/cron/sync-upcoming`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  }).catch((err) => console.error('[yapily.callback] sync-upcoming trigger failed:', err));

  return NextResponse.redirect(
    new URL(`${returnTo}?connected=true${upsertResult.reused ? '&merged=1' : ''}`, request.url),
  );
}
