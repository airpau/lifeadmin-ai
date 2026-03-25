import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: activeConnections } = await supabase
    .from('bank_connections')
    .select('id, provider_id, status, last_synced_at, connected_at, account_ids, bank_name, account_display_names')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('connected_at', { ascending: false });

  const { data: expiredConnections } = await supabase
    .from('bank_connections')
    .select('id, provider_id, status, last_synced_at, connected_at, account_ids, bank_name, account_display_names')
    .eq('user_id', user.id)
    .eq('status', 'expired')
    .order('connected_at', { ascending: false });

  const connections = activeConnections || [];
  const expired = expiredConnections || [];
  const connection = connections.length > 0 ? connections[0] : null;

  return NextResponse.json({
    connection,
    connections,
    expired,
    hasExpired: expired.length > 0,
  });
}
