import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const STRIPE_BASE = 'https://api.stripe.com/v1';

async function stripeGet(path: string) {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  return res.json();
}

async function stripeDelete(path: string) {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  return res.json();
}

// GET: list all subs for a customer
// POST with ?action=cleanup: cancel all but the newest, keep only one
export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customerId = request.nextUrl.searchParams.get('customer');
  if (!customerId) {
    return NextResponse.json({ error: 'customer param required' }, { status: 400 });
  }

  const allStatuses = ['active', 'trialing', 'past_due'];
  const allSubs: any[] = [];

  for (const status of allStatuses) {
    const subs = await stripeGet(`/subscriptions?customer=${customerId}&status=${status}&limit=100`);
    if (subs.data) allSubs.push(...subs.data);
  }

  return NextResponse.json({
    customer: customerId,
    total: allSubs.length,
    subscriptions: allSubs.map((s: any) => ({
      id: s.id,
      status: s.status,
      price: s.items.data[0]?.price.id,
      created: s.created,
    })),
  });
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { customerId, keepPriceId } = await request.json();
  if (!customerId) {
    return NextResponse.json({ error: 'customerId required' }, { status: 400 });
  }

  const allStatuses = ['active', 'trialing', 'past_due'];
  const allSubs: any[] = [];

  for (const status of allStatuses) {
    const subs = await stripeGet(`/subscriptions?customer=${customerId}&status=${status}&limit=100`);
    if (subs.data) allSubs.push(...subs.data);
  }

  // Sort by created desc (newest first)
  allSubs.sort((a: any, b: any) => b.created - a.created);

  const cancelled: string[] = [];
  let kept: string | null = null;

  for (const sub of allSubs) {
    const priceId = sub.items.data[0]?.price.id;
    // Keep the first one matching keepPriceId, or just the newest if no preference
    if (!kept && (!keepPriceId || priceId === keepPriceId)) {
      kept = sub.id;
      continue;
    }
    // Cancel everything else
    await stripeDelete(`/subscriptions/${sub.id}`);
    cancelled.push(sub.id);
  }

  // If we didn't keep any (no match for keepPriceId), keep the newest
  if (!kept && allSubs.length > 0) {
    kept = allSubs[0].id;
  }

  return NextResponse.json({ kept, cancelled, total: allSubs.length });
}
