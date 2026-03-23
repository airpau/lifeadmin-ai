import { NextRequest, NextResponse } from 'next/server';

// Called synchronously after every signup to fire Awin S2S lead tracking
export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json();
    const awc = encodeURIComponent(request.cookies.get('awc')?.value || '');
    const orderRef = encodeURIComponent(`signup-${userId || email}`);
    const awinUrl = `https://www.awin1.com/sread.php?tt=ss&tv=2&merchant=125502&amount=0.00&ch=aw&parts=DEFAULT:0.00&vc=&cr=GBP&ref=${orderRef}&cks=${awc}&customeracquisition=NEW`;

    const res = await fetch(awinUrl);
    console.log(`Awin S2S signup: ref=${orderRef} awc=${awc || 'none'} status=${res.status}`);
    return NextResponse.json({ ok: true, ref: decodeURIComponent(orderRef) });
  } catch (err: any) {
    console.error('Awin signup tracking failed:', err.message);
    return NextResponse.json({ ok: false });
  }
}
