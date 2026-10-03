import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { exchangeCodeForTokens } from '@/lib/gmail';
import { verifyOAuthState, readOAuthNonceCookie, clearOAuthNonceCookie } from '@/lib/oauth-state';
import { encryptToken } from '@/lib/email/token-crypto';
import { shouldWriteLegacyGmailTokens, PROVIDER_TYPE_ALIASES } from '@/lib/email/oauth-connections';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';
  const returnPath = '/dashboard/profile';

  // Every response from here on clears the one-time nonce cookie.
  const redirect = (to: string) => clearOAuthNonceCookie(NextResponse.redirect(to), 'gmail');

  if (error) {
    console.error('[google-callback] OAuth error:', error);
    return redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Google: ' + error)}`
    );
  }

  if (!code || !state) {
    console.error('[google-callback] Missing code or state');
    return redirect(`${baseUrl}${returnPath}?error=missing_params`);
  }

  // The authenticated session must exist before anything else.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[google-callback] Not logged in');
    return redirect(`${baseUrl}/auth/login`);
  }

  // Signed state: HMAC, purpose, 15 minute expiry, nonce matches the
  // httpOnly cookie set when this flow started, and the user id in the
  // state is the logged-in user. Previously only the user id was
  // compared and the timestamp was never checked.
  const check = verifyOAuthState(state, {
    purpose: 'gmail',
    nonceCookie: readOAuthNonceCookie(request, 'gmail'),
    sessionUserId: user.id,
  });
  if (!check.ok) {
    console.error('[google-callback] Rejected OAuth state:', check.reason);
    return redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Gmail connection could not be verified. Please try connecting again.')}`
    );
  }

  try {
    console.log('[google-callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForTokens(code);
    console.log('[google-callback] Got tokens for:', tokens.email);

    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = createAdminClient(
      (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
      (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    );

    // 1. Legacy gmail_tokens row (one per user). Scanning no longer reads
    // it; it is kept for old readers only. Only (re)written when there is
    // no row yet, when it is this same mailbox, or when it points at a
    // mailbox that is no longer connected, so linking a second Gmail does
    // not repoint it.
    if (await shouldWriteLegacyGmailTokens(admin, user.id, tokens.email)) {
      const { error: gmailErr } = await admin.from('gmail_tokens').upsert({
        user_id: user.id,
        email: tokens.email,
        access_token: encryptToken(tokens.access_token),
        // Omitted (not nulled) when Google sends none, as before.
        ...(tokens.refresh_token ? { refresh_token: encryptToken(tokens.refresh_token) } : {}),
        token_expiry: expiry,
        scopes: 'gmail.readonly userinfo.email',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (gmailErr) {
        console.error('[google-callback] gmail_tokens upsert error:', gmailErr);
      }
    }

    // 2. Save to email_connections (unified connection display).
    // IMPORTANT: only clear a row with the SAME email address so that
    // reconnecting account A doesn't wipe account B. Users can have any
    // number of Gmail accounts linked simultaneously.
    await admin.from('email_connections')
      .delete()
      .eq('user_id', user.id)
      // Older rows are labelled 'gmail'; clear those too or the insert
      // below hits the (user_id, email_address) unique constraint.
      .in('provider_type', PROVIDER_TYPE_ALIASES.google)
      .eq('email_address', tokens.email);

    const { error: connErr } = await admin.from('email_connections').insert({
      user_id: user.id,
      email_address: tokens.email,
      provider_type: 'google',
      auth_method: 'oauth',
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token || null),
      token_expiry: expiry,
      status: 'active',
    });

    if (connErr) {
      console.error('[google-callback] email_connections insert error:', connErr);
      // Don't fail the redirect; the error is logged for follow-up.
    }

    console.log('[google-callback] Successfully saved Gmail connection for', tokens.email);
    return redirect(`${baseUrl}${returnPath}?gmail_connected=true`);
  } catch (err: any) {
    console.error('[google-callback] Error:', err.message, err.stack);
    return redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Gmail connection failed: ' + err.message)}`
    );
  }
}
