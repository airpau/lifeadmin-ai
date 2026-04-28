/**
 * GET /api/v1/portal-oauth/{google|microsoft}/callback
 *
 * Exchanges the authorization code, verifies the state, fetches the
 * user's email + provider subject, and links to a B2B credentials row.
 * If the email already has portal access (owns a key or is a member),
 * we mint a session cookie. Otherwise we redirect to /for-business
 * with a "no account" message — OAuth doesn't create accounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSession, setSessionCookie } from '@/lib/b2b/session';
import { emailHasPortalAccess } from '@/lib/b2b/password';
import { audit, extractClientMeta } from '@/lib/b2b/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pbk_oauth_state';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://paybacker.co.uk';
  const portalUrl = `${baseUrl}/dashboard/api-keys`;
  const errorRedirect = (msg: string) => NextResponse.redirect(`${portalUrl}?signin_error=${encodeURIComponent(msg)}`);

  if (!code || !state || state !== expectedState) return errorRedirect('OAuth state mismatch — try again.');
  if (provider !== 'google' && provider !== 'microsoft') return errorRedirect('Unknown OAuth provider.');

  const redirectUri = `${baseUrl}/api/v1/portal-oauth/${provider}/callback`;
  let email = '';
  let sub = '';

  try {
    if (provider === 'google') {
      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) return errorRedirect('Google OAuth not configured.');
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }).toString(),
      });
      const tok = await tokenRes.json();
      if (!tokenRes.ok) return errorRedirect(tok.error_description || 'Google token exchange failed.');
      const userInfo = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } });
      const u = await userInfo.json();
      email = (u.email || '').toLowerCase();
      sub = u.sub || '';
    } else {
      const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
      if (!clientId || !clientSecret) return errorRedirect('Microsoft OAuth not configured.');
      const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', scope: 'openid email profile User.Read' }).toString(),
      });
      const tok = await tokenRes.json();
      if (!tokenRes.ok) return errorRedirect(tok.error_description || 'Microsoft token exchange failed.');
      const userInfo = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
      const u = await userInfo.json();
      email = (u.mail || u.userPrincipalName || '').toLowerCase();
      sub = u.id || '';
    }
  } catch (e: any) {
    return errorRedirect(e?.message || 'OAuth exchange failed.');
  }

  if (!email || !sub) return errorRedirect('OAuth response did not include an email.');

  const has = await emailHasPortalAccess(email);
  if (!has) {
    return NextResponse.redirect(`${baseUrl}/for-business?signin_error=${encodeURIComponent(`No Paybacker account for ${email}. Get a key first.`)}`);
  }

  // Upsert credentials row with the provider sub
  const supabase = getAdmin();
  const subColumn = provider === 'google' ? 'oauth_google_sub' : 'oauth_microsoft_sub';
  await supabase.from('b2b_credentials').upsert({
    email,
    [subColumn]: sub,
    last_sign_in_method: provider,
    last_sign_in_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'email' });

  const meta = extractClientMeta(request);
  const sessionToken = await createSession(email, meta.ip_address, meta.user_agent);
  audit({ email, action: 'portal_signin', ...meta, metadata: { via: provider } });

  const res = NextResponse.redirect(portalUrl);
  setSessionCookie(res, sessionToken);
  res.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
