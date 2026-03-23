import { NextRequest, NextResponse } from 'next/server';
import { sendOnboardingEmail } from '@/lib/email/onboarding-sequence';

export async function POST(request: NextRequest) {
  try {
    const { email, name, userId } = await request.json();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

const sent = await sendOnboardingEmail(email, name || 'there', 'welcome');
    return NextResponse.json({ sent });
  } catch (err: any) {
    console.error('Welcome email error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
