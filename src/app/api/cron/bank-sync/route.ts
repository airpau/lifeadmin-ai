import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getAccounts,
  getAllTransactions,
  triageConsentFailure,
  yapilySleep,
  PER_CONSENT_CALL_DELAY_MS,
} from '@/lib/yapily';
import { resolveTransactionWindow } from '@/lib/yapily/sync-window';
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
import { PAID_PLAN_TIERS } from '@/lib/tier-rank';
import { PLAN_LIMITS, type PlanTier } from '@/lib/plan-limits';
import {
  SYNC_INTERVAL_MINUTES,
  computeNextSyncAt,
  assignSyncOffsetMinutes,
  staleClaimCutoff,
} from '@/lib/yapily/sync-scheduler';

// Raised from 60s on 2026-08-21. Migle's polling guidance costs
// wall-clock time on purpose: 5s between accounts on the same consent,
// and a retry ladder starting at 5s rather than 500ms. A single
// connection with three accounts that hits one retry now needs well
// over a minute of mostly-sleeping. The stagger means each run has few
// connections to do, so the extra ceiling is headroom, not typical
// runtime.
export const maxDuration = 300;

/**
 * Hard cap on connections touched in one run.
 *
 * With a 15-minute cron over a 240-minute cycle there are 16 runs per
 * cycle, so this is a per-run slice, not a per-cycle limit — anything
 * not reached stays due and is picked up by the next run a quarter of
 * an hour later. The cap exists so a backlog (after an outage, say)
 * drains gradually instead of becoming exactly the synchronised burst
 * the stagger is meant to prevent.
 */
const MAX_CONNECTIONS_PER_RUN = 25;

/**
 * Pause between connections inside one run. Yapily's ceiling is 30
 * requests/second; a single connection can issue several calls
 * (accounts + paged transactions), so this keeps even a full 25-row
 * run comfortably beneath it without eating meaningful wall-clock time
 * against maxDuration.
 */
