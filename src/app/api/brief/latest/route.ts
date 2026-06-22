/**
 * Returns the signed-in user's most recent persisted daily brief (the exact
 * body that was sent that morning). Backs the /dashboard/brief page that the
 * morning-summary "full brief" link points at. RLS-scoped to the owner.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('daily_brief_log')
    .select('brief_date, body_markdown, created_at')
    .eq('user_id', user.id)
    .order('brief_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ brief: data ?? null });
}
