import { NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe';

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    stripe_key_set: !!process.env.STRIPE_SECRET_KEY,
    stripe_key_prefix: process.env.STRIPE_SECRET_KEY?.substring(0, 7) || 'NOT SET',
    supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    app_url: process.env.NEXT_PUBLIC_APP_URL || 'NOT SET',
  };

  try {
    const stripe = getStripeClient();
    results.stripe_client = 'OK';

    // Try listing prices to confirm API connectivity
    const prices = await stripe.prices.list({ limit: 5, active: true });
    results.prices_found = prices.data.length;
    results.prices = prices.data.map((p) => ({
      id: p.id,
      amount: p.unit_amount,
      currency: p.currency,
      recurring: p.recurring?.interval || 'one-time',
      product: p.product,
    }));
  } catch (err: any) {
    results.stripe_error = err.message;
    results.stripe_error_type = err.type || 'unknown';
  }

  return NextResponse.json(results);
}
