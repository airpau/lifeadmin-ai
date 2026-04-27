import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccounts } from '@/lib/yapily';
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
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // ── Handle bank-side errors ──
  if (errorParam) {
    console.error('Yapily callback error:', errorParam);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=bank_auth_failed', request.url),
    );
  }

  if (!consentToken || !state) {
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

  return NextResponse.redirect(
    new URL(`${returnTo}?connected=true${upsertResult.reused ? '&merged=1' : ''}`, request.url),
  );
}
