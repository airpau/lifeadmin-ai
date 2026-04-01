import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { getAccessToken, fetchAccounts, fetchCards, fetchTransactions, fetchPendingTransactions, fetchCardTransactions, fetchCardPendingTransactions, BankConnection } from '@/lib/truelayer';
import { extractMerchantFromDescription } from '@/lib/detect-recurring';
import { getUserPlan } from '@/lib/get-user-plan';

export const maxDuration = 60;

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Free users: allow one-time scan only (check if already synced before)
  const plan = await getUserPlan(user.id);
  if (plan.tier === 'free') {
    const { data: connections } = await supabase
      .from('bank_connections')
      .select('last_synced_at')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const hasSyncedBefore = connections?.some(c => c.last_synced_at !== null);
    if (hasSyncedBefore) {
      return NextResponse.json(
        { error: 'Free plan includes one initial bank scan. Upgrade to Essential for daily auto-sync.', upgradeRequired: true },
        { status: 403 }
      );
    }
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

  // Fetch merchant rules for auto-categorization
  const { data: rules } = await supabase.from('merchant_rules').select('pattern, raw_name_normalised, category');


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

    // Fetch accounts and extract bank name
    let accountIds = connection.account_ids || [];
    // Always try to resolve accounts (accounts may have been added since initial connection)
    {
      try {
        const accounts = await fetchAccounts(accessToken);
        console.log('TrueLayer accounts response:', JSON.stringify(accounts.map(a => ({
          id: a.account_id, type: a.account_type, display_name: a.display_name,
          provider: a.provider, description: a.description,
        }))));

        accountIds = accounts.map((a) => a.account_id);
        const displayNames = accounts.map((a) => {
          const parts = [a.display_name, a.description].filter(Boolean);
          return parts.join(' — ') || 'Account';
        });

        // Bank name: prefer provider.display_name, then account display_name
        const bankName = accounts[0]?.provider?.display_name
          || accounts[0]?.display_name
          || null;

        await supabase
          .from('bank_connections')
          .update({
            account_ids: accountIds,
            account_display_names: displayNames,
            bank_name: bankName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', connection.id);

        console.log(`Bank name resolved: "${bankName}" for connection ${connection.id}`);
      } catch (err) {
        console.error('Failed to fetch accounts:', err);
        if (accountIds.length === 0) continue;
      }
    }

    const accountResults: Array<{ accountId: string; fetched: number; inserted: number }> = [];
    for (const accountId of accountIds) {
      try {
        console.log(`Fetching transactions for account ${accountId} from ${twelveMonthsAgo.toISOString().split('T')[0]}`);
        const settledTxns = await fetchTransactions(accessToken, accountId, twelveMonthsAgo);
        console.log(`TrueLayer returned ${settledTxns.length} settled transactions for account ${accountId}`);

        // Also fetch pending (today's unsettled) transactions
        const pendingTxns = await fetchPendingTransactions(accessToken, accountId);
        console.log(`TrueLayer returned ${pendingTxns.length} pending transactions for account ${accountId}`);

        // Merge settled + pending, deduplicating by transaction_id
        const seenIds = new Set(settledTxns.map(t => t.transaction_id));
        const uniquePending = pendingTxns.filter(t => !seenIds.has(t.transaction_id));
        const transactions = [...settledTxns, ...uniquePending];
        console.log(`Total: ${transactions.length} transactions (${settledTxns.length} settled + ${uniquePending.length} pending)`);

        if (transactions.length === 0) {
          accountResults.push({ accountId, fetched: 0, inserted: 0 });
          continue;
        }

        // Log date range of returned transactions
        const timestamps = transactions.map(t => t.timestamp).sort();
        console.log(`Transaction date range: ${timestamps[0]} to ${timestamps[timestamps.length - 1]}`);

        const rows = transactions.map((tx) => {
          const desc = (tx.description || '').toLowerCase();
          const merch = (tx.merchant_name || '').toLowerCase();
          let matchedCategory = null;
          
          if (rules) {
            for (const rule of rules) {
              const rulePattern = (rule.pattern || rule.raw_name_normalised || '').toLowerCase();
              if (!rulePattern) continue;
              if (desc.includes(rulePattern) || merch.includes(rulePattern)) {
                matchedCategory = rule.category;
                break;
              }
            }
          }

          return {
            user_id: user.id,
            connection_id: connection.id,
            transaction_id: tx.transaction_id,
            account_id: accountId,
            amount: tx.amount,
            currency: tx.currency || 'GBP',
            description: tx.description || null,
            merchant_name: tx.merchant_name || extractMerchantFromDescription(tx.description || '') || null,
            category: tx.transaction_category || null,
            user_category: matchedCategory,
            timestamp: tx.timestamp,
          };
        });

        const { error: upsertError } = await supabase
          .from('bank_transactions')
          .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

        if (upsertError) {
          console.error('Error upserting transactions:', upsertError);
          accountResults.push({ accountId, fetched: transactions.length, inserted: 0 });
        } else {
          totalSynced += rows.length;
          accountResults.push({ accountId, fetched: transactions.length, inserted: rows.length });
        }
      } catch (err) {
        console.error(`Error syncing account ${accountId} (non-fatal):`, err);
        accountResults.push({ accountId, fetched: 0, inserted: 0 });
      }
    }

    // Also sync card accounts (debit/credit cards — may have faster updates)
    try {
      const cards = await fetchCards(accessToken);
      console.log(`Found ${cards.length} card accounts for connection ${connection.id}`);
      for (const card of cards) {
        const cardId = card.account_id;
        try {
          const cardSettled = await fetchCardTransactions(accessToken, cardId, twelveMonthsAgo);
          const cardPending = await fetchCardPendingTransactions(accessToken, cardId);
          const seenCardIds = new Set(cardSettled.map(t => t.transaction_id));
          const uniqueCardPending = cardPending.filter(t => !seenCardIds.has(t.transaction_id));
          const cardTxns = [...cardSettled, ...uniqueCardPending];
          console.log(`Card ${card.display_name}: ${cardSettled.length} settled + ${uniqueCardPending.length} pending`);

          if (cardTxns.length === 0) continue;

          const cardRows = cardTxns.map((tx) => ({
            user_id: user.id,
            connection_id: connection.id,
            transaction_id: tx.transaction_id,
            account_id: cardId,
            amount: tx.amount,
            currency: tx.currency || 'GBP',
            description: tx.description || null,
            merchant_name: tx.merchant_name || extractMerchantFromDescription(tx.description || '') || null,
            category: tx.transaction_category || null,
            user_category: null,
            timestamp: tx.timestamp,
          }));

          const { error } = await supabase
            .from('bank_transactions')
            .upsert(cardRows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

          if (!error) totalSynced += cardRows.length;
        } catch (err) {
          console.error(`Card sync error for ${cardId}:`, err);
        }
      }
    } catch (err) {
      console.log('Card accounts not available (non-fatal):', err);
    }

    await supabase
      .from('bank_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection.id);
  }

  // Fix EE-branded card merchant names across all connections
  const adminClient = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  await adminClient.rpc('fix_ee_card_merchant_names', { p_user_id: user.id });

  // Run recurring detection via DB function (scans all accounts, creates subscriptions)
  const { data: recurringData } = await adminClient.rpc('detect_and_sync_recurring_transactions', { p_user_id: user.id });
  const recurringDetected = typeof recurringData === 'number' ? recurringData : 0;

  return NextResponse.json({
    synced: totalSynced,
    recurring_detected: recurringDetected,
    connections: connections.length,
  });
}
