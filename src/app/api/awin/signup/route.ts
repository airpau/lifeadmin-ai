import { NextRequest, NextResponse } from 'next/server';

const AWIN_ADVERTISER_ID = process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID || '125502';

// Fired on every signup. Tracks as a £1 lead commission for the referring influencer.
export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json();
    const awcRaw = request.cookies.get('awc')?.value;
    const orderRef = encodeURIComponent(`signup-${userId || email}`);

    // Commission: track 1 for lead (Awin multiplies fixed amount by tracked value)
    let awinUrl = `https://www.awin1.com/sread.php?tt=ss&tv=2&merchant=${AWIN_ADVERTISER_ID}` +
      `&amount=1&ch=aw&parts=LEAD:1&vc=&cr=GBP&ref=${orderRef}&customeracquisition=NEW`;

    if (awcRaw) {
      awinUrl += `&cks=${encodeURIComponent(awcRaw)}`;
    }

    const res = await fetch(awinUrl);
    console.log(`[awin] Signup tracked: ref=${orderRef} awc=${awcRaw || 'none'} status=${res.status}`);
    return NextResponse.json({ ok: true, ref: decodeURIComponent(orderRef), awc: awcRaw || '' });
  } catch (err: any) {
    console.error('[awin] Signup tracking failed:', err.message);
    return NextResponse.json({ ok: false });
  }
}
