import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TRUELAYER_AUTH_URL = process.env.TRUELAYER_AUTH_URL || 'https://auth.truelayer.com';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check bank connection limits by tier
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', user.id)
    .single();

  const tier = profile?.subscription_tier || 'free';

  const { data: existingConnections } = await supabase
    .from('bank_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active');

  const connectionCount = existingConnections?.length || 0;

  // Tier connection limits: Free=1, Essential=2, Pro=unlimited
  const maxConnections = tier === 'pro' ? Infinity : tier === 'essential' ? 2 : 1;
  if (connectionCount >= maxConnections) {
    return NextResponse.json({
      error: tier === 'free'
        ? 'Free plan allows 1 bank connection. Upgrade to Essential for 2, or Pro for unlimited.'
        : 'Essential plan allows 2 bank connections. Upgrade to Pro for unlimited banks.',
      upgradeRequired: true,
      tier,
      maxConnections,
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

  // Encode user ID as state for CSRF protection
  const state = Buffer.from(user.id).toString('base64');

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
