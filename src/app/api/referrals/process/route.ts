import { NextRequest, NextResponse } from 'next/server';
import { processReferral } from '@/lib/referrals';

export async function POST(request: NextRequest) {
  try {
    const { referralCode, userId, email } = await request.json();

    if (!referralCode || !userId) {
      return NextResponse.json({ error: 'Missing referralCode or userId' }, { status: 400 });
    }

    const result = await processReferral(referralCode, userId, email);

    if (result.success) {
      console.log(`Referral processed: code=${referralCode} newUser=${userId} referrer=${result.referrerId}`);
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Referral processing error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
