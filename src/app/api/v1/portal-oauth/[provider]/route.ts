/**
 * GET /api/v1/portal-oauth/google      — start Google OAuth
 * GET /api/v1/portal-oauth/microsoft   — start Microsoft OAuth
 *
 * Redirects to the provider's authorization URL. State (anti-CSRF) is
 * stashed in a short-lived signed cookie. Provider env vars:
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
 *   MICROSOFT_OAUTH_CLIENT_ID / MICROSOFT_OAUTH_CLIENT_SECRET
 *
 * If env vars aren't set, returns 503 with a pointer to the docs.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pbk_oauth_state';

export async function GET(request: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  }
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://paybacker.co.uk';
  const redirectUri = `${baseUrl}/api/v1/portal-oauth/${provider}/callback`;

  let url: URL;
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!clientId) return NextResponse.json({ error: 'Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET in Vercel env.' }, { status: 503 });
    url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'online');
    url.searchParams.set('prompt', 'select_account');
  } else {
    const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
    if (!clientId) return NextResponse.json({ error: 'Microsoft OAuth not configured. Set MICROSOFT_OAUTH_CLIENT_ID + MICROSOFT_OAUTH_CLIENT_SECRET in Vercel env.' }, { status: 503 });
    url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile User.Read');
    url.searchParams.set('response_mode', 'query');
  }

  const state = crypto.randomBytes(32).toString('base64url');
  url.searchParams.set('state', state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set(STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
