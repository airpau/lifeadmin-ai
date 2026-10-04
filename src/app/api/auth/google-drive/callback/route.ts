// GET /api/auth/google-drive/callback: finish the Drive (drive.file)
// connect. Signed state checked before anything touches Google; tokens
// stored encrypted with stage one's token-crypto.

import { NextRequest, NextResponse } from 'next/server';
import { clearOAuthNonceCookie, readOAuthNonceCookie, verifyOAuthState } from '@/lib/oauth-state';
import { encryptToken } from '@/lib/email/token-crypto';
import { documentsAdmin } from '@/lib/documents/route-helpers';
import { createClient } from '@/lib/supabase/server';
import { DRIVE_FILE_SCOPE, isBrowserSafeDriveScope } from '@/lib/documents/drive';

export const runtime = 'nodejs';

function redirectUri(): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk').replace(/\/$/, '')}/api/auth/google-drive/callback`;
}

export async function GET(req: NextRequest) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk').replace(/\/$/, '');
  const back = (q: string) => clearOAuthNonceCookie(NextResponse.redirect(`${base}/dashboard/documents?${q}`), 'google_drive');

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (req.nextUrl.searchParams.get('error') || !code) return back('drive_error=access_denied');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return clearOAuthNonceCookie(NextResponse.redirect(`${base}/auth/login?redirect=/dashboard/documents`), 'google_drive');
  }

  const check = verifyOAuthState(state, {
    purpose: 'google_drive',
    nonceCookie: readOAuthNonceCookie(req, 'google_drive'),
    sessionUserId: user.id,
  });
  if (!check.ok) {
    console.error('[google-drive callback] rejected state:', check.reason);
    return back('drive_error=invalid_state');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const tokens = (await tokenRes.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!tokenRes.ok || !tokens.access_token) {
    console.error('[google-drive callback] token exchange failed', tokenRes.status);
    return back('drive_error=token_failed');
  }
  // The user can untick the Drive box on Google's consent screen.
  if (!(tokens.scope || '').split(/\s+/).includes(DRIVE_FILE_SCOPE)) {
    return back('drive_error=scope_missing');
  }
  // Never store a token that can do more than drive.file (it is the one
  // Google Picker gets in the browser). Google should never return extra
  // scopes for this non-incremental request; refuse if it ever does.
  if (!isBrowserSafeDriveScope(tokens.scope)) {
    console.error('[google-drive callback] refused a token with unexpected scopes');
    return back('drive_error=scope_unexpected');
  }

  let email: string | null = null;
  try {
    const info = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    email = ((await info.json()) as { email?: string }).email ?? null;
  } catch {
    // label only
  }

  const admin = documentsAdmin();
  const { data: existing } = await admin.from('drive_connections').select('refresh_token, google_email').eq('user_id', user.id).maybeSingle();
  // Google only returns a refresh token on first consent; keep the old one
  // on a reconnect of the SAME account, never across different accounts.
  const sameAccount = !!existing && !!email && existing.google_email === email;
  const refresh = tokens.refresh_token ? encryptToken(tokens.refresh_token) : sameAccount ? existing?.refresh_token ?? null : null;

  const { error } = await admin.from('drive_connections').upsert(
    {
      user_id: user.id,
      google_email: email,
      access_token: encryptToken(tokens.access_token),
      refresh_token: refresh,
      token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      scope: tokens.scope ?? DRIVE_FILE_SCOPE,
      status: 'active',
      last_error: null,
      // A different Google account means a different Drive.
      ...(sameAccount ? {} : { root_folder_id: null }),
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[google-drive callback] save failed:', error.message);
    return back('drive_error=save_failed');
  }
  return back('drive_connected=1');
}
