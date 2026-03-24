import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { redeemPoints, REDEMPTION_OPTIONS } from '@/lib/loyalty';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { redemption_id } = await request.json();

    if (!redemption_id) {
      return NextResponse.json({ error: 'redemption_id required' }, { status: 400 });
    }

    const option = REDEMPTION_OPTIONS.find(o => o.id === redemption_id);
    if (!option) {
      return NextResponse.json({ error: 'Invalid redemption option' }, { status: 400 });
    }

    const result = await redeemPoints(user.id, redemption_id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (err: any) {
    console.error('[loyalty] Redeem error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
