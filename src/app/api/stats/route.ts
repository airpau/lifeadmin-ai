import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const supabase = getAdmin();

  const [letters, subs, users, deals] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('type', 'complaint_letter'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('deal_clicks').select('id', { count: 'exact', head: true }),
  ]);

  return NextResponse.json({
    lettersGenerated: letters.count || 0,
    subscriptionsTracked: subs.count || 0,
    usersJoined: users.count || 0,
    dealClicks: deals.count || 0,
  });
}
