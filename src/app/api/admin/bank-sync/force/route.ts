import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getAccessTokenWithClient,
  fetchTransactions,
  fetchBalances,
  fetchPendingTransactions,
} from '@/lib/truelayer';
import { detectRecurring } from '@/lib/detect-recurring';

/**
 * POST /api/admin/bank-sync/force
 *
 * Admin-only endpoint to force a bank sync for any connection regardless of
 * status or tier. Used to backfill gaps caused by token expiry or reconnect issues.
 *
 * Auth: Bearer CRON_SECRET
 *
 * Body:
 *   connectionId: string — the bank_connections.id to sync
 *   fromDate?: string    — ISO date string to start from (default: last 90 days)
 *                          Use this to target a specific gap, e.g. "2026-04-07"
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let connectionId: string;
  let fromDateParam: string | undefined;
  try {
    const body = await request.json();
    connectionId = body?.connectionId;
    fromDateParam = body?.fromDate;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch the connection regardless of status
  const { data: connection, error: connErr } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('id', connectionId)
    .single();

  if (connErr || !connection) {
    return NextResponse.json({ error: 'Connection not found', detail: connErr?.message }, { status: 404 });
  }

  if (connection.provider !== 'truelayer') {
    return NextResponse.json({ error: 'Only TrueLayer connections are supported by this endpoint' }, { status: 400 });
  }

  if (!connection.access_token) {
    return NextResponse.json({
      error: 'No access token stored — user must reconnect',
      connectionId,
      status: connection.status,
    }, { status: 422 });
  }

  // Determine from_date: explicit param > last known transaction > 90 days ago
  let fromDate: Date;
  if (fromDateParam) {
    fromDate = new Date(fromDateParam);
    if (isNaN(fromDate.getTime())) {
      return NextResponse.json({ error: `Invalid fromDate: ${fromDateParam}` }, { status: 400 });
    }
  } else {
    // Query last transaction for this connection's accounts
    const accountIds = connection.account_ids || [];
    const { data: lastTx } = await supabase
      .from('bank_transactions')
      .select('timestamp')
      .eq('connection_id', connectionId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (lastTx?.timestamp) {
      fromDate = new Date(lastTx.timestamp);
      fromDate.setHours(0, 0, 0, 0); // start of day to catch same-day transactions
      console.log(`Force sync: starting from last known transaction ${fromDate.toISOString()} for conn ${connectionId}`);
    } else {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 90);
      console.log(`Force sync: no prior transactions, fetching 90 days for conn ${connectionId}`);
    }

    void accountIds; // suppress unused warning
  }

  const now = new Date().toISOString();

  // Attempt token refresh (handles both expired and still-valid tokens)
  let accessToken: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    accessToken = await getAccessTokenWithClient(connection as any, supabase);
    console.log(`Force sync: token obtained for conn ${connectionId}`);
  } catch (refreshErr: unknown) {
    const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
    console.error(`Force sync: token refresh failed for ${connectionId}:`, msg);

    // Mark as expired so the UI prompts a reconnect
    await supabase
      .from('bank_connections')
      .update({ status: 'expired', updated_at: now })
      .eq('id', connectionId);

    await supabase.from('bank_sync_log').insert({
      user_id: connection.user_id,
      connection_id: connectionId,
      trigger_type: 'manual',
      status: 'failed',
      api_calls_made: 0,
      error_message: `Token refresh failed: ${msg}`,
    });

    return NextResponse.json({
      ok: false,
      error: 'Token refresh failed — user must reconnect their bank account',
      detail: msg,
      connectionId,
    }, { status: 422 });
  }

  const accountIds: string[] = connection.account_ids || [];
  let totalSynced = 0;
  let apiCallsMade = 0;
  const accountErrors: Record<string, string> = {};
  let anyAccountSucceeded = false;

  // Fetch and upsert transactions for each account
  for (const accountId of accountIds) {
    try {
      const transactions = await fetchTransactions(accessToken, accountId, fromDate);
      apiCallsMade++;
      anyAccountSucceeded = true;

      if (transactions.length > 0) {
        const rows = transactions.map((tx) => ({
          user_id: connection.user_id,
          connection_id: connectionId,
          transaction_id: tx.transaction_id,
          account_id: accountId,
          amount: tx.amount,
          currency: tx.currency || 'GBP',
          description: tx.description || null,
          merchant_name: tx.merchant_name || null,
          category: null,
          timestamp: tx.timestamp,
          is_pending: false,
        }));

        const { error: upsertErr } = await supabase
          .from('bank_transactions')
          .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

        if (upsertErr) {
          console.error(`Force sync: upsert error for ${accountId}:`, upsertErr);
        } else {
          totalSynced += rows.length;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Force sync: fetchTransactions error for ${accountId}:`, msg);
      accountErrors[accountId] = msg;
    }
  }

  // Fetch balances (non-fatal)
  for (const accountId of accountIds) {
    try {
      const balance = await fetchBalances(accessToken, accountId);
      apiCallsMade++;
      if (balance) {
        await supabase
          .from('bank_connections')
          .update({
            current_balance: balance.current,
            available_balance: balance.available,
            balance_updated_at: now,
          })
          .eq('id', connectionId);
      }
    } catch {
      // Non-fatal
    }
  }

  // Fetch pending transactions (non-fatal)
  for (const accountId of accountIds) {
    try {
      const pending = await fetchPendingTransactions(accessToken, accountId);
      apiCallsMade++;
      if (pending.length > 0) {
        const rows = pending.map((tx) => ({
          user_id: connection.user_id,
          connection_id: connectionId,
          transaction_id: tx.transaction_id,
          account_id: accountId,
          amount: tx.amount,
          currency: tx.currency || 'GBP',
          description: tx.description || null,
          merchant_name: tx.merchant_name || null,
          category: null,
          timestamp: tx.timestamp,
          is_pending: true,
        }));
        await supabase
          .from('bank_transactions')
          .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });
      }
    } catch {
      // Non-fatal
    }
  }

  if (anyAccountSucceeded) {
    // Run post-sync enrichment
    try {
      await supabase.rpc('auto_categorise_transactions', { p_user_id: connection.user_id });
    } catch { /* Non-fatal */ }
    try {
      await supabase.rpc('detect_and_sync_recurring_transactions', { p_user_id: connection.user_id });
    } catch { /* Non-fatal */ }
    await detectRecurring(connection.user_id, supabase);

    // Reset status to active and update last_synced_at
    await supabase
      .from('bank_connections')
      .update({ status: 'active', last_synced_at: now, updated_at: now })
      .eq('id', connectionId);
  }

  const syncStatus = anyAccountSucceeded ? 'success' : 'failed';
  const errorSummary = Object.entries(accountErrors)
    .map(([id, msg]) => `${id}: ${msg}`)
    .join('; ');

  await supabase.from('bank_sync_log').insert({
    user_id: connection.user_id,
    connection_id: connectionId,
    trigger_type: 'manual',
    status: syncStatus,
    api_calls_made: apiCallsMade,
    error_message: syncStatus === 'failed' ? errorSummary || 'All account fetches failed' : null,
  });

  return NextResponse.json({
    ok: anyAccountSucceeded,
    connectionId,
    fromDate: fromDate.toISOString(),
    transactionsSynced: totalSynced,
    apiCallsMade,
    accountErrors: Object.keys(accountErrors).length > 0 ? accountErrors : undefined,
    statusReset: anyAccountSucceeded ? 'active' : 'unchanged',
    message: anyAccountSucceeded
      ? `Synced ${totalSynced} transactions from ${fromDate.toISOString().split('T')[0]}`
      : 'All account fetches failed — TrueLayer may be rejecting this connection. User may need to reconnect.',
  });
}
