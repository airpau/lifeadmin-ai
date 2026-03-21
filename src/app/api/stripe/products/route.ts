import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const key = process.env.STRIPE_SECRET_KEY!;

  // List all products
  const prodRes = await fetch('https://api.stripe.com/v1/products?limit=20', {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  const products = await prodRes.json();

  // List all prices
  const priceRes = await fetch('https://api.stripe.com/v1/prices?limit=20&expand[]=data.product', {
    headers: { 'Authorization': `Bearer ${key}` },
  });
  const prices = await priceRes.json();

  return NextResponse.json({
    products: products.data?.map((p: any) => ({
      id: p.id,
      name: p.name,
      active: p.active,
    })),
    prices: prices.data?.map((p: any) => ({
      id: p.id,
      active: p.active,
      amount: p.unit_amount,
      currency: p.currency,
      interval: p.recurring?.interval,
      product_id: typeof p.product === 'string' ? p.product : p.product?.id,
      product_name: typeof p.product === 'object' ? p.product?.name : null,
    })),
  });
}
