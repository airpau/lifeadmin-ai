import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMicrosoftAuthUrl } from '@/lib/outlook';
import { createOAuthState, setOAuthNonceCookie } from '@/lib/oauth-state';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/auth/login?redirect=/dashboard/profile', process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk'));
    }

    // Legacy entry point, kept working: same signed state + nonce cookie
    // as /api/auth/microsoft, which the callback now requires.
    const signed = createOAuthState(user.id, 'outlook');
    if (!signed) throw new Error('OAuth state secret not configured');
    return setOAuthNonceCookie(NextResponse.redirect(getMicrosoftAuthUrl(signed.state)), 'outlook', signed.nonce);
  } catch {
    return NextResponse.redirect(new URL('/dashboard/profile?error=outlook_auth_failed', process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk'));
  }
}
