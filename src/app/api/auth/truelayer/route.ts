import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Local dev redirect: http://localhost:3000/api/auth/callback/truelayer
// Production redirect: https://paybacker.co.uk/api/auth/callback/truelayer
const TRUELAYER_AUTH_URL = process.env.TRUELAYER_AUTH_URL || 'https://auth.truelayer.com';

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: 'info accounts balance cards transactions offline_access',
    redirect_uri: redirectUri,
    providers: 'uk-ob-all uk-oauth-all',
    state,
  });

  const authUrl = `${TRUELAYER_AUTH_URL}/?${params.toString()}`;

  return NextResponse.redirect(authUrl);
}
