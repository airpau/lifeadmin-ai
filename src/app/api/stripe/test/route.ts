import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const STRIPE_BASE = 'https://api.stripe.com/v1';

// Create founding member prices on the live Stripe account
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = process.env.STRIPE_SECRET_KEY!;

  // First get existing products
  const productsRes = await fetch(`${STRIPE_BASE}/products?limit=20&active=true`, {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  const productsData = await productsRes.json();
  const products = productsData.data || [];

  // Find or create Essential and Pro products
  let essentialProduct = products.find((p: any) => p.name?.toLowerCase().includes('essential'));
  let proProduct = products.find((p: any) => p.name?.toLowerCase().includes('pro'));

  if (!essentialProduct) {
    const res = await fetch(`${STRIPE_BASE}/products`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'Paybacker Essential' }).toString(),
    });
    essentialProduct = await res.json();
  }

  if (!proProduct) {
    const res = await fetch(`${STRIPE_BASE}/products`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'Paybacker Pro' }).toString(),
    });
    proProduct = await res.json();
  }

  // Create the 4 founding member prices
  const pricesToCreate = [
    { product: essentialProduct.id, unit_amount: '499', currency: 'gbp', interval: 'month', nickname: 'Essential Monthly Founding' },
    { product: essentialProduct.id, unit_amount: '4499', currency: 'gbp', interval: 'year', nickname: 'Essential Annual Founding' },
    { product: proProduct.id, unit_amount: '999', currency: 'gbp', interval: 'month', nickname: 'Pro Monthly Founding' },
    { product: proProduct.id, unit_amount: '9499', currency: 'gbp', interval: 'year', nickname: 'Pro Annual Founding' },
  ];

  const created: any[] = [];
  for (const price of pricesToCreate) {
    const res = await fetch(`${STRIPE_BASE}/prices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product: price.product,
        unit_amount: price.unit_amount,
        currency: price.currency,
        'recurring[interval]': price.interval,
        nickname: price.nickname,
      }).toString(),
    });
    const data = await res.json();
    created.push({ id: data.id, nickname: price.nickname, amount: price.unit_amount, interval: price.interval, error: data.error });
  }

  return NextResponse.json({ products: { essential: essentialProduct.id, pro: proProduct.id }, prices: created });
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    stripe_key_set: !!process.env.STRIPE_SECRET_KEY,
    stripe_key_prefix: process.env.STRIPE_SECRET_KEY?.substring(0, 7) || 'NOT SET',
    stripe_key_length: process.env.STRIPE_SECRET_KEY?.length || 0,
    supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    app_url: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
    node_version: process.version,
  };

  if (!process.env.STRIPE_SECRET_KEY) {
    results.error = 'STRIPE_SECRET_KEY not set';
    return NextResponse.json(results);
  }

  // Test 1: List prices via raw fetch (same method as checkout route)
  try {
    const res = await fetch(`${STRIPE_BASE}/prices?limit=5&active=true`, {
      headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const data = await res.json();

    if (data.error) {
      results.stripe_api_error = data.error;
    } else {
      results.prices_found = data.data?.length || 0;
      results.prices = data.data?.map((p: any) => ({
        id: p.id,
        amount: p.unit_amount,
        currency: p.currency,
        interval: p.recurring?.interval || 'one-time',
      }));
    }
    results.stripe_fetch_status = res.status;
  } catch (err: any) {
    results.stripe_fetch_error = err.message;
  }

  // Test 2: Check the specific price IDs from TASK.md
  const expectedPrices = [
    'price_1TDVvS7qw7mEWYpyN80zzAXM',
    'price_1TDVvS7qw7mEWYpynfpI5x9M',
    'price_1TDVvT7qw7mEWYpySmjZJTpG',
    'price_1TDVvT7qw7mEWYpyrLHr6L45',
  ];

  const priceChecks: Record<string, unknown> = {};
  for (const priceId of expectedPrices) {
    try {
      const res = await fetch(`${STRIPE_BASE}/prices/${priceId}`, {
        headers: { 'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      });
      const data = await res.json();
      priceChecks[priceId] = data.error
        ? { status: 'ERROR', message: data.error.message }
        : { status: 'OK', amount: data.unit_amount, currency: data.currency, active: data.active };
    } catch (err: any) {
      priceChecks[priceId] = { status: 'FETCH_ERROR', message: err.message };
    }
  }
  results.price_checks = priceChecks;

  return NextResponse.json(results);
}
