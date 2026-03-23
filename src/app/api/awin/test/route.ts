import { NextRequest, NextResponse } from 'next/server';

// Manual Awin S2S test endpoint — secured with CRON_SECRET
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const ref = request.nextUrl.searchParams.get('ref') || `test-${Date.now()}`;
  const awc = request.nextUrl.searchParams.get('awc') || '';

  const awinUrl = `https://www.awin1.com/sread.php?tt=ss&tv=2&merchant=125502&amount=0.00&ch=aw&parts=DEFAULT:0.00&vc=&cr=GBP&ref=${encodeURIComponent(ref)}&cks=${encodeURIComponent(awc)}&customeracquisition=NEW`;

  const res = await fetch(awinUrl);
  return NextResponse.json({
    ok: res.ok,
    status: res.status,
    ref,
    awc: awc || 'none',
    url: awinUrl,
  });
}
