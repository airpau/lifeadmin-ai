import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { exchangeMicrosoftCode } from '@/lib/outlook';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDesc = searchParams.get('error_description');

  const baseUrl = 'https://paybacker.co.uk';

  if (error) {
    console.error('[outlook-callback] OAuth error:', error, errorDesc);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/scanner?error=${encodeURIComponent(errorDesc || error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/dashboard/scanner?error=no_code`);
  }

  // Verify user is logged in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${baseUrl}/auth/login?redirect=/dashboard/scanner`);
  }

  // If state was passed, verify it matches the user
  if (state) {
    try {
      const stateUserId = Buffer.from(state, 'base64').toString('utf-8');
      if (stateUserId !== user.id) {
        return NextResponse.redirect(`${baseUrl}/dashboard/scanner?error=state_mismatch`);
      }
    } catch {
      // State decoding failed - continue anyway if user is authenticated
    }
  }

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Save to email_connections table (unified email storage)
    await admin.from('email_connections').upsert({
      user_id: user.id,
      email_address: tokens.email,
      provider_type: 'outlook',
      auth_method: 'oauth',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      status: 'active',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,email_address' });

    return NextResponse.redirect(`${baseUrl}/dashboard/scanner?outlook_connected=true`);
  } catch (err: any) {
    console.error('[outlook-callback] Token exchange error:', err.message);
    return NextResponse.redirect(
      `${baseUrl}/dashboard/scanner?error=${encodeURIComponent(err.message || 'Connection failed')}`
    );
  }
}
