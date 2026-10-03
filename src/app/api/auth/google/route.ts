import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/gmail';
import { PLAN_LIMITS, getEffectiveTier } from '@/lib/plan-limits';
import { createOAuthState, setOAuthNonceCookie } from '@/lib/oauth-state';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Enforce tier email-connection cap (Free=1, Essential=3, Pro=∞).
  // Counts active email_connections across Gmail + Outlook/IMAP.
  const tier = await getEffectiveTier(user.id);
  const maxEmails = PLAN_LIMITS[tier].maxEmails;
  if (maxEmails !== null) {
    const { data: existing } = await supabase
      .from('email_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active');
    const count = existing?.length ?? 0;
    if (count >= maxEmails) {
      const errorCopy =
        tier === 'free'
          ? `Free plan allows ${maxEmails} email connection. Upgrade to Essential for 3, or Pro for unlimited.`
          : `Essential plan allows ${maxEmails} email connections. Upgrade to Pro for unlimited.`;
      // Redirect back to profile with a flag the page can read to show an
      // upgrade prompt — avoids dropping the user on a JSON error.
      const back = new URL('/dashboard/profile', request.url);
      back.searchParams.set('email_limit_reached', '1');
      back.searchParams.set('tier', tier);
      back.searchParams.set('max_emails', String(maxEmails));
      console.log(`[google-auth] email cap reached for tier=${tier}: ${errorCopy}`);
      return NextResponse.redirect(back);
    }
  }

  // Signed state + nonce cookie, verified in the callback (CSRF protection).
  const signed = createOAuthState(user.id, 'gmail');
  if (!signed) {
    return NextResponse.redirect(
      new URL(`/dashboard/profile?error=${encodeURIComponent('Gmail connection is temporarily unavailable. Please try again later.')}`, request.url),
    );
  }
  const res = NextResponse.redirect(getGoogleAuthUrl(signed.state));
  return setOAuthNonceCookie(res, 'gmail', signed.nonce);
}
