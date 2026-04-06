import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchAccounts, fetchBalances } from '@/lib/truelayer';
import { detectRecurring } from '@/lib/detect-recurring';
import { encrypt } from '@/lib/encrypt';

// Local dev redirect: http://localhost:3000/api/auth/callback/truelayer
// Production redirect: https://paybacker.co.uk/api/auth/callback/truelayer
const TRUELAYER_AUTH_URL = process.env.TRUELAYER_AUTH_URL || 'https://auth.truelayer.com';
const TRUELAYER_API_URL = process.env.TRUELAYER_API_URL || 'https://api.truelayer.com';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=bank_auth_failed', request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=invalid_callback', request.url)
    );
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Verify state matches user ID (CSRF check)
  const stateUserId = Buffer.from(state, 'base64').toString('utf8');
  if (stateUserId !== user.id) {
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=state_mismatch', request.url)
    );
  }

  // Exchange code for tokens
  const tokenRes = await fetch(`${TRUELAYER_AUTH_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.TRUELAYER_CLIENT_ID!,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET!,
      redirect_uri: process.env.TRUELAYER_REDIRECT_URI!,
      code,
    }),
  });

  if (!tokenRes.ok) {
    console.error('TrueLayer token exchange failed:', await tokenRes.text());
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=token_exchange_failed', request.url)
    );
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Fetch accounts list and bank names
  let accountIds: string[] = [];
  let accountDisplayNames: string[] = [];
  let bankName: string | null = null;
  try {
    const accounts = await fetchAccounts(tokens.access_token);
    accountIds = accounts.map((a) => a.account_id);
    accountDisplayNames = accounts.map((a) => {
      const parts = [a.display_name, a.description].filter(Boolean);
      return parts.join(' — ') || 'Account';
    });
    // Bank name: prefer provider.display_name, then account display_name
    bankName = accounts[0]?.provider?.display_name || accounts[0]?.display_name || null;
    console.log(`TrueLayer callback: ${accounts.length} accounts found, bank="${bankName}"`);
  } catch (err) {
    console.error('Failed to fetch accounts:', err);
  }

  // Use first account ID as provider_id to identify the bank
  const providerId = accountIds[0] || `truelayer_${Date.now()}`;

  // Store connection in DB (upsert on user_id + provider_id)
  const { data: connection, error: upsertError } = await supabase
    .from('bank_connections')
    .upsert({
      user_id: user.id,
      provider: 'truelayer',
      provider_id: providerId,
      access_token: encrypt(tokens.access_token),
      refresh_token: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      token_expires_at: expiresAt,
      account_ids: accountIds,
      account_display_names: accountDisplayNames,
      bank_name: bankName,
      status: 'active',
      connected_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider_id' })
    .select()
    .single();

  if (upsertError || !connection) {
    console.error('Failed to save bank connection:', upsertError);
    return NextResponse.redirect(
      new URL('/dashboard/subscriptions?error=save_failed', request.url)
    );
  }

  // Award loyalty points for bank connection
  import('@/lib/loyalty').then(({ awardPoints }) => {
    awardPoints(user.id, 'bank_connected');
    awardPoints(user.id, 'first_scan');
  }).catch(() => {});

  // Trigger initial transaction sync via internal API call
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    // We call the sync endpoint server-to-server; pass user cookies via auth
    // For simplicity in MVP, we inline the sync logic here
    await syncTransactionsForConnection(connection, user.id, supabase, tokens.access_token);

    // Also fetch and store initial balance
    await fetchAndStoreBalance(connection, accountIds, supabase, tokens.access_token);
  } catch (err) {
    console.error('Initial sync or balance fetch failed (non-fatal):', err);
  }

  return NextResponse.redirect(
    new URL('/dashboard/subscriptions?connected=true', request.url)
  );
}

async function syncTransactionsForConnection(
  connection: { id: string; account_ids: string[] | null },
  userId: string,
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  accessToken: string
) {
  const { fetchTransactions } = await import('@/lib/truelayer');

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const accountIds = connection.account_ids || [];
  let totalSynced = 0;
  let apiCallsMade = 0;

  for (const accountId of accountIds) {
    try {
      const transactions = await fetchTransactions(accessToken, accountId, twelveMonthsAgo);
      apiCallsMade++;

      if (transactions.length === 0) continue;

      const rows = transactions.map((tx) => ({
        user_id: userId,
        connection_id: connection.id,
        transaction_id: tx.transaction_id,
        account_id: accountId,
        amount: tx.amount,
        currency: tx.currency || 'GBP',
        description: tx.description || null,
        merchant_name: tx.merchant_name || null,
        category: tx.transaction_category || null,
        timestamp: tx.timestamp,
      }));

      const { error } = await supabase
        .from('bank_transactions')
        .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

      if (error) console.error('Error upserting transactions:', error);
      else totalSynced += rows.length;
    } catch (err) {
      console.error(`Error syncing account ${accountId}:`, err);
    }
  }

  await detectRecurring(userId, supabase);

  const now = new Date().toISOString();
  await supabase
    .from('bank_connections')
    .update({ last_synced_at: now, updated_at: now })
    .eq('id', connection.id);

  // Log initial sync to bank_sync_log for cost tracking
  await supabase.from('bank_sync_log').insert({
    user_id: userId,
    connection_id: connection.id,
    trigger_type: 'initial',
    status: 'success',
    api_calls_made: apiCallsMade,
  }).then(({ error }) => {
    if (error) console.error('Failed to log initial sync:', error);
  });

  return totalSynced;
}

async function fetchAndStoreBalance(
  connection: { id: string; account_ids: string[] | null },
  accountIds: string[],
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  accessToken: string
) {
  // Fetch balance for the first account (representative balance)
  if (accountIds.length === 0) return;

  const firstAccountId = accountIds[0];
  try {
    const balance = await fetchBalances(accessToken, firstAccountId);
    if (balance) {
      const now = new Date().toISOString();
      await supabase
        .from('bank_connections')
        .update({
          current_balance: balance.current,
          available_balance: balance.available,
          balance_updated_at: now,
        })
        .eq('id', connection.id);
    }
  } catch (err) {
    console.log('Balance fetch failed on callback (non-fatal):', err);
  }
}
