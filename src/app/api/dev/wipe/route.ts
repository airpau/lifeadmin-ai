import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== 'sheva.tests.2026@outlook.com') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  // Wipe transactions to allow a full 90-day backfill on next sync
  await admin.from('bank_transactions').delete().eq('user_id', user.id);
  // Wipe bank connections so it's perfectly clean
  await admin.from('bank_connections').delete().eq('user_id', user.id);
  // Wipe subscriptions from earlier test
  await admin.from('subscriptions').delete().eq('user_id', user.id);

  return NextResponse.json({ success: true, message: 'Wiped transactions and connections.' });
}
