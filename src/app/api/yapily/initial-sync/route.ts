import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAllTransactions, yapilySleep, PER_CONSENT_CALL_DELAY_MS } from '@/lib/yapily';
import { detectRecurring } from '@/lib/detect-recurring';
import { triggerSheetsExport } from '@/lib/trigger-sheets-export';
import { upsertYapilyTransactions, type AccountSnapshot } from '@/lib/yapily/connection-store';
import {
  needsOlderHistory,
  resolveInitialSyncPlan,
  type InitialSyncPlan,
} from '@/lib/yapily/sync-window';
import { staleClaimCutoff } from '@/lib/yapily/sync-scheduler';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for full 12-month sync

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/yapily/initial-sync
 *
 * Background endpoint triggered by the OAuth callback. For an account
 * we hold nothing for it pulls 12 months of history; for an account we
 * already hold (a reconnect) it pulls only what is new since the last
 * stored transaction. Rows are written via the dedup-aware store, which
 * keys on (user, account_identifications_hash, stable_tx_hash), so
 * re-seeing a transaction is a no-op.
 *
 * Only ONE sync may touch a consent at a time. This route claims the
 * connection (sync_claimed_at) before its first Yapily call and releases
 * it when done, exactly as cron/bank-sync and bank/sync-now do. A second
 * trigger for the same connection returns immediately instead of running
 * a duplicate set of calls in parallel on a brand new consent.
 *
 * Body: { connectionId, userId, consentToken, accountSnapshots }
 *
 * Note on accountSnapshots: the callback computes them once and passes
 * them in here, rather than us re-fetching /accounts. This guarantees
 * the hashes the sync writes match what the callback stored on
 * bank_connections, and saves a Yapily round-trip.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const connectionId: string | undefined = body?.connectionId;
  const userId: string | undefined = body?.userId;
  const consentToken: string | undefined = body?.consentToken;
  const accountSnapshots: AccountSnapshot[] | undefined = body?.accountSnapshots;

  if (!connectionId || !userId || !consentToken || !Array.isArray(accountSnapshots)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getAdmin();

  // ── One sync per consent at a time ───────────────────────────────
  //
  // bank_sync_log shows this route running TWICE for the same connect,
  // seconds apart, on 15 Aug, 26 Aug, 17 Sep, 24 Sep and 1 Oct 2026:
  // the callback was hit twice and each hit fired its own background
  // sync. Two full syncs then ran in parallel on a consent that was
  // seconds old, which is precisely the pattern Yapily told us "can
  // cause race conditions, unexpected errors, or premature consent
  // expiry".
  //
  // Same claim the cron and the Sync button use, so it also keeps a
  // scheduled run from starting on this consent while we are mid-sync.
  // A claim older than SYNC_CLAIM_STALE_MINUTES is treated as abandoned,
  // and this route's maxDuration is well inside that.
  const { data: claimed, error: claimErr } = await supabase
    .from('bank_connections')
    .update({ sync_claimed_at: new Date().toISOString() })
    .eq('id', connectionId)
    .or(`sync_claimed_at.is.null,sync_claimed_at.lt.${staleClaimCutoff()}`)
    .select('id');

  if (claimErr) {
    // Fail open: a bookkeeping error must not cost a new user their
    // first sync. Worst case is the old behaviour.
    console.error(
      `[yapily.initial-sync] claim failed for connection=${connectionId}, proceeding without it:`,
      claimErr.message,
    );
  } else if (!claimed || claimed.length === 0) {
    console.warn(
      `[yapily.initial-sync] connection=${connectionId} is already being synced, skipping this duplicate trigger`,
    );
    return NextResponse.json({ ok: true, skipped: 'already_syncing' });
  }
  const holdsClaim = !claimErr;

  try {
    return await runInitialSync({
      supabase,
      connectionId,
      userId,
      consentToken,
      accountSnapshots,
    });
  } finally {
    if (holdsClaim) {
      const { error: releaseErr } = await supabase
        .from('bank_connections')
        .update({ sync_claimed_at: null })
        .eq('id', connectionId);
      if (releaseErr) {
        // Not fatal: the claim goes stale on its own. Worth knowing
        // about, because until it does the cron skips this connection.
        console.error(
          `[yapily.initial-sync] failed to release claim on connection=${connectionId}:`,
          releaseErr.message,
        );
      }
    }
  }
}

