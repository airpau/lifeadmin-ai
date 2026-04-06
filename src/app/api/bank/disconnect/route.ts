import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optional: disconnect a specific connection by ID
  const body = await request.json().catch(() => ({}));
  const connectionId = body.connectionId;

  let query = supabase
    .from('bank_connections')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .in('status', ['active', 'expired', 'token_expired', 'expired_legacy', 'expiring_soon']);

  if (connectionId) {
    query = query.eq('id', connectionId);
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
