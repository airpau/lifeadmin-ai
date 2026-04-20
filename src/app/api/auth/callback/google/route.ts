import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { exchangeCodeForTokens } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk';
  const returnPath = '/dashboard/profile';

  if (error) {
    console.error('[google-callback] OAuth error:', error);
    return NextResponse.redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Google: ' + error)}`
    );
  }

  if (!code || !state) {
    console.error('[google-callback] Missing code or state');
    return NextResponse.redirect(`${baseUrl}${returnPath}?error=missing_params`);
  }

  // Verify state contains a valid user ID
  let userId: string;
  try {
    const decoded = Buffer.from(state, 'base64').toString('utf-8');
    userId = decoded.split(':')[0];
    if (!userId) throw new Error('Invalid state');
  } catch {
    console.error('[google-callback] Invalid state parameter');
    return NextResponse.redirect(`${baseUrl}${returnPath}?error=invalid_state`);
  }

  // Double-check the authenticated session matches
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    console.error('[google-callback] User mismatch or not logged in');
    return NextResponse.redirect(`${baseUrl}/auth/login`);
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

    // 1. Save to gmail_tokens (used by Gmail scanning functions)
    const { error: gmailErr } = await admin.from('gmail_tokens').upsert({
      user_id: user.id,
      email: tokens.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      scopes: 'gmail.readonly userinfo.email',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (gmailErr) {
      console.error('[google-callback] gmail_tokens upsert error:', gmailErr);
    }

    // 2. Save to email_connections (unified connection display on Scanner page)
    // Delete any existing Google connection first
    await admin.from('email_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('provider_type', 'google');

    const { error: connErr } = await admin.from('email_connections').insert({
      user_id: user.id,
      email_address: tokens.email,
      provider_type: 'google',
      auth_method: 'oauth',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expiry: expiry,
      status: 'active',
    });

    if (connErr) {
      console.error('[google-callback] email_connections insert error:', connErr);
      // Don't fail — gmail_tokens is the primary store
    }

    console.log('[google-callback] Successfully saved Gmail connection for', tokens.email);
    return NextResponse.redirect(`${baseUrl}${returnPath}?gmail_connected=true`);
  } catch (err: any) {
    console.error('[google-callback] Error:', err.message, err.stack);
    return NextResponse.redirect(
      `${baseUrl}${returnPath}?error=${encodeURIComponent('Gmail connection failed: ' + err.message)}`
    );
  }
}
