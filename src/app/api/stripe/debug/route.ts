import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const subId = request.nextUrl.searchParams.get('sub');
  if (!subId) {
    return NextResponse.json({ error: 'sub param required' }, { status: 400 });
  }

  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const sub = await res.json();

  return NextResponse.json({
    id: sub.id,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    cancel_at: sub.cancel_at,
    canceled_at: sub.canceled_at,
    current_period_end: sub.current_period_end,
    current_period_end_date: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    schedule: sub.schedule,
    pending_update: sub.pending_update,
    price: sub.items?.data?.[0]?.price?.id,
  });
}
