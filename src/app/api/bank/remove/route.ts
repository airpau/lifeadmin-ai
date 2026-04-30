/**
 * POST /api/bank/remove
 *
 * Soft-delete a bank connection so it stops appearing in the Money Hub,
 * the Telegram bot's bank list, and elsewhere. Used when a user wants
 * to get rid of a sandbox/test connection entirely (rather than just
 * disconnect, which leaves the row around as `revoked`).
 *
 * Body: { connectionId: string }
 *
 * Hard delete isn't an option — `bank_transactions.connection_id` is
 * ON DELETE CASCADE, so removing the row would wipe the user's
 * historical spending for that bank. We set `deleted_at` instead and
 * rely on the column's partial index to keep reads fast.
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
  const connectionId = body?.connectionId as string | undefined;
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('bank_connections')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', connectionId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .select('id, bank_name')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Failed to remove connection' }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Connection not found or already removed' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: data.id, bank_name: data.bank_name });
}
