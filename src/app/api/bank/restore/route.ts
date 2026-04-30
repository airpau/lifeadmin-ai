/**
 * POST /api/bank/restore
 *
 * Body: { connectionId: string }
 *
 * Restores transactions soft-deleted within the last 30 days for the
 * given connection. Counterpart to /api/bank/disconnect with
 * mode=delete_transactions. After 30 days the purge cron has removed
 * the rows permanently and there's nothing to restore.
 *
 * Also un-revokes the connection (status revoked → active) so syncing
 * resumes if the underlying TrueLayer/Yapily consent is still valid.
 * If the consent has expired the next sync will mark it expired again.
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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const connectionId: string | undefined = body?.connectionId;
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId required' }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: restored, error } = await admin.rpc('restore_soft_deleted_transactions', {
    p_user_id: user.id,
    p_connection_id: connectionId,
  });

  if (error) {
    return NextResponse.json({ error: `Restore failed: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, transactionsRestored: restored ?? 0 });
}