const INTER_CONNECTION_DELAY_MS = 400;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  consent_token: string | null;
  consent_expires_at: string | null;
  /** Stagger bookkeeping — see src/lib/yapily/sync-scheduler.ts. */
  sync_offset_minutes: number | null;
  next_sync_at: string | null;
  sync_claimed_at: string | null;
  /** Yapily's underlying consent identifier. Needed so a 401/403 can be
   *  verified via GET /consents/{id} instead of guessed from the error
   *  message (build review step 6). Null on legacy pre-hosted-pages rows. */
  yapily_consent_id: string | null;
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
 * Tiered bank sync cron.
 *
 * Schedule (vercel.json): every 15 minutes. That is NOT how often any
 * one connection is refreshed — it is how often we check what is due.
 * Each connection refreshes once per SYNC_INTERVAL_MINUTES (4 hours) on
 * its own offset, so the work is spread across the day instead of
 * arriving as a burst on the hour. See src/lib/yapily/sync-scheduler.ts
 * for why, and for the Yapily constraints that forced it.
 *
 * (The previous comment here claimed "runs daily at 3am" long after the
 * schedule had become 5x daily. If you change the cadence, change this.)
 *
 * Tier behaviour:
 *   Every paid tier — synced every day (fetches last 90 days of transactions)
 *   Free           — synced only on Mondays (fetches last 90 days)
 *
 * Processing order follows PLAN_LIMITS[tier].disputeQueuePriority
 * (lower runs first): Dispute Pro, then Pro/Household, then Essential,
 * then Free. This ensures paying users are never deprioritised behind
 * free users when the daily API ceiling starts biting mid-run.
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

  // Determine which tiers to sync today.
  // Every PAID tier: every day. Free: Mondays only.
  //
  // Built from PAID_PLAN_TIERS rather than a hardcoded ['pro','essential']
  // list. The old literal meant a tier added above Pro (household,
  // dispute_pro) matched no row in the `.in()` filter below and therefore
  // got ZERO bank syncs — the most expensive plans silently receiving less
  // than Free. Any future tier is picked up automatically.
  const tiersToSync: string[] = isMonday
    ? [...PAID_PLAN_TIERS, 'free']
    : [...PAID_PLAN_TIERS];

  // Fetch all users by tier, maintaining processing order (Pro first)
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier')
    .in('subscription_tier', tiersToSync);

  if (!allProfiles || allProfiles.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, reason: 'No eligible users' });
  }

  // Sort: dispute_pro → pro/household → essential → free.
  //
  // `disputeQueuePriority` is the canonical lower-runs-first ordering in
  // PLAN_LIMITS, so it drops straight into a numeric ascending sort. The
  // previous inline map hardcoded pro=0 and gave anything unrecognised a
  // rank of 3 — i.e. a dispute_pro user would have been sorted BEHIND free
  // users when the API ceiling starts biting mid-run. An unknown tier now
  // falls back to the Free priority rather than a magic number, so it can
  // never rank worse than the lowest real tier.
  const queuePriority = (tier: string | null | undefined): number =>
    PLAN_LIMITS[tier as PlanTier]?.disputeQueuePriority ?? PLAN_LIMITS.free.disputeQueuePriority;

  const sortedProfiles = [...allProfiles].sort(
    (a, b) => queuePriority(a.subscription_tier) - queuePriority(b.subscription_tier)
  );

  const orderedUserIds = sortedProfiles.map((p) => p.id);

  // ── Fetch connections that are DUE, not every connection ──
  //
  // This is the heart of the staggering change (Migle, 20 Aug 2026).
  // Previously this selected every active connection and the loop below
  // walked all of them back to back, so all users and all of a single
  // user's banks hit Yapily inside the same few seconds — bursting
  // against the 30 req/sec ceiling, and worse, issuing concurrent calls
  // on the same consent token, which produces spurious 400s and can
  // trip consent expiry.
  //
  // Now each connection carries its own next_sync_at (offset by
  // sync_offset_minutes within the 4-hour cycle) and we only pick up
  // what is actually due. next_sync_at IS NULL is included so a
  // connection created before this migration, or one whose offset has
  // not been assigned yet, still gets synced and then scheduled.
  //
  // Also include 'token_expired' connections — we attempt a token
  // refresh and reset to active on success.
  const dueCutoff = new Date().toISOString();
  const { data: connections, error: connError } = await supabase
    .from('bank_connections')
    .select('*')
    .in('status', ['active', 'token_expired'])
    .eq('provider', 'yapily')
    .is('archived_at', null)
    .is('deleted_at', null)
    .or(`next_sync_at.is.null,next_sync_at.lte.${dueCutoff}`)
    .in('user_id', orderedUserIds.length > 0 ? orderedUserIds : ['00000000-0000-0000-0000-000000000000'])
    .order('next_sync_at', { ascending: true, nullsFirst: true })
    .limit(MAX_CONNECTIONS_PER_RUN);

  if (connError || !connections || connections.length === 0) {
    return NextResponse.json({
      ok: true,
      synced: 0,
      reason: connError
        ? `Connection fetch failed: ${connError.message}`
        : 'No bank connections due for sync',
    });
  }

  // Sort connections to match tier order
  const userTierMap = new Map(sortedProfiles.map((p) => [p.id, p.subscription_tier]));
  const sortedConnections = [...connections].sort((a, b) => {
    // Same canonical priority as the profile sort above — keep the two in
    // step or the connection loop undoes the profile ordering.
    const tierA = queuePriority(userTierMap.get(a.user_id));
    const tierB = queuePriority(userTierMap.get(b.user_id));
    return tierA - tierB;
  });

  // (The fixed 90-day lookback that used to live here is gone. The
  //  window is now resolved per account from the newest stored
  //  transaction — see resolveTransactionWindow. The old comment
  //  promised "individual connections may use a later floor (see
  //  below)"; no such floor was ever implemented, so every run pulled
  //  the full 90 days and discarded ~99% at the dedup layer.)

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
  let skippedAlreadyClaimed = 0;
  let connectionsStarted = 0;

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

    // ── Claim the connection ──────────────────────────────────────
    //
    // The scheduler makes a collision unlikely, but "unlikely" is not
    // "impossible": a manual /api/bank/sync-now, a retried cron
    // invocation, or two overlapping runs after a slow function can all
    // reach the same row. Two concurrent calls carrying the SAME consent
    // token is precisely the pattern Migle flagged as producing 400s and
    // tripping consent expiry, so it is worth a guard rather than a
    // comment saying it shouldn't happen.
    //
    // The UPDATE ... WHERE claim-is-empty-or-stale is the lock: only one
    // caller's update can match, and `.select()` tells us whether we
    // were that caller. A claim older than SYNC_CLAIM_STALE_MINUTES is
    // treated as abandoned so a timed-out function can't pin a
    // connection permanently.
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await supabase
      .from('bank_connections')
      .update({ sync_claimed_at: claimedAt })
      .eq('id', connection.id)
      .or(`sync_claimed_at.is.null,sync_claimed_at.lt.${staleClaimCutoff()}`)
      .select('id');

    if (!claimed || claimed.length === 0) {
      skippedAlreadyClaimed++;
      console.log(
        `[bank-sync] conn=${connection.id} already claimed by another run — skipping this cycle`,
      );
      continue;
    }

    // Space calls out within the run as well as across the day. Skipped
    // for the first connection so a single due connection syncs promptly.
    if (connectionsStarted > 0) await sleep(INTER_CONNECTION_DELAY_MS);
    connectionsStarted++;

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

        // ── GET /accounts, at most once per connection ───────────────
        //
        // This used to be two independent calls in the same iteration:
        // one to backfill bank_name, one to backfill the account hashes.
        // Their guards both trip for the same connection state, so the
        // common backfill case fired two identical GET /accounts calls
        // back to back on the same consent token — the exact pattern
        // Migle warned produces race conditions and can prematurely
        // expire a consent.
        //
        // Memoised: whichever backfill needs it first pays for the call,
        // the second reuses the result. Migle's guidance is "account IDs
        // cached and reused", and account_ids on the row IS that cache —
        // so on a healthy connection we now make zero /accounts calls.
        let _accountsPromise: ReturnType<typeof getAccounts> | null = null;
        const loadAccounts = () => {
          if (!_accountsPromise) {
            connectionApiCalls++;
            _accountsPromise = getAccounts(consentToken);
          }
          return _accountsPromise;
        };

        // Backfill bank name if missing
        let accountIds = connection.account_ids || [];

        if (accountIds.length === 0 || !connection.bank_name) {
          try {
            const accounts = await loadAccounts();
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
            // Reuses the response above when the bank-name backfill
            // already fetched it — see loadAccounts().
            const accounts = await loadAccounts();
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

        let accountsPolled = 0;

        for (let i = 0; i < accountIds.length; i++) {
          const accountId = accountIds[i];
          const accountHash = storedHashes[i] || null;
          if (!accountHash) {
            console.warn(`Bank sync: connection ${connection.id} account ${accountId} has no stored hash — skipping`);
            continue;
          }

          // ── Space calls on the SAME consent token ────────────────
          //
          // Migle: "Data endpoints are not polled multiple times for
          // the same consent without a delay between calls … can cause
          // race conditions, unexpected errors, or premature consent
          // expiry." Skipped before the first account so a
          // single-account connection is not slowed down for nothing.
          if (accountsPolled > 0) await yapilySleep(PER_CONSENT_CALL_DELAY_MS);
          accountsPolled++;

          // ── Incremental window ──────────────────────────────────
          //
          // Per account, not per connection: two accounts on one bank
          // can have very different activity, and a dormant savings
          // account shouldn't drag a busy current account back to a
          // full 90-day pull. See src/lib/yapily/sync-window.ts.
          const window = await resolveTransactionWindow(supabase, {
            userId: connection.user_id,
            accountId,
          });
          const fromDate = window.from;
          const toDate = window.before;
          // bank_sync_log records the window actually used, so the log
          // row shows whether a thin result was a thin window or a real
          // problem.
          syncFromDate = fromDate;
          syncToDate = toDate;

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
            // Build review step 6: on 401/403 ask Yapily what state the
            // consent is actually in (GET /consents/{id}) rather than
            // pattern-matching the error text. triageConsentFailure also
            // extends a renewable consent in place, so a bank that only
            // needs re-authorisation self-heals instead of counting
            // toward the disconnect threshold.
            const verdict = await triageConsentFailure(
              err,
              connection.yapily_consent_id,
              `[bank-sync] conn=${connection.id}`,
            );
            if (verdict === 'fatal') {
              // True consent/token expiry — flag so we flip status='expired'
              // after the loop and bail without hammering Yapily for the
              // remaining accounts on this same dead consent.
              consentExpiryDetected = true;
              console.error(`Bank sync: consent expiry on ${errorMsg}`);
              accountErrors.push(errorMsg);
              break;
            }
            if (verdict === 'recovered') {
              // Consent was extended just now. Don't record a failure —
              // the next scheduled run picks this account up cleanly.
              console.log(`Bank sync: consent extended mid-run for ${errorMsg} — will retry next run`);
              accountErrors.push(`${errorMsg} (consent extended, retry next run)`);
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
    } finally {
      // ── Release the claim and schedule the next run ──────────────
      //
      // In `finally` deliberately: the body above exits via `continue`
      // on several paths (no consent token, expired consent, consent
      // failure threshold) as well as via the catch. If any of those
      // left sync_claimed_at set, the connection would be skipped by
      // every subsequent run until the stale cutoff — a slow leak that
      // would look like "some users just stopped syncing".
      //
      // next_sync_at advances even on failure. A connection that is
      // failing should retry on its normal cadence, not spin: without
      // this, a permanently broken connection would stay `lte(now)`
      // forever and consume a slot in every single run.
      const offset =
        connection.sync_offset_minutes ??
        assignSyncOffsetMinutes(connection.user_id, 0);

      await supabase
        .from('bank_connections')
        .update({
          sync_claimed_at: null,
          sync_offset_minutes: offset,
          next_sync_at: computeNextSyncAt(offset).toISOString(),
        })
        .eq('id', connection.id);
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
    `Bank sync complete: due=${sortedConnections.length} connections=${results.length} ` +
    `skippedClaimed=${skippedAlreadyClaimed} txs=${totalTxs} ` +
    `recurring=${totalRecurring} errors=${errors} api_calls=${totalApiCalls} ` +
    `monday=${isMonday} tiers_synced=${tiersToSync.join(',')}`
  );

  return NextResponse.json({
    ok: true,
    is_monday: isMonday,
    tiers_synced: tiersToSync,
    connections_due: sortedConnections.length,
    connections_processed: results.length,
    skipped_already_claimed: skippedAlreadyClaimed,
    sync_interval_minutes: SYNC_INTERVAL_MINUTES,
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
