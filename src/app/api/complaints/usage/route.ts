import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkUsageLimit } from '@/lib/plan-limits';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await checkUsageLimit(user.id, 'complaint_generated');
  return NextResponse.json({ used: result.used, limit: result.limit, tier: result.tier });
}
