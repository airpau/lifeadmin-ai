import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getTransactions } from '@/lib/yapily';
import { detectRecurring } from '@/lib/detect-recurring';

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
 * Background endpoint triggered by the callback route.
 * Syncs 12 months of transactions without blocking the user redirect.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { connectionId, userId, consentToken, accountIds } = await request.json();

  if (!connectionId || !userId || !consentToken || !accountIds) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getAdmin();

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const fromDate = twelveMonthsAgo.toISOString();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const toDate = tomorrow.toISOString();

  let totalSynced = 0;
  let apiCallsMade = 0;

  for (const accountId of accountIds) {
    try {
      const transactions = await getTransactions(accountId, consentToken, fromDate, toDate);
      apiCallsMade++;

      if (transactions.length === 0) continue;

      const rows = transactions.map((tx) => ({
        user_id: userId,
        connection_id: connectionId,
        transaction_id: tx.id,
        account_id: accountId,
        amount: tx.transactionAmount?.amount ?? tx.amount,
        currency: tx.transactionAmount?.currency ?? tx.currency ?? 'GBP',
        description:
          tx.description ||
          tx.transactionInformation?.join(' ') ||
          tx.reference ||
          null,
        merchant_name: tx.merchantName || null,
        category: null,
        timestamp: tx.bookingDateTime || tx.date,
      }));

      // Upsert in batches of 500 to avoid payload limits
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500);
        const { error } = await supabase
          .from('bank_transactions')
          .upsert(batch, {
            onConflict: 'user_id,transaction_id',
            ignoreDuplicates: true,
          });

        if (error) {
          console.error('Error upserting Yapily transactions batch:', error);
        } else {
          totalSynced += batch.length;
        }
      }
    } catch (err) {
      console.error(`Error syncing Yapily account ${accountId}:`, err);
    }
  }

  // Detect recurring payments
  try {
    await detectRecurring(userId, supabase);
  } catch (err) {
    console.error('detectRecurring failed:', err);
  }

  // Run post-sync functions
  try {
    await supabase.rpc('auto_categorise_transactions', { p_user_id: userId });
  } catch { /* non-fatal */ }

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

  console.log(`Yapily initial sync complete: ${totalSynced} transactions across ${accountIds.length} accounts`);

  return NextResponse.json({ ok: true, synced: totalSynced, apiCalls: apiCallsMade });
}
