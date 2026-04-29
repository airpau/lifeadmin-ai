import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccounts } from '@/lib/yapily';
import { encrypt } from '@/lib/encrypt';

/**
 * GET /api/yapily/callback?consent=xxx&state=xxx
 *
 * Yapily redirects here after the user grants consent at their bank.
 * 1. Validates state (CSRF) and consent token
 * 2. Fetches linked accounts
 * 3. Stores bank connection with encrypted consent token
 * 4. Triggers initial 12-month transaction sync
 * 5. Runs recurring payment detection
 * 6. Redirects to dashboard
 */
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const consentToken = searchParams.get('consent');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // ── Handle bank-side errors ──
  if (errorParam) {
    console.error('Yapily callback error:', errorParam);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=bank_auth_failed', request.url)
    );
  }

  if (!consentToken || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=invalid_callback', request.url)
    );
  }

  // ── Verify user auth ──
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // ── Verify state (CSRF check) ──
  let stateData: { userId: string; institutionId: string; returnTo?: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=state_mismatch', request.url)
    );
  }

  if (stateData.userId !== user.id) {
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=state_mismatch', request.url)
    );
  }

  const institutionId = stateData.institutionId;
  const returnTo = stateData.returnTo || '/dashboard/money-hub';

  // ── Fetch linked accounts ──
  let accountIds: string[] = [];
  let accountDisplayNames: string[] = [];
  let bankName: string | null = null;

  try {
    const accounts = await getAccounts(consentToken);
    accountIds = accounts.map((a) => a.id);
    accountDisplayNames = accounts.map((a) => {
      const name =
        a.accountNames?.[0]?.name || a.nickname || 'Account';
      return name;
    });
    bankName =
      accounts[0]?.institution?.name || institutionId;

    console.log(
      `Yapily callback: ${accounts.length} accounts found, bank="${bankName}"`
    );
  } catch (err) {
    console.error('Failed to fetch Yapily accounts:', err);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=account_fetch_failed', request.url)
    );
  }

  // ── Consent expiry: 90 days from now (UK Open Banking standard) ──
  const consentGrantedAt = new Date().toISOString();
  const consentExpiresAt = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Use institution ID as provider_id
  const providerId = `yapily_${institutionId}_${Date.now()}`;

  // ── Prevent Duplicate Active Connections ──
  // Revoke any existing active connections for this exact bank to prevent double-counting
  await supabase
    .from('bank_connections')
    .update({ status: 'revoked_duplicate', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('institution_id', institutionId)
    .in('status', ['active']);

  // ── Store connection in DB ──
  const { data: connection, error: upsertError } = await supabase
    .from('bank_connections')
    .upsert(
      {
        user_id: user.id,
        provider: 'yapily',
        provider_id: providerId,
        institution_id: institutionId,
        consent_token: encrypt(consentToken),
        consent_granted_at: consentGrantedAt,
        consent_expires_at: consentExpiresAt,
        account_ids: accountIds,
        account_display_names: accountDisplayNames,
        bank_name: bankName,
        status: 'active',
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider_id' }
    )
    .select()
    .single();

  if (upsertError || !connection) {
    console.error('Failed to save Yapily bank connection:', upsertError);
    return NextResponse.redirect(
      new URL('/dashboard/money-hub?error=save_failed', request.url)
    );
  }

  // ── Award loyalty points ──
  import('@/lib/loyalty')
    .then(({ awardPoints }) => {
      awardPoints(user.id, 'bank_connected');
      awardPoints(user.id, 'first_scan');
    })
    .catch(() => {});

  // ── Trigger full 12-month sync in the background ──
  // Don't await — redirect the user immediately, sync runs separately
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';
  fetch(`${appUrl}/api/yapily/initial-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({
      connectionId: connection.id,
      userId: user.id,
      consentToken,
      accountIds,
    }),
  }).catch(err => console.error('Failed to trigger initial sync:', err));

  return NextResponse.redirect(
    new URL(`${returnTo}?connected=true`, request.url)
  );
}
