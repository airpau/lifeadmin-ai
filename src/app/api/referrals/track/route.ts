import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processReferral } from '@/lib/referrals';

/**
 * POST /api/referrals/track
 * Called on signup to link a referral cookie to the new user.
 * Reads the referral code from the request body (frontend reads from cookie/localStorage).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { referralCode } = await request.json();

    if (!referralCode) {
      return NextResponse.json({ tracked: false, reason: 'No referral code provided' });
    }

    const result = await processReferral(referralCode, user.id, user.email || '');

    if (result.success) {
      console.log(`[referral] Tracked: code=${referralCode} newUser=${user.id} referrer=${result.referrerId}`);
    }

    return NextResponse.json({ tracked: result.success, referrerId: result.referrerId });
  } catch (err: any) {
    console.error('[referral] Track error:', err.message);
    return NextResponse.json({ tracked: false, error: err.message });
  }
}
