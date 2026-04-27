/**
 * POST /api/bank/disconnect
 *
 * Body: { connectionId?: string; mode?: 'keep_history' | 'delete_transactions' | 'erase_all'; reason?: string }
 *
 * Three modes for handling the user's transaction history when they
 * remove a bank:
 *
 *   keep_history (default)
 *     Just revokes the consent. Transactions stay visible in the Money
 *     Hub forever — useful when the user closed the card but wants the
 *     spending history retained for analysis.
 *
 *   delete_transactions
 *     Revokes consent AND sets deleted_at on every transaction tied to
 *     the connection. The 30-day purge cron later removes them
 *     permanently. Until then, the user can restore via
 *     /api/bank/restore. Useful when switching banks and not caring
 *     about the old data.
 *
 *   erase_all
 *     Revokes consent, hard-deletes every transaction tied to the
 *     connection, hard-deletes the connection row, audit-logged
 *     irrevocably. Used for GDPR right-to-erasure requests. Cannot
 *     be undone.
 *
 * All three modes write to bank_disconnect_audit with the row count so
 * we have a paper trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

type DisconnectMode = 'keep_history' | 'delete_transactions' | 'erase_all';

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const connectionId: string | undefined = body?.connectionId;
  const mode: DisconnectMode = body?.mode === 'delete_transactions'
    ? 'delete_transactions'
    : body?.mode === 'erase_all'
      ? 'erase_all'
      : 'keep_history';

  if (!connectionId) {
    // Legacy "revoke everything" path for callers that don't pass an id.
    // Stays at keep_history semantics for backwards compatibility.
    const { error } = await supabase
      .from('bank_connections')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .in('status', ['active', 'expired', 'token_expired', 'expired_legacy', 'expiring_soon']);
    if (error) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    return NextResponse.json({ ok: true, mode: 'keep_history' });
  }

  // Look up the connection so we can record bank_name/provider in the
  // audit row (especially important for erase_all where we then delete
  // the row).
  const admin = getAdmin();
  const { data: conn, error: connErr } = await admin
    .from('bank_connections')
    .select('id, user_id, bank_name, provider, status')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (connErr || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  let transactionsAffected = 0;

  if (mode === 'delete_transactions' || mode === 'erase_all') {
    const { count } = await admin
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('connection_id', connectionId)
      .is('deleted_at', null);
    transactionsAffected = count ?? 0;
  }

  if (mode === 'erase_all') {
    // Hard delete: transactions first (FK), then the connection row.
    const { error: txErr } = await admin
      .from('bank_transactions')
      .delete()
      .eq('user_id', user.id)
      .eq('connection_id', connectionId);
    if (txErr) {
      return NextResponse.json({ error: `Erase failed at transactions: ${txErr.message}` }, { status: 500 });
    }
    const { error: connDelErr } = await admin
      .from('bank_connections')
      .delete()
      .eq('id', connectionId)
      .eq('user_id', user.id);
    if (connDelErr) {
      return NextResponse.json({ error: `Erase failed at connection: ${connDelErr.message}` }, { status: 500 });
    }
  } else if (mode === 'delete_transactions') {
    const now = new Date().toISOString();
    const { error: txErr } = await admin
      .from('bank_transactions')
      .update({ deleted_at: now })
      .eq('user_id', user.id)
      .eq('connection_id', connectionId)
      .is('deleted_at', null);
    if (txErr) {
      return NextResponse.json({ error: `Soft-delete failed: ${txErr.message}` }, { status: 500 });
    }
    const { error: connErr2 } = await admin
      .from('bank_connections')
      .update({ status: 'revoked', updated_at: now })
      .eq('id', connectionId)
      .eq('user_id', user.id);
    if (connErr2) {
      return NextResponse.json({ error: `Revoke failed: ${connErr2.message}` }, { status: 500 });
    }
  } else {
    // keep_history: just revoke
    const { error: connErr2 } = await admin
      .from('bank_connections')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', connectionId)
      .eq('user_id', user.id);
    if (connErr2) {
      return NextResponse.json({ error: `Revoke failed: ${connErr2.message}` }, { status: 500 });
    }
  }

  // Audit log every disconnect, even keep_history, so we have a single
  // source of truth for "when did the user remove which bank with what
  // intent?" — useful for support, GDPR proofs, and product analytics.
  await admin.from('bank_disconnect_audit').insert({
    user_id: user.id,
    connection_id: mode === 'erase_all' ? null : connectionId,
    bank_name: conn.bank_name,
    provider: conn.provider,
    mode,
    transactions_affected: transactionsAffected,
    reason: body?.reason ?? null,
  });

  return NextResponse.json({
    ok: true,
    mode,
    transactionsAffected,
    bankName: conn.bank_name,
  });
}
