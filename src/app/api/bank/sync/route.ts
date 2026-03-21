import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAccessToken, fetchAccounts, fetchTransactions, BankConnection } from '@/lib/truelayer';
import { detectRecurring } from '@/lib/detect-recurring';
import { getUserPlan } from '@/lib/get-user-plan';

export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Block free-tier users at API level
  const plan = await getUserPlan(user.id);
  if (plan.tier === 'free') {
    return NextResponse.json(
      { error: 'Upgrade to Essential to use this feature', upgradeRequired: true },
      { status: 403 }
    );
  }

  // Fetch active bank connections
  const { data: connections, error: connError } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (connError || !connections || connections.length === 0) {
    return NextResponse.json({ error: 'No active bank connections' }, { status: 400 });
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  let totalSynced = 0;

  for (const connection of connections as BankConnection[]) {
    let accessToken: string;
    try {
      accessToken = await getAccessToken(connection);
    } catch (err) {
      console.error(`Failed to get token for connection ${connection.id}:`, err);
      // Mark as expired if token refresh fails
      await supabase
        .from('bank_connections')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', connection.id);
      continue;
    }

    // Fetch accounts if we don't have them stored
    let accountIds = connection.account_ids || [];
    if (accountIds.length === 0) {
      try {
        const accounts = await fetchAccounts(accessToken);
        accountIds = accounts.map((a) => a.account_id);
        await supabase
          .from('bank_connections')
          .update({ account_ids: accountIds, updated_at: new Date().toISOString() })
          .eq('id', connection.id);
      } catch (err) {
        console.error('Failed to fetch accounts:', err);
        continue;
      }
    }

    for (const accountId of accountIds) {
      try {
        const transactions = await fetchTransactions(accessToken, accountId, twelveMonthsAgo);

        if (transactions.length === 0) continue;

        const rows = transactions.map((tx) => ({
          user_id: user.id,
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
          console.error('Error upserting transactions:', upsertError);
        } else {
          totalSynced += rows.length;
        }
      } catch (err) {
        console.error(`Error syncing account ${accountId} (non-fatal):`, err);
      }
    }

    await supabase
      .from('bank_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);
  }

  // Run recurring detection after all syncs
  const recurringDetected = await detectRecurring(user.id, supabase);

  return NextResponse.json({ synced: totalSynced, recurring_detected: recurringDetected });
}
