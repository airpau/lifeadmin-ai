import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccounts, getTransactions } from '@/lib/yapily';
import {
  getAccessTokenWithClient,
  fetchAccounts as fetchTrueLayerAccounts,
  fetchTransactions as fetchTrueLayerTransactions,
} from '@/lib/truelayer';
import { decrypt } from '@/lib/encrypt';
import { detectRecurring } from '@/lib/detect-recurring';
import {
  TIER_CONFIG,
  GLOBAL_DAILY_API_CEILING,
  getTodayApiCallCount,
  checkAndAlertCeiling,
  sendTelegramAlert,
} from '@/lib/bank-tier-config';

export const maxDuration = 60;

interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  // Yapily fields
  consent_token: string | null;
  consent_expires_at: string | null;
  // TrueLayer fields
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  // Common
  account_ids: string[] | null;
  bank_name: string | null;
  status: string;
  last_synced_at: string | null;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Tiered bank sync cron — runs daily at 3am (configured in vercel.json).
 *
 * Tier behaviour:
 *   Pro + Essential — synced every day (fetches last 90 days of transactions)
 *   Free           — synced only on Mondays (fetches last 90 days)
 *
 * Processing order: Pro first, then Essential, then Free.
 * This ensures paying users are never deprioritised behind free users.
 *
 * Cost protection:
 *   - Global 500 API call ceiling per day (shared with manual syncs)
 *   - Telegram alert at 80% (400 calls)
 *   - Expired consent tokens: mark as expired, do NOT retry in a loop
 *
 * All syncs are logged to bank_sync_log.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const today = new Date();
  const isMonday = today.getUTCDay() === 1; // 0=Sunday, 1=Monday
  const now = today.toISOString();

  // Check global API ceiling before doing anything
  const callCountAtStart = await getTodayApiCallCount(supabase);
  if (callCountAtStart >= GLOBAL_DAILY_API_CEILING) {
    await sendTelegramAlert(
      `🚨 *Bank sync cron blocked*\n\n` +
      `Daily API ceiling of ${GLOBAL_DAILY_API_CEILING} already reached before cron ran.\n` +
      `All syncs skipped. Investigate usage.`
    );
    return NextResponse.json({
      ok: false,
      reason: 'Global API ceiling reached — all syncs skipped',
      callsUsedToday: callCountAtStart,
    });
  }

  // Determine which tiers to sync today
  // Pro + Essential: every day. Free: Mondays only.
  const tiersToSync = isMonday
    ? ['pro', 'essential', 'free']
    : ['pro', 'essential'];

  // Fetch all users by tier, maintaining processing order (Pro first)
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier')
    .in('subscription_tier', tiersToSync);

  if (!allProfiles || allProfiles.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, reason: 'No eligible users' });
  }

  // Sort: pro → essential → free
  const tierOrder: Record<string, number> = { pro: 0, essential: 1, free: 2 };
  const sortedProfiles = [...allProfiles].sort(
    (a, b) => (tierOrder[a.subscription_tier] ?? 3) - (tierOrder[b.subscription_tier] ?? 3)
  );

  const orderedUserIds = sortedProfiles.map((p) => p.id);

  // Fetch active bank connections for these users (TrueLayer + Yapily)
  const { data: connections, error: connError } = await supabase
    .from('bank_connections')
    .select('*')
    .eq('status', 'active')
    .in('provider', ['truelayer', 'yapily'])
    .in('user_id', orderedUserIds.length > 0 ? orderedUserIds : ['00000000-0000-0000-0000-000000000000']);

  if (connError || !connections || connections.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, reason: 'No active bank connections' });
  }

  // Sort connections to match tier order
  const userTierMap = new Map(sortedProfiles.map((p) => [p.id, p.subscription_tier]));
  const sortedConnections = [...connections].sort((a, b) => {
    const tierA = tierOrder[userTierMap.get(a.user_id) ?? 'free'] ?? 3;
    const tierB = tierOrder[userTierMap.get(b.user_id) ?? 'free'] ?? 3;
    return tierA - tierB;
  });

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  type SyncResult = {
    user_id: string;
    connection_id: string;
    tier: string;
    transactions: number;
    recurring: number;
    api_calls: number;
    error?: string;
  };

  const results: SyncResult[] = [];
  let totalApiCalls = 0;

  for (const connection of sortedConnections as BankConnection[]) {
    // Re-check ceiling on every iteration to stop mid-run if needed
    const currentCallCount = callCountAtStart + totalApiCalls;
    if (currentCallCount >= GLOBAL_DAILY_API_CEILING) {
      const remaining = sortedConnections.length - results.length;
      await sendTelegramAlert(
        `🚨 *Open Banking API ceiling hit mid-cron*\n\n` +
        `Stopped after ${results.length} connections processed.\n` +
        `${remaining} connections skipped. Total calls today: ${currentCallCount}.`
      );
      break;
    }

    const tier = userTierMap.get(connection.user_id) ?? 'free';
    let connectionApiCalls = 0;

    try {
      let totalSynced = 0;

      if (connection.provider === 'truelayer') {
        // === TrueLayer path ===
        if (!connection.access_token) {
          console.error(`Bank sync: no access token for TrueLayer connection ${connection.id}`);
          await supabase
            .from('bank_connections')
            .update({ status: 'expired', updated_at: now })
            .eq('id', connection.id);

          await supabase.from('bank_sync_log').insert({
            user_id: connection.user_id,
            connection_id: connection.id,
            trigger_type: 'cron',
            status: 'failed',
            api_calls_made: connectionApiCalls,
            error_message: 'No access token — reconnect required',
          });

          results.push({
            user_id: connection.user_id,
            connection_id: connection.id,
            tier,
            transactions: 0,
            recurring: 0,
            api_calls: connectionApiCalls,
            error: 'No access token',
          });
          totalApiCalls += connectionApiCalls;
          continue;
        }

        // Get access token, refreshing if expired — mark connection expired if refresh fails
        let accessToken: string;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          accessToken = await getAccessTokenWithClient(connection as any, supabase);
        } catch (refreshErr: any) {
          console.error(`Bank sync: token refresh failed for ${connection.id}:`, refreshErr.message);
          await supabase
            .from('bank_connections')
            .update({ status: 'expired', updated_at: now })
            .eq('id', connection.id);

          await supabase.from('bank_sync_log').insert({
            user_id: connection.user_id,
            connection_id: connection.id,
            trigger_type: 'cron',
            status: 'failed',
            api_calls_made: connectionApiCalls,
            error_message: 'Token refresh failed — reconnect required',
          });

          results.push({
            user_id: connection.user_id,
            connection_id: connection.id,
            tier,
            transactions: 0,
            recurring: 0,
            api_calls: connectionApiCalls,
            error: 'Token refresh failed',
          });
          totalApiCalls += connectionApiCalls;
          continue;
        }

        // Backfill bank name if missing
        if (!connection.bank_name) {
          try {
            const accounts = await fetchTrueLayerAccounts(accessToken);
            connectionApiCalls++;
            const bankName = accounts[0]?.provider?.display_name || accounts[0]?.display_name || null;
            const displayNames = accounts.map((a) => a.display_name || 'Account');
            await supabase.from('bank_connections').update({
              bank_name: bankName,
              account_display_names: displayNames,
              account_ids: accounts.map((a) => a.account_id),
            }).eq('id', connection.id);
          } catch {
            // Non-fatal
          }
        }

        // Sync transactions for each account
        const accountIds = connection.account_ids || [];
        for (const accountId of accountIds) {
          try {
            const transactions = await fetchTrueLayerTransactions(accessToken, accountId, ninetyDaysAgo);
            connectionApiCalls++;

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
              category: null,
              timestamp: tx.timestamp,
            }));

            const { error: upsertError } = await supabase
              .from('bank_transactions')
              .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

            if (!upsertError) totalSynced += rows.length;
            else console.error(`Bank sync: upsert error for ${accountId}:`, upsertError);
          } catch (err: any) {
            console.error(`Bank sync: error on account ${accountId}:`, err.message);
          }
        }
      } else {
        // === Yapily path ===
        if (!connection.consent_token) {
          console.error(`Bank sync: no consent token for ${connection.id}`);
          await supabase
            .from('bank_connections')
            .update({ status: 'expired', updated_at: now })
            .eq('id', connection.id);

          await supabase.from('bank_sync_log').insert({
            user_id: connection.user_id,
            connection_id: connection.id,
            trigger_type: 'cron',
            status: 'failed',
            api_calls_made: connectionApiCalls,
            error_message: 'No consent token — reconnect required',
          });

          results.push({
            user_id: connection.user_id,
            connection_id: connection.id,
            tier,
            transactions: 0,
            recurring: 0,
            api_calls: connectionApiCalls,
            error: 'No consent token',
          });
          totalApiCalls += connectionApiCalls;
          continue;
        }

        // Check consent expiry (Yapily consents are valid for 90 days)
        if (connection.consent_expires_at) {
          const expiresAt = new Date(connection.consent_expires_at).getTime();
          if (Date.now() >= expiresAt) {
            console.error(`Bank sync: consent expired for ${connection.id}`);
            await supabase
              .from('bank_connections')
              .update({ status: 'expired', updated_at: now })
              .eq('id', connection.id);

            await supabase.from('bank_sync_log').insert({
              user_id: connection.user_id,
              connection_id: connection.id,
              trigger_type: 'cron',
              status: 'failed',
              api_calls_made: connectionApiCalls,
              error_message: 'Consent expired — reconnect required',
            });

            results.push({
              user_id: connection.user_id,
              connection_id: connection.id,
              tier,
              transactions: 0,
              recurring: 0,
              api_calls: connectionApiCalls,
              error: 'Consent expired',
            });
            totalApiCalls += connectionApiCalls;
            continue;
          }
        }

        // Decrypt consent token
        const consentToken = decrypt(connection.consent_token);

        // Backfill bank name if missing
        if (!connection.bank_name) {
          try {
            const accounts = await getAccounts(consentToken);
            connectionApiCalls++;
            const bankName = accounts[0]?.institution?.name || null;
            const displayNames = accounts.map((a) =>
              a.accountNames?.[0]?.name || a.type || 'Account'
            );
            await supabase.from('bank_connections').update({
              bank_name: bankName,
              account_display_names: displayNames,
              account_ids: accounts.map((a) => a.id),
            }).eq('id', connection.id);
          } catch {
            // Non-fatal
          }
        }

        // Sync transactions
        const accountIds = connection.account_ids || [];
        for (const accountId of accountIds) {
          try {
            const fromDate = ninetyDaysAgo.toISOString().split('T')[0];
            const toDate = new Date().toISOString().split('T')[0];
            const transactions = await getTransactions(accountId, consentToken, fromDate, toDate);
            connectionApiCalls++;

            if (transactions.length === 0) continue;

            const rows = transactions.map((tx) => ({
              user_id: connection.user_id,
              connection_id: connection.id,
              transaction_id: tx.id,
              account_id: accountId,
              amount: tx.transactionAmount.amount,
              currency: tx.transactionAmount.currency || 'GBP',
              description: tx.description || null,
              merchant_name: tx.merchantName || null,
              category: null,
              timestamp: tx.bookingDateTime,
            }));

            const { error: upsertError } = await supabase
              .from('bank_transactions')
              .upsert(rows, { onConflict: 'user_id,transaction_id', ignoreDuplicates: true });

            if (!upsertError) totalSynced += rows.length;
            else console.error(`Bank sync: upsert error for ${accountId}:`, upsertError);
          } catch (err: any) {
            console.error(`Bank sync: error on account ${accountId}:`, err.message);
          }
        }
      }

      // Post-sync enrichment: fix merchant names, auto-categorise, detect recurring
      // These DB functions must run for every user after every sync (they are idempotent)
      const enrichmentFunctions = [
        { name: 'fix_ee_card_merchant_names', args: { p_user_id: connection.user_id } },
        { name: 'auto_categorise_transactions', args: { p_user_id: connection.user_id } },
        { name: 'detect_and_sync_recurring_transactions', args: { p_user_id: connection.user_id } },
      ] as const;

      for (const fn of enrichmentFunctions) {
        try {
          const { error: enrichErr } = await supabase.rpc(fn.name, fn.args);
          if (enrichErr) {
            console.error(`Bank sync: ${fn.name} RPC error for user ${connection.user_id}:`, enrichErr.message);
          }
        } catch (enrichEx: any) {
          // Non-fatal — enrichment failure must never abort the sync
          console.error(`Bank sync: ${fn.name} threw for user ${connection.user_id}:`, enrichEx.message);
        }
      }

      // Run recurring detection (JS-side; the DB function above is also called server-side)
      const recurringDetected = await detectRecurring(connection.user_id, supabase);

      // Update last synced
      await supabase
        .from('bank_connections')
        .update({ last_synced_at: now, updated_at: now })
        .eq('id', connection.id);

      // Log success
      await supabase.from('bank_sync_log').insert({
        user_id: connection.user_id,
        connection_id: connection.id,
        trigger_type: 'cron',
        status: 'success',
        api_calls_made: connectionApiCalls,
      });

      results.push({
        user_id: connection.user_id,
        connection_id: connection.id,
        tier,
        transactions: totalSynced,
        recurring: recurringDetected,
        api_calls: connectionApiCalls,
      });

      console.log(
        `Bank sync: conn=${connection.id} provider=${connection.provider} tier=${tier} ` +
        `txs=${totalSynced} recurring=${recurringDetected} api_calls=${connectionApiCalls}`
      );
    } catch (err: any) {
      console.error(`Bank sync: fatal error for ${connection.id}:`, err.message);

      await supabase.from('bank_sync_log').insert({
        user_id: connection.user_id,
        connection_id: connection.id,
        trigger_type: 'cron',
        status: 'failed',
        api_calls_made: connectionApiCalls,
        error_message: err.message,
      });

      results.push({
        user_id: connection.user_id,
        connection_id: connection.id,
        tier,
        transactions: 0,
        recurring: 0,
        api_calls: connectionApiCalls,
        error: err.message,
      });
    }

    totalApiCalls += connectionApiCalls;
  }

  // Fire ceiling alert if we crossed 80% during this cron run
  await checkAndAlertCeiling(callCountAtStart, callCountAtStart + totalApiCalls);

  const totalTxs = results.reduce((sum, r) => sum + r.transactions, 0);
  const totalRecurring = results.reduce((sum, r) => sum + r.recurring, 0);
  const errors = results.filter((r) => r.error).length;

  console.log(
    `Bank sync complete: connections=${results.length} txs=${totalTxs} ` +
    `recurring=${totalRecurring} errors=${errors} api_calls=${totalApiCalls} ` +
    `monday=${isMonday} tiers_synced=${tiersToSync.join(',')}`
  );

  return NextResponse.json({
    ok: true,
    is_monday: isMonday,
    tiers_synced: tiersToSync,
    connections_processed: results.length,
    total_transactions: totalTxs,
    total_recurring: totalRecurring,
    total_api_calls: totalApiCalls,
    errors,
    ceiling: { used: callCountAtStart + totalApiCalls, limit: GLOBAL_DAILY_API_CEILING },
  });
}
