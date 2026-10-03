import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { exchangeMicrosoftCode } from '@/lib/outlook';
import { verifyOAuthState, readOAuthNonceCookie, clearOAuthNonceCookie } from '@/lib/oauth-state';
import { encryptToken } from '@/lib/email/token-crypto';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDesc = searchParams.get('error_description');

  const baseUrl = 'https://paybacker.co.uk';
  const returnPath = '/dashboard/profile';

  // Every response from here on clears the one-time nonce cookie.
  const redirect = (to: string) => clearOAuthNonceCookie(NextResponse.redirect(to), 'outlook');

  if (error) {
    console.error('[outlook-callback] OAuth error:', error, errorDesc);
    return redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Microsoft: ' + (errorDesc || error))}`
    );
  }

  if (!code) {
    return redirect(`${baseUrl}${returnPath}?error=${encodeURIComponent('No authorization code received from Microsoft')}`);
  }

  // Verify user is logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return redirect(`${baseUrl}${returnPath}?error=${encodeURIComponent('Not logged in. Please log in and try again.')}`);
  }

  // Signed state check (this callback previously never looked at state):
  // HMAC, purpose, 15 minute expiry, nonce cookie, and user id match.
  const check = verifyOAuthState(state, {
    purpose: 'outlook',
    nonceCookie: readOAuthNonceCookie(request, 'outlook'),
    sessionUserId: user.id,
  });
  if (!check.ok) {
    console.error('[outlook-callback] Rejected OAuth state:', check.reason);
    return redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Outlook connection could not be verified. Please try connecting again.')}`
    );
  }

  // Step 1: Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeMicrosoftCode(code);
  } catch (err: any) {
    console.error('[outlook-callback] Token exchange failed:', err.message);
    return redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Token exchange failed: ' + err.message)}`
    );
  }

  if (!tokens.email) {
    return redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Could not get email address from Microsoft account')}`
    );
  }

  // Step 2: Save to database
  try {
    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Only clear the row with the SAME email address so reconnecting one
    // Outlook account doesn't wipe other Outlook/Microsoft accounts the user
    // has linked. Multi-account is supported.
    await admin.from('email_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider_type', 'outlook')
      .eq('email_address', tokens.email);

    // Insert fresh connection
    const { error: insertError } = await admin.from('email_connections').insert({
      user_id: user.id,
      email_address: tokens.email,
      provider_type: 'outlook',
      auth_method: 'oauth',
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token || null),
      token_expiry: expiry,
      status: 'active',
    });

    if (insertError) {
      console.error('[outlook-callback] DB insert error:', insertError);
      return redirect(
        `${baseUrl}${returnPath}?error=${encodeURIComponent('Database error: ' + insertError.message)}`
      );
    }

    return redirect(`${baseUrl}${returnPath}?outlook_connected=true`);
  } catch (err: any) {
    console.error('[outlook-callback] Save error:', err.message);
    return redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Save failed: ' + err.message)}`
    );
  }
}
