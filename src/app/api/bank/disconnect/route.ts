/**
 * POST /api/bank/disconnect
 *
 * Body: {
 *   connectionId?: string;
 *   accountId?: string;     // optional — scope to one account inside a multi-account consent
 *   mode?: 'keep_history' | 'delete_transactions' | 'erase_all';
 *   reason?: string;
 * }
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
 * Per-account scoping (`accountId`):
 *   Yapily / TrueLayer often group multiple accounts (current, savings,
 *   credit card) under one consent — Paul's modelo-sandbox connection
 *   shows three. When the caller supplies `accountId`, we narrow every
 *   operation to that single account: txns are filtered by account_id,
 *   the account is removed from `bank_connections.account_ids`, and the
 *   connection row is left active for the remaining accounts. If the
 *   account list goes empty as a result, we revoke the whole connection
 *   the same way the legacy connection-level path does.
 *
 * All paths write to bank_disconnect_audit with the row count + the
 * account scope so we have a paper trail.
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
  const accountId: string | undefined = body?.accountId?.trim() || undefined;
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
    .select('id, user_id, bank_name, provider, status, account_ids, account_display_names')
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (connErr || !conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  // If accountId is provided, validate it's actually one of the
  // connection's accounts. Refusing here protects against support-agent
  // typos leaking activity into the wrong scope and stops a stale UI
  // from sending a now-removed accountId.
  const allAccountIds: string[] = Array.isArray(conn.account_ids) ? conn.account_ids : [];
  const allAccountNames: string[] = Array.isArray(conn.account_display_names) ? conn.account_display_names : [];
  if (accountId && !allAccountIds.includes(accountId)) {
    return NextResponse.json({ error: `Account ${accountId} is not on connection ${connectionId}` }, { status: 404 });
  }
  const accountIndex = accountId ? allAccountIds.indexOf(accountId) : -1;
  const accountDisplayName = accountIndex >= 0 ? (allAccountNames[accountIndex] ?? null) : null;

  // Decide whether this op should also revoke the connection row
  // entirely. Three cases:
  //   - No accountId provided: classic connection-level disconnect.
  //   - accountId provided AND it's the only account on the connection:
  //     after removing it, the consent is empty → revoke.
  //   - accountId provided AND there are other accounts left: keep
  //     the connection active for the remainder.
  const isAccountScoped = !!accountId;
  const remainingAccountIds = isAccountScoped ? allAccountIds.filter((id) => id !== accountId) : [];
  const remainingAccountNames = isAccountScoped
    ? allAccountIds
        .map((id, i) => (id === accountId ? null : allAccountNames[i] ?? null))
        .filter((n): n is string => n !== null)
    : [];
  const willRevokeConnection = !isAccountScoped || remainingAccountIds.length === 0;

  let transactionsAffected = 0;

  // Helper that applies the chosen mode-specific filter to the
  // bank_transactions query. Both the count and the mutation paths
  // need the same filter so we avoid count/mutation drift.
  const applyTxnScope = <Q extends { eq: (col: string, val: string) => Q }>(q: Q) => {
    let query = q.eq('user_id', user.id).eq('connection_id', connectionId);
    if (isAccountScoped && accountId) {
      query = query.eq('account_id', accountId);
    }
    return query;
  };

  if (mode === 'delete_transactions' || mode === 'erase_all') {
    let countQuery = admin
      .from('bank_transactions')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);
    countQuery = applyTxnScope(countQuery);
    const { count } = await countQuery;
    transactionsAffected = count ?? 0;
  }

  const now = new Date().toISOString();

  if (mode === 'erase_all') {
    // Hard delete transactions first (FK).
    let delQuery = admin.from('bank_transactions').delete();
    delQuery = applyTxnScope(delQuery);
    const { error: txErr } = await delQuery;
    if (txErr) {
      return NextResponse.json({ error: `Erase failed at transactions: ${txErr.message}` }, { status: 500 });
    }
    if (willRevokeConnection) {
      // Whole consent goes — drop the connection row entirely.
      const { error: connDelErr } = await admin
        .from('bank_connections')
        .delete()
        .eq('id', connectionId)
        .eq('user_id', user.id);
      if (connDelErr) {
        return NextResponse.json({ error: `Erase failed at connection: ${connDelErr.message}` }, { status: 500 });
      }
    } else {
      // Account-scoped erase: keep the connection for remaining
      // accounts, just trim the lists so the gone account stops
      // surfacing in any UI driven off bank_connections.
      const { error: connUpdErr } = await admin
        .from('bank_connections')
        .update({
          account_ids: remainingAccountIds,
          account_display_names: remainingAccountNames,
          updated_at: now,
        })
        .eq('id', connectionId)
        .eq('user_id', user.id);
      if (connUpdErr) {
        return NextResponse.json({ error: `Erase failed at connection update: ${connUpdErr.message}` }, { status: 500 });
      }
    }
  } else if (mode === 'delete_transactions') {
    let updQuery = admin.from('bank_transactions').update({ deleted_at: now }).is('deleted_at', null);
    updQuery = applyTxnScope(updQuery);
    const { error: txErr } = await updQuery;
    if (txErr) {
      return NextResponse.json({ error: `Soft-delete failed: ${txErr.message}` }, { status: 500 });
    }
    if (willRevokeConnection) {
      const { error: connErr2 } = await admin
        .from('bank_connections')
        .update({ status: 'revoked', updated_at: now })
        .eq('id', connectionId)
        .eq('user_id', user.id);
      if (connErr2) {
        return NextResponse.json({ error: `Revoke failed: ${connErr2.message}` }, { status: 500 });
      }
    } else {
      const { error: connUpdErr } = await admin
        .from('bank_connections')
        .update({
          account_ids: remainingAccountIds,
          account_display_names: remainingAccountNames,
          updated_at: now,
        })
        .eq('id', connectionId)
        .eq('user_id', user.id);
      if (connUpdErr) {
        return NextResponse.json({ error: `Trim accounts failed: ${connUpdErr.message}` }, { status: 500 });
      }
    }
  } else {
    // keep_history mode
    if (willRevokeConnection) {
      // Classic connection-level revoke — txns left visible.
      const { error: connErr2 } = await admin
        .from('bank_connections')
        .update({ status: 'revoked', updated_at: now })
        .eq('id', connectionId)
        .eq('user_id', user.id);
      if (connErr2) {
        return NextResponse.json({ error: `Revoke failed: ${connErr2.message}` }, { status: 500 });
      }
    } else {
      // Account-scoped keep_history: connection stays active for the
      // other accounts; we just trim this account out of the consent
      // arrays. Existing transactions for the removed account stay
      // queryable until the user explicitly deletes them.
      const { error: connUpdErr } = await admin
        .from('bank_connections')
        .update({
          account_ids: remainingAccountIds,
          account_display_names: remainingAccountNames,
          updated_at: now,
        })
        .eq('id', connectionId)
        .eq('user_id', user.id);
      if (connUpdErr) {
        return NextResponse.json({ error: `Trim accounts failed: ${connUpdErr.message}` }, { status: 500 });
      }
    }
  }

  // Audit log every disconnect, even keep_history, so we have a single
  // source of truth for "when did the user remove which bank with what
  // intent?" — useful for support, GDPR proofs, and product analytics.
  await admin.from('bank_disconnect_audit').insert({
    user_id: user.id,
    connection_id: mode === 'erase_all' && willRevokeConnection ? null : connectionId,
    bank_name: conn.bank_name,
    provider: conn.provider,
    mode,
    transactions_affected: transactionsAffected,
    reason: body?.reason ?? null,
    account_id: accountId ?? null,
    account_display_name: accountDisplayName,
  });

  return NextResponse.json({
    ok: true,
    mode,
    transactionsAffected,
    bankName: conn.bank_name,
    accountId: accountId ?? null,
    accountDisplayName,
    connectionRevoked: willRevokeConnection,
    remainingAccountCount: isAccountScoped ? remainingAccountIds.length : 0,
  });
}
