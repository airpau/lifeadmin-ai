import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccounts, getInstitution, YapilyError } from '@/lib/yapily';
import { snapshotAccounts, upsertYapilyConnection } from '@/lib/yapily/connection-store';

/**
 * GET /api/yapily/callback?consent=xxx&consent-id=xxx&state=xxx
 *
 * Yapily redirects here after the user grants (or re-grants) consent
 * at their bank. The flow handles BOTH the legacy direct
 * /account-auth-requests redirect AND the new Hosted-Pages redirect
 * (Migle's expected build-review path — see T1, T2 in
 * docs/YAPILY_BUILD_REVIEW_PLAN.md).
 *
 *   1. Validate state (CSRF) and consent token.
 *   2. On error: log to business_log AND surface error_description
 *      to the user-facing redirect URL (T3).
 *   3. Fetch the linked accounts via Yapily /accounts.
 *   4. Snapshot account identifications for stable dedup.
 *   5. Hand off to upsertYapilyConnection — that helper looks for an
 *      existing pending/live connection (matching by hostedConsentId
 *      first, then by user+institution+account-hashes) and either
 *      promotes it in place or inserts a new row.
 *   6. Cache institution.features on the connection (T10).
 *   7. Trigger an initial 12-month sync in the background.
 *   8. Redirect back to the dashboard.
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const consentToken = searchParams.get('consent');
  // Yapily returns consent-id as both ?consent-id and (sometimes) as
  // a separate field — we accept either query-param form. The id is
  // distinct from the consent token: token is the credential we use
  // for API calls, id identifies the consent for re-authorise.
  const yapilyConsentId =
    searchParams.get('consent-id') ||
    searchParams.get('consentId') ||
    searchParams.get('id') ||
    '';
  // Hosted-pages flow returns the originating hosted-consent id; we use
  // it to match back to the pending bank_connections row created when
  // the user clicked Connect.
  const hostedConsentId =
    searchParams.get('hosted-consent-id') ||
    searchParams.get('hostedConsentId') ||
    null;
  const applicationUserId =
    searchParams.get('application-user-id') ||
    searchParams.get('applicationUserId') ||
    null;
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // ── Resolve user (needed for both error logging and happy path) ──
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  // We allow the error-log path to run even when the session is missing
  // — we'll still record the failure, and only redirect to /auth/login
  // afterwards.

  // ── Handle bank-side / hosted-page errors (T3) ──
  if (errorParam) {
    console.error('Yapily callback error:', errorParam, errorDescription);

    // Audit-trail row in business_log so we can grep for failures later.
    // Best-effort — never let logging break the redirect.
    try {
      await supabase.from('business_log').insert({
        source: 'yapily_callback',
        severity: 'warn',
        summary: `Yapily redirect error: ${errorParam}`,
        metadata: {
          error: errorParam,
          error_description: errorDescription,
          hosted_consent_id: hostedConsentId,
          application_user_id: applicationUserId,
          state,
          user_id: user?.id ?? null,
        },
      });
    } catch (logErr) {
      console.error('[yapily.callback] business_log insert failed:', logErr);
    }

    // Mark the pending row as failed so the poll cron stops chasing it.
    if (hostedConsentId) {
      try {
        await supabase
          .from('bank_connections')
          .update({ consent_status: 'FAILED', status: 'revoked' })
          .eq('hosted_consent_id', hostedConsentId);
      } catch {
        /* non-fatal */
      }
    }

    const redirectUrl = new URL('/dashboard/money-hub', request.url);
    redirectUrl.searchParams.set('error', 'bank_auth_failed');
    if (errorDescription) {
      redirectUrl.searchParams.set('error_description', errorDescription);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (!consentToken || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=invalid_callback', request.url),
    );
  }

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

  // ── Fetch the accounts the user just authorised ──
  let accounts: Awaited<ReturnType<typeof getAccounts>>;
  try {
    accounts = await getAccounts(consentToken);
  } catch (err) {
    console.error('Failed to fetch Yapily accounts:', err);
    // Surface a distinct error code on 403 so the front-end can render
    // ConsentRenewalBanner instead of a generic failure (T6).
    const code = err instanceof YapilyError && err.status === 403
      ? 'consent_invalid'
      : 'account_fetch_failed';
    return NextResponse.redirect(
      new URL(`/dashboard/money-hub?error=${code}`, request.url),
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

  // ── Snapshot institution.features so the capability gate (T10) can
  //    cheaply check support before invoking single-use endpoints. ──
  let institutionFeatures: string[] | null = null;
  try {
    const inst = await getInstitution(institutionId);
    institutionFeatures = inst?.features ?? null;
  } catch (err) {
    console.warn('[yapily.callback] failed to fetch institution features (continuing):', err);
  }

  // ── Persist via the dedup-aware store ──
  let upsertResult;
  try {
    upsertResult = await upsertYapilyConnection({
      userId: user.id,
      institutionId,
      bankName,
      consentToken,
      yapilyConsentId,
      consentExpiresAt,
      accounts: accountSnapshots,
      hostedConsentId: hostedConsentId || undefined,
      institutionFeatures: institutionFeatures || undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[yapily.callback] upsert failed:', msg);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=save_failed', request.url),
    );
  }

  // ── Mark hosted-flow row authorised so the poll cron stops ──
  if (hostedConsentId) {
    try {
      await supabase
        .from('bank_connections')
        .update({ consent_status: 'AUTHORIZED' })
        .eq('id', upsertResult.connectionId);
    } catch {
      /* non-fatal */
    }
  }

  console.log(
    `[yapily.callback] ${upsertResult.reused ? 'reused' : 'inserted'} connection ${upsertResult.connectionId}` +
    (upsertResult.previousConnectionIds.length ? ` (demoted ${upsertResult.previousConnectionIds.length} stale rows)` : ''),
  );

  // ── Award loyalty points ──
  import('@/lib/loyalty')
    .then(({ awardPoints }) => {
      awardPoints(user.id, 'bank_connected');
      awardPoints(user.id, 'first_scan');
    })
    .catch(() => { /* non-fatal */ });

  // ── Trigger initial 12-month sync in the background ──
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

  return NextResponse.redirect(
    new URL(`${returnTo}?connected=true${upsertResult.reused ? '&merged=1' : ''}`, request.url),
  );
}
