import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccounts, getAllTransactions, isYapilyConsentExpiryError } from '@/lib/yapily';
import { decrypt } from '@/lib/encrypt';
import { snapshotAccounts, upsertYapilyTransactions, type AccountSnapshot } from '@/lib/yapily/connection-store';
import { recordConsentFailure, clearConsentFailures } from '@/lib/yapily/consent-failure-tracker';
import { detectRecurring } from '@/lib/detect-recurring';
import { triggerSheetsExport } from '@/lib/trigger-sheets-export';
import { dispatchMoneyInAlertsForUser } from '@/lib/alerts/money-in';
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
  consent_token: string | null;
  consent_expires_at: string | null;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_ids: string[] | null;
  account_identifications_hashes: string[] | null;
  account_display_names: string[] | null;
  bank_name: string | null;
  status: string;
  last_synced_at: string | null;
  connected_at: string | null;
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

  // Fetch active bank connections for these users.
  // Also include 'token_expired' connections — we attempt a token refresh and reset to active on success
  const { data: connections, error: connError } = await supabase
    .from('bank_connections')
    .select('*')
    .in('status', ['active', 'token_expired'])
    .eq('provider', 'yapily')
    .is('archived_at', null)
    .is('deleted_at', null)
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

  // Default lookback ceiling — individual connections may use a later floor (see below).
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
    // Hoisted so the bank_sync_log writes at the bottom of this loop
    // body can see the actual ISO range used for the Yapily /transactions
    // call. Paul flagged 2026-05-15 that date_range_from / date_range_to
    // were NULL on every log row — they're populated below.
    let syncFromDate: string | null = null;
    let syncToDate: string | null = null;
    let totalReturned = 0; // raw transactions seen across all accounts
    let totalSkippedAsDuplicate = 0;

    try {
      let totalSynced = 0;
      let transactionSyncSucceeded = false;
      const accountErrors: string[] = [];
      // Set to true ONLY when a per-account Yapily call comes back with a
      // consent/token expiry signal (see isYapilyConsentExpiryError). A
      // generic 403 (e.g. insufficient_rights, feature_not_supported) does
      // NOT flip this — those are permission/scope problems against a
      // still-valid consent and must not disconnect the bank.
      let consentExpiryDetected = false;

      {
        if (!connection.consent_token) {
          console.error(`Bank sync: no consent token for ${connection.id}`);
          await supabase
            .from('bank_connections')
            .update({ status: 'expired', updated_at: now })
            .eq('id', connection.id);

          await insertSyncLog(supabase, {
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

            await insertSyncLog(supabase, {
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
        let accountIds = connection.account_ids || [];

        if (accountIds.length === 0 || !connection.bank_name) {
          try {
            const accounts = await getAccounts(consentToken);
            connectionApiCalls++;
            const bankName = accounts[0]?.institution?.name || null;
            const displayNames = accounts.map((a) =>
              a.accountNames?.[0]?.name || a.type || 'Account'
            );
            accountIds = accounts.map((a) => a.id);
            await supabase.from('bank_connections').update({
              bank_name: bankName,
              account_display_names: displayNames,
              account_ids: accountIds,
            }).eq('id', connection.id);
          } catch {
            // Non-fatal
          }
        }

        if (accountIds.length === 0) {
          throw new Error('No bank accounts available to sync');
        }

        // ── Backfill account_identifications_hashes if missing ──
        // This can happen when a connection was created before the hash
        // invariant was enforced, or when a migration gap left the field
        // null. Without hashes the dedup invariants in connection-store
        // can't function, so we fetch accounts and compute them now.
        let storedHashes: string[] = Array.isArray(connection.account_identifications_hashes)
          ? connection.account_identifications_hashes
          : [];
        let storedDisplayNames: string[] = Array.isArray(connection.account_display_names)
          ? connection.account_display_names
          : [];

        if (storedHashes.length === 0 || storedHashes.length < accountIds.length) {
          try {
            const accounts = await getAccounts(consentToken);
            connectionApiCalls++;
            const snapshots = snapshotAccounts(accounts);
            const newHashes = snapshots.map((s) => s.accountIdentificationsHash ?? '');
            const newDisplayNames = snapshots.map((s) => s.displayName);
            // Only update if we got valid hashes back
            if (newHashes.length > 0 && newHashes.some((h) => h.length > 0)) {
              await supabase
                .from('bank_connections')
                .update({
                  account_identifications_hashes: newHashes,
                  account_display_names: newDisplayNames,
                  account_ids: snapshots.map((s) => s.yapilyAccountId),
                  updated_at: now,
                })
                .eq('id', connection.id);
              storedHashes = newHashes;
              storedDisplayNames = newDisplayNames;
              accountIds = snapshots.map((s) => s.yapilyAccountId);
              await sendTelegramAlert(
                `⚠️ *Bank sync hash backfill*\n\n` +
                `Connection \`${connection.id}\` for user \`${connection.user_id}\` ` +
                `had missing \`account_identifications_hashes\`. Fetched ${accounts.length} accounts from Yapily and backfilled. ` +
                `This was a silent skip — no transactions were being synced for this connection.\n\n` +
                `Next cron run should sync normally.`
              );
            }
          } catch (err: any) {
            console.error(`Bank sync: hash backfill failed for ${connection.id}:`, err.message);
            await sendTelegramAlert(
              `🚨 *Bank sync hash backfill FAILED*\n\n` +
              `Connection \`${connection.id}\` for user \`${connection.user_id}\`. ` +
              `Error: ${err.message}\n\n` +
              `This connection will continue to be skipped until hashes are present.`
            );
          }
        }

        // Route through connection-store so the cron uses the same
        // dedup invariants as the OAuth callback's initial-sync.
        // Replaced 2026-04-28 — the OLD upsert pattern keyed on
        // (user_id, transaction_id) and Yapily reissues IDs across
        // calls, so each cron run was inserting phantom duplicates.
        const fromDate = ninetyDaysAgo.toISOString();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const toDate = tomorrow.toISOString();
        syncFromDate = fromDate;
        syncToDate = toDate;

        for (let i = 0; i < accountIds.length; i++) {
          const accountId = accountIds[i];
          const accountHash = storedHashes[i] || null;
          if (!accountHash) {
            console.warn(`Bank sync: connection ${connection.id} account ${accountId} has no stored hash — skipping`);
            continue;
          }
          try {
            // Use the paginating helper so a high-volume account
            // doesn't lose recent transactions behind Yapily's
            // default page cap. `getAllTransactions` walks the
            // `before` cursor and combines pages; each page is
            // counted as one API call against the daily ceiling.
            const transactions = await getAllTransactions(accountId, consentToken, {
              from: fromDate,
              before: toDate,
            });
            // Conservative count: assume one API call per ~1000
            // returned, minimum one. The exact number is logged
            // per-page in getTransactionsPage; this is a reasonable
            // upper-bound for the ceiling check.
            const pagesFetched = Math.max(1, Math.ceil(transactions.length / 1000));
            connectionApiCalls += pagesFetched;
            transactionSyncSucceeded = true;
            totalReturned += transactions.length;
            if (transactions.length === 0) {
              console.warn(
                `[bank-sync] 0 transactions returned for account ${accountId} (user ${connection.user_id}, conn ${connection.id}, window ${fromDate} → ${toDate})`,
              );
              continue;
            }

            const accountSnapshot: AccountSnapshot = {
              yapilyAccountId: accountId,
              displayName: storedDisplayNames[i] || 'Account',
              accountIdentificationsHash: accountHash,
              accountIdentificationsRaw: [],
              currency: 'GBP',
            };
            const result = await upsertYapilyTransactions({
              userId: connection.user_id,
              connectionId: connection.id,
              account: accountSnapshot,
              transactions,
            });
            totalSynced += result.inserted;
            totalSkippedAsDuplicate += result.skippedAsDuplicate;
            console.log(
              `[bank-sync] conn=${connection.id} account=${accountId} returned=${transactions.length} inserted=${result.inserted} duplicate=${result.skippedAsDuplicate} noHash=${result.skippedNoHash}`,
            );
          } catch (err: any) {
            const errorMsg = `account ${accountId}: ${err?.message || err}`;
            const status = (err as Error & { status?: number })?.status;
            if (isYapilyConsentExpiryError(err)) {
              // True consent/token expiry — flag so we flip status='expired'
              // after the loop and bail without hammering Yapily for the
              // remaining accounts on this same dead consent.
              consentExpiryDetected = true;
              console.error(`Bank sync: consent expiry on ${errorMsg}`);
              accountErrors.push(errorMsg);
              break;
            }
            // Generic Yapily error (including 403 insufficient_rights and
            // 5xx) — log a warning and continue. The bank stays 'active'
            // so a one-bank hiccup doesn't take down the user's UI.
            console.warn(`Bank sync: non-fatal Yapily error on ${errorMsg}${status ? ` (status=${status})` : ''}`);
            accountErrors.push(errorMsg);
          }
        }
      }

      // If every account failed AND none of the failures was a consent
      // expiry, the connection itself is fine — log as a sync failure but
      // don't disconnect. Only consent_expires_at past now (handled above)
      // or a Yapily 401/CONSENT_EXPIRED-class 403 SUSTAINED OVER 3
      // CONSECUTIVE RUNS flips the status (see CONSENT_FAILURE_THRESHOLD).
      // Single transient errors increment the counter and are logged.
      if (consentExpiryDetected) {
        const detail = accountErrors.join('; ');
        const failure = await recordConsentFailure(supabase, connection.id);
        const errorLabel = failure.shouldFlipExpired
          ? 'Yapily consent expired (threshold reached)'
          : `Yapily consent error ${failure.count}/3`;

        if (failure.shouldFlipExpired) {
          console.error(`Bank sync: Yapily consent expiry for ${connection.id} — threshold ${failure.count} reached, flipping to expired`);
          await supabase
            .from('bank_connections')
            .update({ status: 'expired', updated_at: now })
            .eq('id', connection.id);
        } else {
          console.warn(`Bank sync: Yapily consent-expiry signal ${failure.count}/3 for ${connection.id} — staying active until threshold`);
        }

        await insertSyncLog(supabase, {
          user_id: connection.user_id,
          connection_id: connection.id,
          trigger_type: 'cron',
          status: 'failed',
          api_calls_made: connectionApiCalls,
          error_message: `${errorLabel}: ${detail}`,
          date_range_from: syncFromDate,
          date_range_to: syncToDate,
          transactions_synced: totalReturned,
          transactions_new: 0,
        });

        results.push({
          user_id: connection.user_id,
          connection_id: connection.id,
          tier,
          transactions: 0,
          recurring: 0,
          api_calls: connectionApiCalls,
          error: errorLabel,
        });
        totalApiCalls += connectionApiCalls;
        continue;
      }

      if (!transactionSyncSucceeded) {
        const detail = accountErrors.length > 0 ? accountErrors.join('; ') : 'unknown error';
        throw new Error(`All account sync attempts failed: ${detail}`);
      }

      // Post-sync enrichment: fix merchant names, auto-categorise, detect recurring,
      // pair-match internal transfers across the user's connected accounts.
      // These DB functions must run for every user after every sync (they are idempotent).
      // Order matters: categorise first (sets user_category), then pair-match
      // (which respects existing user_category), then recurring detection.
      const enrichmentFunctions = [
        { name: 'deduplicate_bank_transactions', args: { p_user_id: connection.user_id } },
        { name: 'fix_ee_card_merchant_names', args: { p_user_id: connection.user_id } },
        { name: 'auto_categorise_transactions', args: { p_user_id: connection.user_id } },
        { name: 'mark_internal_transfers', args: { p_user_id: connection.user_id } },
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

      // Fire money-in alerts for any credits inserted in the last 24h.
      // Idempotent + respects per-user threshold + transfer detection.
      // Non-fatal: a notification dispatch failure must never break sync.
      try {
        const moneyInResult = await dispatchMoneyInAlertsForUser(supabase, connection.user_id);
        if (moneyInResult.alerted > 0) {
          console.log(
            `[bank-sync] money-in alerts: user=${connection.user_id} alerted=${moneyInResult.alerted} skipped=${moneyInResult.skipped}`,
          );
        }
      } catch (err: any) {
        console.error(`[bank-sync] money-in dispatch threw for user ${connection.user_id}:`, err?.message);
      }

      // Update last synced; reset token_expired back to active since refresh succeeded
      await supabase
        .from('bank_connections')
        .update({ last_synced_at: now, updated_at: now, status: 'active' })
        .eq('id', connection.id);

      // Clear any accumulated consent-failure counter — a successful
      // sync proves the consent is healthy, so the threshold restarts
      // from 0 on the next signal.
      await clearConsentFailures(supabase, connection.id);

      // Log success. Populates the diagnostic columns Paul added live
      // 2026-05-15 so the next 0-transaction regression doesn't take
      // 10 silent "success" runs to spot — the log row now shows the
      // exact date window queried plus seen / inserted counts.
      await insertSyncLog(supabase, {
        user_id: connection.user_id,
        connection_id: connection.id,
        trigger_type: 'cron',
        status: 'success',
        api_calls_made: connectionApiCalls,
        date_range_from: syncFromDate,
        date_range_to: syncToDate,
        transactions_synced: totalReturned,
        transactions_new: totalSynced,
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

      await insertSyncLog(supabase, {
        user_id: connection.user_id,
        connection_id: connection.id,
        trigger_type: 'cron',
        status: 'failed',
        api_calls_made: connectionApiCalls,
        error_message: err.message,
        date_range_from: syncFromDate,
        date_range_to: syncToDate,
        transactions_synced: totalReturned,
        transactions_new: 0,
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

  // Push newly-synced transactions into connected Google Sheets, one per user.
  // We dedupe by user_id so a user with two banks only triggers one export,
  // and we only trigger for users whose bank sync actually succeeded (no error).
  // Fire-and-forget — a failure here must not roll back the sync response.
  const sheetSyncUsers = Array.from(
    new Set(
      results
        .filter((r) => !r.error && r.transactions > 0)
        .map((r) => r.user_id)
    )
  );
  for (const uid of sheetSyncUsers) {
    await triggerSheetsExport(supabase, uid);
  }

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

/**
 * Insert into bank_sync_log with the diagnostic columns Paul added
 * live 2026-05-15 (date_range_from, date_range_to, transactions_synced,
 * transactions_new). If those columns don't exist in the local /
 * preview DB (the project's migration history hasn't caught up yet),
 * fall back to the original minimal payload so a schema mismatch
 * doesn't 500 the sync and lose the legacy log row too.
 */
type SyncLogPayload = {
  user_id: string;
  connection_id: string;
  trigger_type: 'cron' | 'manual' | 'initial';
  status: 'success' | 'failed' | 'skipped';
  api_calls_made: number;
  error_message?: string;
  date_range_from?: string | null;
  date_range_to?: string | null;
  transactions_synced?: number;
  transactions_new?: number;
};

async function insertSyncLog(
  supabase: ReturnType<typeof getAdmin>,
  payload: SyncLogPayload,
): Promise<void> {
  const { error } = await supabase.from('bank_sync_log').insert(payload);
  if (!error) return;
  const code = (error as { code?: string }).code;
  // 42703 = column does not exist. Retry with the minimal column set
  // so the failure mode for an out-of-sync schema is "missing
  // diagnostic columns", not "no log row at all".
  if (code === '42703' || /column .* does not exist/i.test(error.message)) {
    console.warn(
      `[bank-sync] bank_sync_log schema missing diagnostic columns — retrying with legacy payload: ${error.message}`,
    );
    const legacy = {
      user_id: payload.user_id,
      connection_id: payload.connection_id,
      trigger_type: payload.trigger_type,
      status: payload.status,
      api_calls_made: payload.api_calls_made,
      error_message: payload.error_message,
    };
    const { error: legacyErr } = await supabase.from('bank_sync_log').insert(legacy);
    if (legacyErr) {
      console.error('[bank-sync] legacy bank_sync_log insert also failed:', legacyErr.message);
    }
    return;
  }
  console.error('[bank-sync] bank_sync_log insert failed:', error.message);
}
