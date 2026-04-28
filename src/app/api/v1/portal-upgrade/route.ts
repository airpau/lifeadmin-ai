/**
 * POST /api/v1/portal-upgrade — in-portal Stripe Checkout for free→paid upgrade.
 *
 * Body: { tier: 'growth' | 'enterprise' }
 *
 * Auth: portal session (cookie) or magic-link token. The customer's
 * email + currently-owned starter key drive the Stripe session metadata
 * so the webhook can revoke the free key cleanly after the new paid
 * key is minted. No re-typing the form, no losing audit history.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { authPortal } from '@/lib/b2b/session';
import { audit, extractClientMeta } from '@/lib/b2b/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const TIER_PRICE_ENV: Record<string, string> = {
  growth: 'STRIPE_PRICE_API_GROWTH_MONTHLY',
  enterprise: 'STRIPE_PRICE_API_ENTERPRISE_MONTHLY',
};

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const tier = String(body?.tier || '');
  const envKey = TIER_PRICE_ENV[tier];
  if (!envKey) return NextResponse.json({ error: '`tier` must be growth or enterprise' }, { status: 400 });

  const auth = await authPortal(request, body, null);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const email = auth.email;

  const supabase = getAdmin();
  const { resolveOwner } = await import('../portal-members/route');
  const { owner, role } = await resolveOwner(supabase as any, email);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin role required to upgrade.' }, { status: 403 });

  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  const priceId = process.env[envKey];
  if (!priceId) return NextResponse.json({ error: `${envKey} not set` }, { status: 500 });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://paybacker.co.uk';

  // Find any starter key on this owner so the webhook can revoke it
  // post-conversion. Multiple starter keys → revoke them all.
  const { data: starterKeys } = await supabase
    .from('b2b_api_keys')
    .select('id')
    .eq('owner_email', owner)
    .eq('tier', 'starter')
    .is('revoked_at', null);
  const starterIds = (starterKeys ?? []).map((k: any) => k.id).join(',');

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: owner,
      success_url: `${baseUrl}/dashboard/api-keys?upgraded=1`,
      cancel_url: `${baseUrl}/dashboard/api-keys?upgrade_cancelled=1`,
      metadata: {
        product: 'b2b_api',
        tier,
        contact_name: email,
        company: '',
        upgrading_from_free: '1',
        revoke_starter_ids: starterIds,
      },
      subscription_data: {
        metadata: {
          product: 'b2b_api',
          tier,
          contact_name: email,
          company: '',
          upgrading_from_free: '1',
          revoke_starter_ids: starterIds,
        },
      },
      allow_promotion_codes: true,
    });

    const meta = extractClientMeta(request);
    audit({ email, action: 'plan_changed', ...meta, metadata: { op: 'upgrade_initiated', tier, starter_ids: starterIds } });

    return NextResponse.json({ url: session.url, id: session.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Stripe error' }, { status: 500 });
  }
}
