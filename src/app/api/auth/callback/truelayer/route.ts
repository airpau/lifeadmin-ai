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
      new URL('/dashboard/subscriptions?error=bank_auth_failed', request.url) /* pre-state, can't know returnTo */
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
  // State can be JSON { userId, returnTo } or legacy plain userId
  let stateUserId: string;
  let returnTo = '/dashboard/subscriptions';
  try {
    const decoded = Buffer.from(state, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    stateUserId = parsed.userId;
    returnTo = parsed.returnTo || '/dashboard/subscriptions';
  } catch {
    // Legacy format: state is just the userId
    stateUserId = Buffer.from(state, 'base64').toString('utf8');
  }
  if (stateUserId !== user.id) {
    return NextResponse.redirect(
      new URL(`${returnTo}?error=state_mismatch`, request.url)
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
      new URL(`${returnTo}?error=token_exchange_failed`, request.url)
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

  // ── Gap detection ──────────────────────────────────────────────────────────
  // Before upserting, read the existing connection row (if any) so we can:
  //   1. Preserve the ORIGINAL connected_at (not reset it to now on every reconnect)
  //   2. Detect the gap period between last_synced_at and now
  //   3. Log the reconnect event with accurate gap metadata
  const { data: existingConnection } = await supabase
    .from('bank_connections')
    .select('id, connected_at, last_synced_at, status, reconnect_count')
    .eq('user_id', user.id)
    .eq('provider_id', providerId)
    .maybeSingle();

  const isReconnect = !!existingConnection;
  const now = new Date().toISOString();

  // Compute gap duration for logging
  let gapDays = 0;
  let gapFromDate: string | null = null;
  if (isReconnect && existingConnection.last_synced_at) {
    const lastSync = new Date(existingConnection.last_synced_at);
    gapDays = Math.round((Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24));
    gapFromDate = existingConnection.last_synced_at;
    if (gapDays > 1) {
      console.log(
        `TrueLayer reconnect: gap of ${gapDays} day(s) detected. ` +
        `last_synced_at=${gapFromDate}  connection_id=${existingConnection.id}`
      );
    }
  }

  // Build the upsert payload.
  // KEY RULE: connected_at is NEVER overwritten on reconnect — it preserves
  // the original connection date so the cron's fromDate calculation is stable.
  // reconnected_at and reconnect_count are updated on every reconnect.
  const upsertPayload: Record<string, unknown> = {
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
    // Preserve original connected_at; set it only for brand-new rows
    connected_at: existingConnection?.connected_at ?? now,
    reconnected_at: isReconnect ? now : null,
    reconnect_count: isReconnect ? (existingConnection.reconnect_count ?? 0) + 1 : 0,
  };

  // Store connection in DB (upsert on user_id + provider_id)
  const { data: connection, error: upsertError } = await supabase
    .from('bank_connections')
    .upsert(upsertPayload, { onConflict: 'user_id,provider_id' })
    .select()
    .single();

  if (upsertError || !connection) {
    console.error('Failed to save bank connection:', upsertError);
    return NextResponse.redirect(
      new URL(`${returnTo}?error=save_failed`, request.url)
    );
  }

  // Award loyalty points for bank connection
  import('@/lib/loyalty').then(({ awardPoints }) => {
    awardPoints(user.id, 'bank_connected');
    awardPoints(user.id, 'first_scan');
  }).catch(() => {});

  // Trigger initial transaction sync via internal API call
  try {
    await syncTransactionsForConnection(
      connection,
      user.id,
      supabase,
      tokens.access_token,
      { isReconnect, gapDays, gapFromDate }
    );

    // Also fetch and store initial balance
    await fetchAndStoreBalance(connection, accountIds, supabase, tokens.access_token);
  } catch (err) {
    console.error('Initial sync or balance fetch failed (non-fatal):', err);
  }

  return NextResponse.redirect(
    new URL(`${returnTo}?connected=true`, request.url)
  );
}

interface ReconnectMeta {
  isReconnect: boolean;
  gapDays: number;
  gapFromDate: string | null;
}

async function syncTransactionsForConnection(
  connection: { id: string; account_ids: string[] | null; connected_at: string },
  userId: string,
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  accessToken: string,
  reconnectMeta: ReconnectMeta
) {
  const { fetchTransactions } = await import('@/lib/truelayer');

  // ── From-date strategy ─────────────────────────────────────────────────────
  // TrueLayer enforces a strict 90-day window (from → to ≤ 90 days; `to` is
  // always tomorrow). We use an 89-day cap to stay within that limit.
  //
  // FIRST CONNECT  → always fetch the full 89 days (maximum available history)
  // RECONNECT      → backfill from last_synced_at so the gap is covered; fall
  //                  back to 89 days ago if last_synced_at is missing or older
  //                  than 89 days.
  //
  // NOTE: we intentionally do NOT use connected_at as the floor here. Although
  // connected_at is now preserved as the original date, using it would cause
  // brand-new connections (connected_at = today) to only fetch today's
  // transactions. The 89-day cap already limits how far back we can go.
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);
  ninetyDaysAgo.setHours(0, 0, 0, 0);

  let fromDate: Date;
  if (!reconnectMeta.isReconnect) {
    // First connect: fetch maximum available history
    fromDate = ninetyDaysAgo;
  } else {
    // Reconnect: backfill from the last known good sync date to cover the gap
    const priorLastSynced = reconnectMeta.gapFromDate
      ? new Date(reconnectMeta.gapFromDate)
      : null;
    if (priorLastSynced) priorLastSynced.setHours(0, 0, 0, 0);
    // Cap at 89 days (TrueLayer's hard limit)
    fromDate =
      priorLastSynced && priorLastSynced > ninetyDaysAgo
        ? priorLastSynced
        : ninetyDaysAgo;
  }

  console.log(
    `TrueLayer callback: ${reconnectMeta.isReconnect ? 're-connect' : 'first-connect'} ` +
    `syncing from ${fromDate.toISOString()}` +
    (reconnectMeta.gapDays > 1 ? ` (gap: ${reconnectMeta.gapDays} days)` : '')
  );

  const accountIds = connection.account_ids || [];
  let totalSynced = 0;
  let apiCallsMade = 0;
  const syncErrors: string[] = [];

  for (const accountId of accountIds) {
    try {
      const transactions = await fetchTransactions(accessToken, accountId, fromDate);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Error syncing account ${accountId}:`, msg);
      syncErrors.push(`${accountId}: ${msg}`);
    }
  }

  await detectRecurring(userId, supabase);

  const nowTs = new Date().toISOString();
  await supabase
    .from('bank_connections')
    .update({ last_synced_at: nowTs, updated_at: nowTs })
    .eq('id', connection.id);

  // Log as failed if no API calls succeeded (silent failure guard)
  const syncStatus = apiCallsMade > 0 ? 'success' : 'failed';
  const errorMessage = syncStatus === 'failed'
    ? `All account fetch attempts failed: ${syncErrors.join('; ') || 'unknown error'}`
    : null;

  // Persist gap metadata in the error_message field so it's auditable via SQL
  // even when the sync succeeded.
  const gapNote = reconnectMeta.gapDays > 1
    ? `Reconnect after ${reconnectMeta.gapDays}-day gap (last synced: ${reconnectMeta.gapFromDate}). `
    : null;

  await supabase.from('bank_sync_log').insert({
    user_id: userId,
    connection_id: connection.id,
    trigger_type: reconnectMeta.isReconnect ? 'reconnect' : 'initial',
    status: syncStatus,
    api_calls_made: apiCallsMade,
    // Combine gap note + any error detail; null if both are absent
    error_message: [gapNote, errorMessage].filter(Boolean).join('') || null,
  }).then(({ error }) => {
    if (error) console.error('Failed to log initial/reconnect sync:', error);
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
