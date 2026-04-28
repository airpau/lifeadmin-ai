/**
 * POST /api/v1/portal-billing — generate a Stripe Customer Portal
 * session URL for the signed-in B2B customer.
 *
 * Body: { token, email }
 *
 * Looks up the customer's stripe_customer_id from any of their B2B
 * keys. If they don't have one (free starter only), returns a hint
 * pointing them at the upgrade page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import Stripe from 'stripe';
import { authPortal } from '@/lib/b2b/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyToken(supabase: any, token: string, email: string): Promise<boolean> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await supabase.from('b2b_portal_tokens').select('id, expires_at, used_at').eq('token_hash', tokenHash).eq('email', email).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return false;
  return true;
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const auth = await authPortal(request, body, null);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const email = auth.email;
  const supabase = getAdmin();

  const { resolveOwner } = await import('../portal-members/route');
  const { owner } = await resolveOwner(supabase as any, email);

  const { data: keyWithCustomer } = await supabase
    .from('b2b_api_keys')
    .select('stripe_customer_id')
    .eq('owner_email', owner)
    .not('stripe_customer_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (!keyWithCustomer?.stripe_customer_id) {
    return NextResponse.json({
      error: 'No paid subscription on this account. Upgrade to Growth or Enterprise to manage billing.',
      upgrade_url: '/for-business#buy',
    }, { status: 404 });
  }

  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: keyWithCustomer.stripe_customer_id,
      return_url: 'https://paybacker.co.uk/dashboard/api-keys',
    });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Stripe error' }, { status: 500 });
  }
}
