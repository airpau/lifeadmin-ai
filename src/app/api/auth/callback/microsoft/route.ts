import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { exchangeMicrosoftCode } from '@/lib/outlook';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDesc = searchParams.get('error_description');

  const baseUrl = 'https://paybacker.co.uk';
  const returnPath = '/dashboard/profile';

  if (error) {
    console.error('[outlook-callback] OAuth error:', error, errorDesc);
    return NextResponse.redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Microsoft: ' + (errorDesc || error))}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}${returnPath}?error=${encodeURIComponent('No authorization code received from Microsoft')}`);
  }

  // Verify user is logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${baseUrl}${returnPath}?error=${encodeURIComponent('Not logged in. Please log in and try again.')}`);
  }

  // Step 1: Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeMicrosoftCode(code);
  } catch (err: any) {
    console.error('[outlook-callback] Token exchange failed:', err.message);
    return NextResponse.redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Token exchange failed: ' + err.message)}`
    );
  }

  if (!tokens.email) {
    return NextResponse.redirect(
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

    // Delete any existing outlook connection for this user first
    await admin.from('email_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider_type', 'outlook');

    // Insert fresh connection
    const { error: insertError } = await admin.from('email_connections').insert({
      user_id: user.id,
      email_address: tokens.email,
      provider_type: 'outlook',
      auth_method: 'oauth',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expiry: expiry,
      status: 'active',
    });

    if (insertError) {
      console.error('[outlook-callback] DB insert error:', insertError);
      return NextResponse.redirect(
        `${baseUrl}${returnPath}?error=${encodeURIComponent('Database error: ' + insertError.message)}`
      );
    }

    return NextResponse.redirect(`${baseUrl}${returnPath}?outlook_connected=true`);
  } catch (err: any) {
    console.error('[outlook-callback] Save error:', err.message);
    return NextResponse.redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Save failed: ' + err.message)}`
    );
  }
}
