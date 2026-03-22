import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccessToken, fetchAccounts, fetchTransactions, BankConnection } from '@/lib/truelayer';
import { detectRecurring } from '@/lib/detect-recurring';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Nightly bank sync cron — refreshes transactions for all active bank connections.
 * Schedule: Daily at 3am (configured in vercel.json)
 *
 * For each connected bank:
 * 1. Refresh access token if needed
 * 2. Fetch last 90 days of transactions (catches new payments)
 * 3. Upsert to bank_transactions (dedup on transaction_id)
 * 4. Run recurring payment detection
 * 5. Update last_synced_at
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Get all active bank connections
  const { data: connections, error: connError } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('status', 'active');

  if (connError || !connections || connections.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, reason: 'No active connections' });
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const results: Array<{ user_id: string; connection_id: string; transactions: number; recurring: number; error?: string }> = [];

  for (const connection of connections as BankConnection[]) {
    try {
      // Get valid access token (auto-refreshes if expired)
      let accessToken: string;
      try {
        accessToken = await getAccessToken(connection);
      } catch (err: any) {
        console.error(`Bank sync: token refresh failed for connection ${connection.id}:`, err.message);
        // Mark as expired
        await supabase
          .from('bank_connections')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', connection.id);
        results.push({ user_id: connection.user_id, connection_id: connection.id, transactions: 0, recurring: 0, error: 'Token expired' });
        continue;
      }

      // Backfill bank name if missing
      if (!connection.bank_name) {
        try {
          const accounts = await fetchAccounts(accessToken);
          const bankName = accounts[0]?.provider?.display_name || accounts[0]?.display_name || null;
          const displayNames = accounts.map((a) => [a.display_name, a.description].filter(Boolean).join(' — ') || 'Account');
          await supabase.from('bank_connections').update({
            bank_name: bankName,
            account_display_names: displayNames,
            account_ids: accounts.map(a => a.account_id),
          }).eq('id', connection.id);
        } catch {
          // Non-fatal
        }
      }

      const accountIds = connection.account_ids || [];
      let totalSynced = 0;

      for (const accountId of accountIds) {
        try {
          const transactions = await fetchTransactions(accessToken, accountId, ninetyDaysAgo);
          if (transactions.length === 0) continue;

          const rows = transactions.map((tx) => ({
            user_id: connection.user_id,
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

          const { error: upsertError } = await supabase
            .from('bank_transactions')
            .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

          if (upsertError) {
            console.error(`Bank sync: upsert error for account ${accountId}:`, upsertError);
          } else {
            totalSynced += rows.length;
          }
        } catch (err: any) {
          console.error(`Bank sync: error syncing account ${accountId}:`, err.message);
        }
      }

      // Run recurring detection
      const recurringDetected = await detectRecurring(connection.user_id, supabase);

      // Update last synced
      await supabase
        .from('bank_connections')
        .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', connection.id);

      results.push({
        user_id: connection.user_id,
        connection_id: connection.id,
        transactions: totalSynced,
        recurring: recurringDetected,
      });

      console.log(`Bank sync: connection=${connection.id} user=${connection.user_id} txs=${totalSynced} recurring=${recurringDetected}`);
    } catch (err: any) {
      console.error(`Bank sync: fatal error for connection ${connection.id}:`, err.message);
      results.push({ user_id: connection.user_id, connection_id: connection.id, transactions: 0, recurring: 0, error: err.message });
    }
  }

  const totalTxs = results.reduce((sum, r) => sum + r.transactions, 0);
  const totalRecurring = results.reduce((sum, r) => sum + r.recurring, 0);
  const errors = results.filter(r => r.error).length;

  console.log(`Bank sync complete: connections=${connections.length} transactions=${totalTxs} recurring=${totalRecurring} errors=${errors}`);

  return NextResponse.json({
    ok: true,
    connections: connections.length,
    total_transactions: totalTxs,
    total_recurring: totalRecurring,
    errors,
    results,
  });
}
