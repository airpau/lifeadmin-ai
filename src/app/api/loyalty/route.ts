import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLoyaltyStatus, REDEMPTION_OPTIONS, LOYALTY_TIERS } from '@/lib/loyalty';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = await getLoyaltyStatus(user.id);

    return NextResponse.json({
      ...status,
      redemptionOptions: REDEMPTION_OPTIONS.map(opt => ({
        ...opt,
        canRedeem: status.balance >= opt.points,
      })),
      allTiers: Object.entries(LOYALTY_TIERS).map(([key, val]) => ({
        key,
        ...val,
        isCurrent: key === status.tier,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
