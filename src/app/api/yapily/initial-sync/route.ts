import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAllTransactions } from '@/lib/yapily';
import { detectRecurring } from '@/lib/detect-recurring';
import { triggerSheetsExport } from '@/lib/trigger-sheets-export';
import { upsertYapilyTransactions, type AccountSnapshot } from '@/lib/yapily/connection-store';

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
 * Background endpoint triggered by the OAuth callback. Pulls 12 months
 * of transaction history per account and writes them via the dedup-
 * aware store, which keys on (user, account_identifications_hash,
 * stable_tx_hash). Re-running this endpoint against the same consent
 * is a no-op for transactions we already have — the partial unique
 * index makes duplicates physically impossible.
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

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toDate = tomorrow.toISOString();

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

  // PASS 1 — last 90 days for every account. Sequential per
  // Migle's "wait for response before next request" rule.
  for (const account of accountSnapshots) {
    try {
      const transactions = await getAllTransactions(
        account.yapilyAccountId,
        consentToken,
        { from: ninetyDaysAgoIso, before: toDate },
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
  for (const account of accountSnapshots) {
    if (Date.now() - startedAt > HISTORICAL_BUDGET_MS) {
      historicalSkipped++;
      console.warn(
        `[yapily.initial-sync] pass2 budget exhausted — skipping older history for account=${account.yapilyAccountId}`,
      );
      continue;
    }
    try {
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

  // Run the existing post-sync enrichment chain. These are RPCs that
  // categorise + detect recurring patterns; they're idempotent so
  // running them after every sync is safe.
  try {
    await detectRecurring(userId, supabase);
  } catch (err) {
    console.error('[yapily.initial-sync] detectRecurring failed:', err);
  }

  const postSyncFunctions = [
    'fix_ee_card_merchant_names',
    'auto_categorise_transactions',
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
