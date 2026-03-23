import { NextRequest, NextResponse } from 'next/server';
import { sendOnboardingEmail } from '@/lib/email/onboarding-sequence';

export async function POST(request: NextRequest) {
  try {
    const { email, name, userId } = await request.json();
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

    // Awin S2S lead tracking for all new signups (free and paid)
    const awc = encodeURIComponent(request.cookies.get('awc')?.value || '');
    const orderRef = encodeURIComponent(`signup-${userId || email}`);
    const awinUrl = `https://www.awin1.com/sread.php?tt=ss&tv=2&merchant=125502&amount=0.00&ch=aw&parts=DEFAULT:0.00&vc=&cr=GBP&ref=${orderRef}&cks=${awc}&customeracquisition=NEW`;
    fetch(awinUrl).catch(() => {});

    const sent = await sendOnboardingEmail(email, name || 'there', 'welcome');
    return NextResponse.json({ sent });
  } catch (err: any) {
    console.error('Welcome email error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
