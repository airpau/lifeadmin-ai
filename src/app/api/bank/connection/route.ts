import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: connection } = await supabase
    .from('bank_connections')
    .select('id, status, last_synced_at, connected_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('connected_at', { ascending: false })
    .maybeSingle();

  return NextResponse.json({ connection: connection || null });
}
