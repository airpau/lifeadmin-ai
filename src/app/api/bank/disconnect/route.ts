/**
 * POST /api/bank/disconnect
 *
 * Body: { connectionId?: string, removeTransactions?: boolean }
 *
 * Two outcomes depending on `removeTransactions`:
 *
 *  1. Default (false / omitted) — flips bank_connections.status to
 *     'revoked'. Transactions stay in the DB so the user keeps their
 *     historical spending charts; Money Hub already filters revoked
 *     connections out of "active" reads.
 *
 *  2. `removeTransactions: true` — also wipes the user's transaction
 *     history for that connection. Use this when the user wants the
 *     account fully purged (e.g. wrong account connected, sandbox
 *     test data, privacy concerns). Money Hub aggregates, dashboard
 *     KPIs and the price-detector all stop seeing those transactions
 *     immediately because they query bank_transactions live.
 *
 * Subscriptions detected from the removed transactions are NOT
 * deleted — users may want to keep tracking the recurring payment
 * even after disconnecting the source bank. They can dismiss them
 * individually if not wanted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const connectionId = body.connectionId as string | undefined;
  const removeTransactions = body.removeTransactions === true;

  // 1. Flip the connection status (always)
  let query = supabase
    .from('bank_connections')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .in('status', ['active', 'expired', 'token_expired', 'expired_legacy', 'expiring_soon']);
  if (connectionId) query = query.eq('id', connectionId);
  const { error: disconnectErr } = await query;
  if (disconnectErr) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  // 2. Optional cascade: wipe transaction history for the connection
  let transactionsRemoved = 0;
  if (removeTransactions) {
    if (!connectionId) {
      return NextResponse.json(
        { ok: true, transactionsRemoved: 0, warning: 'removeTransactions ignored — connectionId not provided; cleanup needs an explicit connection to scope to.' },
      );
    }
    const { count, error: txErr } = await supabase
      .from('bank_transactions')
      .delete({ count: 'exact' })
      .eq('user_id', user.id)
      .eq('connection_id', connectionId);
    if (txErr) {
      // Non-fatal — the connection is already disconnected. Surface in
      // the response so the UI can warn the user but not block the
      // disconnect itself.
      console.error('[bank.disconnect] transaction cleanup failed:', txErr.message);
      return NextResponse.json({
        ok: true,
        transactionsRemoved: 0,
        cleanupError: txErr.message,
      });
    }
    transactionsRemoved = count ?? 0;
  }

  return NextResponse.json({ ok: true, transactionsRemoved });
}
