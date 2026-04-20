import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Handles Supabase PKCE email confirmation links.
 *
 * When Supabase is configured for the PKCE flow (default since Supabase auth v2),
 * all magic links and password-reset emails arrive as:
 *
 *   /auth/confirm?token_hash=<hash>&type=<type>&next=<path>
 *
 * We exchange the token_hash for a session here (server-side) then redirect:
 *  - type=recovery  → /auth/reset-password  (so the user can set a new password)
 *  - type=email_change / signup → next (defaults to /dashboard)
 *
 * Without this route, clicking the reset link returns a 404 and the user cannot
 * recover their password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as 'recovery' | 'email_change' | 'signup' | null;
  const next = searchParams.get('next') ?? '/dashboard';

  if (!tokenHash || !type) {
    return NextResponse.redirect(`${origin}/auth/login?error=Invalid+confirmation+link`);
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) {
    console.error('[auth/confirm] OTP verification failed:', error.message);
    if (type === 'recovery') {
      return NextResponse.redirect(
        `${origin}/auth/forgot-password?error=${encodeURIComponent('Reset link expired or already used. Please request a new one.')}`
      );
    }
    return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`);
  }

  // On recovery, the session is now set — redirect to reset-password page
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/reset-password`);
  }

  // For signup/email_change, redirect to the intended destination
  return NextResponse.redirect(`${origin}${next}`);
}