async function runInitialSync(args: {
  supabase: ReturnType<typeof getAdmin>;
  connectionId: string;
  userId: string;
  consentToken: string;
  accountSnapshots: AccountSnapshot[];
}): Promise<NextResponse> {
  const { supabase, connectionId, userId, consentToken, accountSnapshots } = args;

  // Yapily's 5-minute deadline (Migle, 29 Apr): if historical
  // transactions older than 90 days aren't pulled within 5 minutes
  // of consent grant, some banks return 403 and force a fresh
  // consent. Our maxDuration matches that ceiling, but a multi-
  // account bank with 12 months of paginated data can easily
  // overflow.
  //
  // Two-pass strategy:
  //   PASS 1 — last 90 days for every account first. Always within
  //   the 5-min window, always succeeds, gives the user the bulk
  //   of useful data immediately.
  //
  //   PASS 2 — 91-365 days for each account. Best-effort, gated
  //   by elapsed time. Stops at 4m30s (270s) so we exit cleanly
  //   before the function's 5-min ceiling AND before Yapily's
  //   server-side deadline. Accounts that didn't get older history
  //   are logged loudly so we can backfill via consent renewal or
  //   a follow-up sync.
  const HISTORICAL_BUDGET_MS = 270 * 1000; // 4m30s — safety margin under Yapily's 5min
  const startedAt = Date.now();

  // ── What does each account actually need? ────────────────────────
  //
  // Decided up front, from what we already store, BEFORE pass 1 writes
  // anything. An account we hold nothing for gets the full treatment
  // (90 days, then the older history while the bank still allows it).
  // An account we already hold gets one incremental request, the same
  // one the scheduled sync would make. See planInitialSync.
  const plans = new Map<string, InitialSyncPlan>();
  for (const account of accountSnapshots) {
    plans.set(
      account.yapilyAccountId,
      await resolveInitialSyncPlan(supabase, { userId, accountId: account.yapilyAccountId }),
    );
  }
  const allPlans = Array.from(plans.values());
  const wantsOlderHistory = (accountId: string) =>
    needsOlderHistory(plans.get(accountId)!, allPlans);
  const backfillCount = accountSnapshots.filter((a) => wantsOlderHistory(a.yapilyAccountId)).length;
  console.log(
    `[yapily.initial-sync] connection=${connectionId} accounts=${accountSnapshots.length} ` +
      `older_history_for=${backfillCount} recent_only_for=${accountSnapshots.length - backfillCount}`,
  );

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoIso = ninetyDaysAgo.toISOString();

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const twelveMonthsAgoIso = twelveMonthsAgo.toISOString();

  let totalInserted = 0;
  let totalDuplicateSkipped = 0;
  let totalNoHashSkipped = 0;
  let apiCallsMade = 0;
  let historicalSkipped = 0;

  const perAccountErrors: Array<{ accountId: string; pass: 1 | 2; error: string; status?: number }> = [];

  // ── Spacing on the consent ───────────────────────────────────────
  //
  // Sequential is only HALF of Migle's rule. The full guidance, quoted
  // in cron/bank-sync: "Data endpoints are not polled multiple times
  // for the same consent without a delay between calls … can cause
  // race conditions, unexpected errors, or premature consent expiry."
  // The cron honours both halves via PER_CONSENT_CALL_DELAY_MS; this
  // path honoured only the first, and fired every account in pass 1
  // and again in pass 2 back to back on a BRAND NEW consent.
  //
  // That is the worst possible moment to hammer one: 2026-08-21 and
  // 2026-08-23 both saw an HSBC Business consent complete its initial
  // sync (9 rapid calls) and then 403 with "not authorised … we didn't
  // manage to fix this by refreshing the authorization credential" on
  // every subsequent cron run, permanently. NatWest, on the same code,
  // is unaffected — this is an institution-tolerance problem, and HSBC
  // is not tolerant.
  //
  // Budget: at most 2 passes x accounts calls. Four accounts costs
  // 7 x 5s = 35s of sleeping inside a 300s maxDuration with a 270s
  // historical budget, so the spacing is comfortably affordable.
  let consentCallsMade = 0;
  const spaceConsentCall = async () => {
    if (consentCallsMade > 0) await yapilySleep(PER_CONSENT_CALL_DELAY_MS);
    consentCallsMade++;
  };

  // PASS 1: the recent window for every account. Sequential AND spaced.
  // 90 days for a new account, incremental for one we already hold.
  for (const account of accountSnapshots) {
    const plan = plans.get(account.yapilyAccountId)!;
    try {
      await spaceConsentCall();
      const transactions = await getAllTransactions(
        account.yapilyAccountId,
        consentToken,
        { from: plan.window.from, before: plan.window.before },
      );
      apiCallsMade += Math.max(1, Math.ceil(transactions.length / 1000));
      if (transactions.length === 0) continue;

      const result = await upsertYapilyTransactions({
        userId,
        connectionId,
        account,
        transactions,
      });
      totalInserted += result.inserted;
      totalDuplicateSkipped += result.skippedAsDuplicate;
      totalNoHashSkipped += result.skippedNoHash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status?: number }).status) : undefined;
      console.error(`[yapily.initial-sync] pass1 account ${account.yapilyAccountId} failed status=${status}: ${msg}`);
      perAccountErrors.push({ accountId: account.yapilyAccountId, pass: 1, error: msg, status });
    }
  }

  // PASS 2 — older history (-91d to -365d). Time-budget gated so
  // we never blow Yapily's 5-min historical window. The day-90
  // boundary is exclusive on the older side (bank's day -90 is
  // already in pass 1) and inclusive on the older side at -365.
  //
  // Only where there is something to fetch: a new account, or a
  // connection that was down for longer than pass 1 reaches back (see
  // needsOlderHistory). An account we already hold history for is not
  // asked again. The request is the heaviest one this route makes, it
  // lands on a consent that is minutes old, and everything it returns
  // is thrown away by the dedup layer.
  for (const account of accountSnapshots) {
    if (!wantsOlderHistory(account.yapilyAccountId)) continue;
    if (Date.now() - startedAt + PER_CONSENT_CALL_DELAY_MS > HISTORICAL_BUDGET_MS) {
      historicalSkipped++;
      console.warn(
        `[yapily.initial-sync] pass2 budget exhausted — skipping older history for account=${account.yapilyAccountId}`,
      );
      continue;
    }
    try {
      await spaceConsentCall();
      const transactions = await getAllTransactions(
        account.yapilyAccountId,
        consentToken,
        { from: twelveMonthsAgoIso, before: ninetyDaysAgoIso },
      );
      apiCallsMade += Math.max(1, Math.ceil(transactions.length / 1000));
      if (transactions.length === 0) continue;

      const result = await upsertYapilyTransactions({
        userId,
        connectionId,
        account,
        transactions,
      });
      totalInserted += result.inserted;
      totalDuplicateSkipped += result.skippedAsDuplicate;
      totalNoHashSkipped += result.skippedNoHash;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status?: number }).status) : undefined;
      console.error(`[yapily.initial-sync] pass2 account ${account.yapilyAccountId} failed status=${status}: ${msg}`);
      perAccountErrors.push({ accountId: account.yapilyAccountId, pass: 2, error: msg, status });
    }
  }

  // ── Post-sync enrichment. ORDER IS LOAD-BEARING. ─────────────────
  //
  // detectRecurring used to run FIRST, before any of the RPCs below.
  // That was wrong in a way that only hurt brand new users, on the
  // single most important sync they ever run.
  //
  // detectRecurring decides what to exclude by reading `category`,
  // `user_category` and `transfer_pair_id` on each transaction. On a
  // first sync all three are still NULL, because the RPCs that
  // populate them had not run yet. So isExcludedTransactionCategory
  // returned false for everything, and internal transfers, ATM
  // withdrawals, fees and credit-card settlement payments were all
  // eligible to be filed as subscriptions.
  //
  // That would be recoverable if the user could just dismiss them. They
  // cannot: dismissal writes a permanent tombstone, and detectRecurring
  // treats a dismissed row as a block on ever re-detecting that
  // merchant. So one bad first sync poisoned a user's subscription list
  // for good.
  //
  // The chain now matches cron/bank-sync exactly: deduplicate, fix
  // merchant names, categorise, mark internal transfers, flag recurring
  // rows, and only THEN detect subscriptions from properly labelled
  // data. deduplicate_bank_transactions and mark_internal_transfers
  // were missing here entirely, so transfer_pair_id stayed NULL until
  // the next 15-minute cron regardless.
  const postSyncFunctions = [
    'deduplicate_bank_transactions',
    'fix_ee_card_merchant_names',
    'auto_categorise_transactions',
    'mark_internal_transfers',
    'detect_and_sync_recurring_transactions',
  ] as const;
  for (const fn of postSyncFunctions) {
    try {
      const { error } = await supabase.rpc(fn, { p_user_id: userId });
      if (error) console.error(`[yapily.initial-sync] ${fn} error:`, error.message);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown';
      console.error(`[yapily.initial-sync] ${fn} threw:`, msg);
    }
  }

  // Subscriptions last, from categorised, transfer-aware data.
  try {
    await detectRecurring(userId, supabase);
  } catch (err) {
    console.error('[yapily.initial-sync] detectRecurring failed:', err);
  }

  // Update connection sync timestamp
  const now = new Date().toISOString();
  await supabase
    .from('bank_connections')
    .update({ last_synced_at: now, updated_at: now })
    .eq('id', connectionId);

  // Log sync — status reflects what actually happened. If we had
  // accounts to sync but every API call threw, this is a failure, not
  // a success.
  const overallStatus =
    accountSnapshots.length > 0 && apiCallsMade === 0 ? 'failed'
    : perAccountErrors.length > 0 && totalInserted === 0 ? 'failed'
    : perAccountErrors.length > 0 ? 'partial'
    : 'success';
  await supabase.from('bank_sync_log').insert({
    user_id: userId,
    connection_id: connectionId,
    trigger_type: 'initial',
    status: overallStatus,
    api_calls_made: apiCallsMade,
  });
  if (overallStatus !== 'success') {
    console.warn(`[yapily.initial-sync] connection=${connectionId} status=${overallStatus} errors=${JSON.stringify(perAccountErrors)}`);
  }

  console.log(
    `[yapily.initial-sync] complete: inserted=${totalInserted}, dup_skipped=${totalDuplicateSkipped}, ` +
    `no_hash_skipped=${totalNoHashSkipped}, accounts=${accountSnapshots.length}, api_calls=${apiCallsMade}, ` +
    `historical_skipped=${historicalSkipped}, elapsed_ms=${Date.now() - startedAt}`,
  );

  // Push newly-synced transactions to the user's connected Google Sheet (if any).
  await triggerSheetsExport(supabase, userId);

  return NextResponse.json({
    ok: true,
    inserted: totalInserted,
    duplicatesSkipped: totalDuplicateSkipped,
    noHashSkipped: totalNoHashSkipped,
    apiCalls: apiCallsMade,
    historicalSkipped,
    elapsedMs: Date.now() - startedAt,
  });
}
