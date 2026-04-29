/**
 * GET /api/subscription/active
 *
 * Returns all active subscription rows for the authenticated user across
 * billing sources, plus the resolved effective tier.
 *
 * Used by:
 *   - iOS app: BEFORE showing IAP upgrade buttons, call this. If any
 *     non-IAP active sub exists (e.g. Stripe), show "Manage on web"
 *     instead. Prevents users double-paying via Apple when they already
 *     pay via Stripe.
 *   - Web UpgradePrompt: BEFORE showing Stripe checkout, call this.
 *     If any IAP active sub exists, show "Manage in App Store" instead.
 *
 * Response shape:
 *   {
 *     userId: string,
 *     effectiveTier: 'free' | 'essential' | 'pro',
 *     primarySource: 'stripe' | 'apple_iap' | 'google_play_billing' | null,
 *     trialActive: boolean,
 *     subscriptions: [{ source, tier, billingPeriod, productId, status,
 *                       expiresAt, autoRenew }, ...]
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getUserFromAuthHeader(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user.id;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const userId = await getUserFromAuthHeader(req);
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  const [profileRes, subsRes] = await Promise.all([
    admin
      .from('profiles')
      .select('subscription_tier, subscription_source, trial_ends_at, trial_converted_at, trial_expired_at')
      .eq('id', userId)
      .single(),
    admin
      .from('subscriptions')
      .select('source, tier, billing_period, product_id, status, expires_at, auto_renew')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing']),
  ]);

  const now = Date.now();
  const activeSubs = (subsRes.data ?? []).filter(
    (s: { expires_at: string | null }) => !s.expires_at || new Date(s.expires_at).getTime() > now,
  );

  let effectiveTier = (profileRes.data?.subscription_tier as string) ?? 'free';
  const trialActive =
    !!profileRes.data?.trial_ends_at &&
    new Date(profileRes.data.trial_ends_at) > new Date() &&
    !profileRes.data?.trial_converted_at &&
    !profileRes.data?.trial_expired_at;
  if (trialActive) effectiveTier = 'pro';

  return NextResponse.json({
    ok: true,
    userId,
    effectiveTier,
    primarySource: profileRes.data?.subscription_source ?? null,
    trialActive,
    subscriptions: activeSubs.map((s: {
      source: string;
      tier: string;
      billing_period: string;
      product_id: string | null;
      status: string;
      expires_at: string | null;
      auto_renew: boolean | null;
    }) => ({
      source: s.source,
      tier: s.tier,
      billingPeriod: s.billing_period,
      productId: s.product_id,
      status: s.status,
      expiresAt: s.expires_at,
      autoRenew: s.auto_renew,
    })),
  });
}
