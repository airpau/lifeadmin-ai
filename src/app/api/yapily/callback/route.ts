import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccounts, getTransactions } from '@/lib/yapily';
import { detectRecurring } from '@/lib/detect-recurring';
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
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const consentToken = searchParams.get('consent');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  // ── Handle bank-side errors ──
  if (errorParam) {
    console.error('Yapily callback error:', errorParam);
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=bank_auth_failed', request.url)
    );
  }

  if (!consentToken || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=invalid_callback', request.url)
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
  let stateData: { userId: string; institutionId: string };
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
  } catch {
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=state_mismatch', request.url)
    );
  }

  if (stateData.userId !== user.id) {
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=state_mismatch', request.url)
    );
  }

  const institutionId = stateData.institutionId;

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
      new URL(
        '/dashboard/subscriptions?error=account_fetch_failed',
        request.url
      )
    );
  }

  // ── Consent expiry: 90 days from now (UK Open Banking standard) ──
  const consentGrantedAt = new Date().toISOString();
  const consentExpiresAt = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000
  ).toISOString();

  // Use institution ID as provider_id
  const providerId = `yapily_${institutionId}_${Date.now()}`;

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
      new URL('/dashboard/subscriptions?error=save_failed', request.url)
    );
  }

  // ── Award loyalty points ──
  import('@/lib/loyalty')
    .then(({ awardPoints }) => {
      awardPoints(user.id, 'bank_connected');
      awardPoints(user.id, 'first_scan');
    })
    .catch(() => {});

  // ── Initial transaction sync (12 months) ──
  try {
    await syncTransactionsForConnection(
      connection,
      user.id,
      supabase,
      consentToken
    );
  } catch (err) {
    console.error('Yapily initial sync failed (non-fatal):', err);
  }

  return NextResponse.redirect(
    new URL('/dashboard/subscriptions?connected=true', request.url)
  );
}

// ── Sync Helper ──

async function syncTransactionsForConnection(
  connection: { id: string; account_ids: string[] | null },
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  consentToken: string
) {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const fromDate = twelveMonthsAgo.toISOString();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toDate = tomorrow.toISOString();

  const accountIds = connection.account_ids || [];
  let totalSynced = 0;
  let apiCallsMade = 0;

  for (const accountId of accountIds) {
    try {
      const transactions = await getTransactions(
        accountId,
        consentToken,
        fromDate,
        toDate
      );
      apiCallsMade++;

      if (transactions.length === 0) continue;

      const rows = transactions.map((tx) => ({
        user_id: userId,
        connection_id: connection.id,
        transaction_id: tx.id,
        account_id: accountId,
        amount: tx.transactionAmount?.amount ?? tx.amount,
        currency: tx.transactionAmount?.currency ?? tx.currency ?? 'GBP',
        description:
          tx.description ||
          tx.transactionInformation?.join(' ') ||
          tx.reference ||
          null,
        merchant_name: tx.merchantName || null,
        category: null,
        timestamp: tx.bookingDateTime || tx.date,
      }));

      const { error } = await supabase
        .from('bank_transactions')
        .upsert(rows, {
          onConflict: 'user_id,transaction_id',
          ignoreDuplicates: true,
        });

      if (error) {
        console.error('Error upserting Yapily transactions:', error);
      } else {
        totalSynced += rows.length;
      }
    } catch (err) {
      console.error(`Error syncing Yapily account ${accountId}:`, err);
    }
  }

  // ── Detect recurring payments ──
  await detectRecurring(userId, supabase);

  // ── Update connection sync timestamp ──
  const now = new Date().toISOString();
  await supabase
    .from('bank_connections')
    .update({ last_synced_at: now, updated_at: now })
    .eq('id', connection.id);

  // ── Log sync for cost tracking ──
  await supabase
    .from('bank_sync_log')
    .insert({
      user_id: userId,
      connection_id: connection.id,
      trigger_type: 'initial',
      status: 'success',
      api_calls_made: apiCallsMade,
    })
    .then(({ error }) => {
      if (error) console.error('Failed to log Yapily initial sync:', error);
    });

  console.log(
    `Yapily initial sync: ${totalSynced} transactions synced across ${accountIds.length} accounts`
  );
  return totalSynced;
}
