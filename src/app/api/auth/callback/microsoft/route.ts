import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { exchangeMicrosoftCode } from '@/lib/outlook';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard/scanner?error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/dashboard/scanner?error=missing_params', request.url));
  }

  let userId: string;
  try {
    userId = Buffer.from(state, 'base64').toString('utf-8').split(':')[0];
    if (!userId) throw new Error('Invalid state');
  } catch {
    return NextResponse.redirect(new URL('/dashboard/scanner?error=invalid_state', request.url));
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  try {
    const tokens = await exchangeMicrosoftCode(code);
    const expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const admin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    await admin.from('outlook_tokens').upsert({
      user_id: user.id,
      email: tokens.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: expiry,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    return NextResponse.redirect(new URL('/dashboard/scanner?outlook_connected=true', request.url));
  } catch (err: any) {
    console.error('Microsoft OAuth callback error:', err);
    return NextResponse.redirect(
      new URL('/dashboard/scanner?error=outlook_connection_failed', request.url)
    );
  }
}
