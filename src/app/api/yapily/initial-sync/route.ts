import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTransactions } from '@/lib/yapily';
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

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const fromDate = twelveMonthsAgo.toISOString().split('T')[0];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toDate = tomorrow.toISOString().split('T')[0];

  let totalInserted = 0;
  let totalDuplicateSkipped = 0;
  let totalNoHashSkipped = 0;
  let apiCallsMade = 0;

  for (const account of accountSnapshots) {
    try {
      const transactions = await getTransactions(account.yapilyAccountId, consentToken, fromDate, toDate);
      apiCallsMade++;
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
      console.error(`[yapily.initial-sync] account ${account.yapilyAccountId} failed:`, err);
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

  // Log sync
  await supabase.from('bank_sync_log').insert({
    user_id: userId,
    connection_id: connectionId,
    trigger_type: 'initial',
    status: 'success',
    api_calls_made: apiCallsMade,
  });

  console.log(
    `[yapily.initial-sync] complete: inserted=${totalInserted}, dup_skipped=${totalDuplicateSkipped}, ` +
    `no_hash_skipped=${totalNoHashSkipped}, accounts=${accountSnapshots.length}, api_calls=${apiCallsMade}`,
  );

  // Push newly-synced transactions to the user's connected Google Sheet (if any).
  await triggerSheetsExport(supabase, userId);

  return NextResponse.json({
    ok: true,
    inserted: totalInserted,
    duplicatesSkipped: totalDuplicateSkipped,
    noHashSkipped: totalNoHashSkipped,
    apiCalls: apiCallsMade,
  });
}
