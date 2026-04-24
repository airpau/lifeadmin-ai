import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLAN_LIMITS, getEffectiveTier } from '@/lib/plan-limits';

const TRUELAYER_AUTH_URL = process.env.TRUELAYER_AUTH_URL || 'https://auth.truelayer.com';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Bank-connection cap per tier comes from the single PLAN_LIMITS source
  // of truth now (Free=2, Essential=3, Pro=∞). Previously hard-coded to
  // 1/2/∞ here — that stayed stale during the April 2026 matrix rewrite.
  const tier = await getEffectiveTier(user.id);
  const maxBanks = PLAN_LIMITS[tier].maxBanks;

  const { data: existingConnections } = await supabase
    .from('bank_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('deleted_at', null);

  const connectionCount = existingConnections?.length || 0;

  if (maxBanks !== null && connectionCount >= maxBanks) {
    return NextResponse.json({
      error: tier === 'free'
        ? `Free plan allows ${maxBanks} bank connections. Upgrade to Essential for 3, or Pro for unlimited.`
        : `Essential plan allows ${maxBanks} bank connections. Upgrade to Pro for unlimited banks.`,
      upgradeRequired: true,
      tier,
      maxConnections: maxBanks,
    }, { status: 403 });
  }

  const clientId = process.env.TRUELAYER_CLIENT_ID;
  const redirectUri = process.env.TRUELAYER_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: 'TrueLayer not configured' },
      { status: 500 }
    );
  }

  // Encode user ID + return path in state for CSRF protection + redirect
  const url = new URL(request.url);
  const returnTo = url.searchParams.get('returnTo') || '/dashboard/subscriptions';
  const statePayload = JSON.stringify({ userId: user.id, returnTo });
  const state = Buffer.from(statePayload).toString('base64');

  // Build auth URL — TrueLayer expects specific parameter format
  // Use only scopes that are enabled by default on new sandbox apps
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'info accounts balance transactions offline_access',
    redirect_uri: redirectUri,
    state,
  });

  // TrueLayer expects providers as separate params, not space-separated
  params.append('providers', 'uk-ob-all');
  params.append('providers', 'uk-oauth-all');

  const authUrl = `${TRUELAYER_AUTH_URL}/?${params.toString()}`;

  console.log(`TrueLayer auth: redirecting to ${authUrl}`);

  return NextResponse.redirect(authUrl);
}
