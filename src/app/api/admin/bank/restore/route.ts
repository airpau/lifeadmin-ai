/**
 * POST /api/admin/bank/restore
 *
 * Support-agent path: lets a Paybacker admin restore a target user's
 * soft-deleted bank transactions on their behalf — useful when a user
 * realised they hit "Stop syncing and delete the transactions" by
 * mistake and contacts support before the 30-day purge cron runs.
 *
 * Body: { targetUserEmail: string; connectionId: string }
 *
 * Returns: { transactionsRestored: number; targetUserId: string }
 *
 * Auth: Supabase session + email must be in NEXT_PUBLIC_ADMIN_EMAILS
 * (defaults to aireypaul@googlemail.com — same allowlist as the
 * dashboard admin UI gate at /dashboard/layout.tsx).
 *
 * Behaviour mirrors the user-scoped /api/bank/restore endpoint —
 * un-soft-deletes any rows where deleted_at > now() - 30 days,
 * un-revokes the connection, audit-logs the restore.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function getAdminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Admin gate: env-var allowlist, same as the dashboard's isAdmin check.
  const adminEmails = getAdminEmails();
  if (!user.email || !adminEmails.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const targetUserEmail: string | undefined = body?.targetUserEmail?.trim();
  const connectionId: string | undefined = body?.connectionId?.trim();

  if (!targetUserEmail || !connectionId) {
    return NextResponse.json(
      { error: 'targetUserEmail and connectionId are both required' },
      { status: 400 },
    );
  }

  // Resolve email → user_id via the auth.users table (admin client only;
  // RLS would block this for normal users).
  const admin = getAdmin();
  const { data: targetProfile, error: lookupErr } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', targetUserEmail)
    .maybeSingle();
  if (lookupErr || !targetProfile) {
    return NextResponse.json(
      { error: `No user found with email ${targetUserEmail}` },
      { status: 404 },
    );
  }

  // Verify the connection actually belongs to the target user — protect
  // against admin-typo'd connection ids leaking activity to the wrong
  // account.
  const { data: conn, error: connErr } = await admin
    .from('bank_connections')
    .select('id, bank_name, user_id, status')
    .eq('id', connectionId)
    .eq('user_id', targetProfile.id)
    .maybeSingle();
  if (connErr || !conn) {
    return NextResponse.json(
      { error: `Connection ${connectionId} not found for user ${targetUserEmail}` },
      { status: 404 },
    );
  }

  const { data: restored, error } = await admin.rpc(
    'restore_soft_deleted_transactions',
    { p_user_id: targetProfile.id, p_connection_id: connectionId },
  );

  if (error) {
    console.error('[admin.bank.restore] RPC failed:', error.message);
    return NextResponse.json({ error: `Restore failed: ${error.message}` }, { status: 500 });
  }

  // Extra audit row tagging the admin-initiated restore so we have a
  // paper trail distinct from a user self-serve restore (the RPC also
  // writes its own row but doesn't know who triggered it).
  await admin.from('bank_disconnect_audit').insert({
    user_id: targetProfile.id,
    connection_id: connectionId,
    bank_name: conn.bank_name,
    mode: 'restore',
    transactions_affected: restored ?? 0,
    reason: `Admin-restored by ${user.email} on behalf of ${targetUserEmail}`,
  });

  console.log(
    `[admin.bank.restore] ${user.email} restored ${restored} txns on ${conn.bank_name} `
    + `(connection ${connectionId}) for ${targetUserEmail} (user ${targetProfile.id})`,
  );

  return NextResponse.json({
    ok: true,
    transactionsRestored: restored ?? 0,
    targetUserId: targetProfile.id,
    bankName: conn.bank_name,
  });
}
