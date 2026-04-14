import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { processReferral } from '@/lib/referrals';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { referralCode } = await request.json();
    const userId = user.id;
    const email = user.email;

    if (!referralCode) {
      return NextResponse.json({ error: 'Missing referralCode' }, { status: 400 });
    }

    const result = await processReferral(referralCode, userId, email || '');

    if (result.success) {
      console.log(`Referral processed: code=${referralCode} newUser=${userId} referrer=${result.referrerId}`);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Referral processing error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
