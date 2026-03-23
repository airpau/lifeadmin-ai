import { NextRequest, NextResponse } from 'next/server';

const AWIN_ADVERTISER_ID = process.env.NEXT_PUBLIC_AWIN_ADVERTISER_ID || '125502';

// Commission amounts: 20% of first month
const TIER_COMMISSIONS: Record<string, { amount: number; group: string }> = {
  essential: { amount: 2.00, group: 'ESSENTIAL' },  // 20% of £9.99
  pro: { amount: 4.00, group: 'PRO' },              // 20% of £19.99
};

/**
 * Fired when a user converts to a paid plan (Essential or Pro).
 * Called from the Stripe webhook handler after subscription creation.
 * Tracks the conversion in Awin so the referring influencer gets paid.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { userId, tier, stripeSessionId } = await request.json();

    if (!userId || !tier) {
      return NextResponse.json({ error: 'userId and tier required' }, { status: 400 });
    }

    const commission = TIER_COMMISSIONS[tier];
    if (!commission) {
      return NextResponse.json({ error: `Unknown tier: ${tier}` }, { status: 400 });
    }

    const orderRef = encodeURIComponent(`conversion-${stripeSessionId || userId}`);

    const awinUrl = `https://www.awin1.com/sread.php?tt=ss&tv=2&merchant=${AWIN_ADVERTISER_ID}` +
      `&amount=${commission.amount.toFixed(2)}&ch=aw` +
      `&parts=${commission.group}:${commission.amount.toFixed(2)}` +
      `&vc=&cr=GBP&ref=${orderRef}&customeracquisition=NEW`;

    const res = await fetch(awinUrl);
    console.log(`[awin] Conversion tracked: tier=${tier} commission=£${commission.amount} ref=${orderRef} status=${res.status}`);

    return NextResponse.json({
      ok: true,
      tier,
      commission: commission.amount,
      ref: decodeURIComponent(orderRef),
    });
  } catch (err: any) {
    console.error('[awin] Conversion tracking failed:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
