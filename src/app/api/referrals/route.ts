import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReferralStats } from '@/lib/referrals';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await getReferralStats(user.id);
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
