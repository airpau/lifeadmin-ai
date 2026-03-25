import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

const FOUNDING_MEMBER_LIMIT = 25;
const FOUNDING_MEMBER_TIER = 'pro';
const FOUNDING_MEMBER_DAYS = 30;

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// GET: Check how many spots remain
export async function GET() {
  const admin = getAdmin();
  const { count } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('founding_member', true);

  const claimed = count || 0;
  const remaining = Math.max(0, FOUNDING_MEMBER_LIMIT - claimed);

  return NextResponse.json({
    limit: FOUNDING_MEMBER_LIMIT,
    claimed,
    remaining,
    active: remaining > 0,
    tier: FOUNDING_MEMBER_TIER,
    days: FOUNDING_MEMBER_DAYS,
  });
}

// POST: Claim a founding member spot (called from signup flow)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdmin();

    // Check spots remaining
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('founding_member', true);

    const claimed = count || 0;
    if (claimed >= FOUNDING_MEMBER_LIMIT) {
      return NextResponse.json({ claimed: false, reason: 'All spots taken' });
    }

    // Check if already a founding member
    const { data: profile } = await admin
      .from('profiles')
      .select('founding_member')
      .eq('id', user.id)
      .single();

    if (profile?.founding_member) {
      return NextResponse.json({ claimed: true, alreadyMember: true });
    }

    // Claim the spot
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + FOUNDING_MEMBER_DAYS);

    await admin.from('profiles').update({
      subscription_tier: FOUNDING_MEMBER_TIER,
      founding_member: true,
      founding_member_expires: expiresAt.toISOString(),
    }).eq('id', user.id);

    return NextResponse.json({
      claimed: true,
      tier: FOUNDING_MEMBER_TIER,
      expires: expiresAt.toISOString(),
      spotsRemaining: FOUNDING_MEMBER_LIMIT - claimed - 1,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
