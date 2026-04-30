import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMicrosoftAuthUrl } from '@/lib/outlook';
import { PLAN_LIMITS, getEffectiveTier } from '@/lib/plan-limits';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  if (!process.env.MICROSOFT_CLIENT_ID) {
    return NextResponse.redirect(
      new URL('/dashboard/profile?error=outlook_not_configured', request.url)
    );
  }

  // Same tier cap as Gmail — counts active email_connections across providers.
  const tier = await getEffectiveTier(user.id);
  const maxEmails = PLAN_LIMITS[tier].maxEmails;
  if (maxEmails !== null) {
    const { data: existing } = await supabase
      .from('email_connections')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active');
    if ((existing?.length ?? 0) >= maxEmails) {
      const back = new URL('/dashboard/profile', request.url);
      back.searchParams.set('email_limit_reached', '1');
      back.searchParams.set('tier', tier);
      back.searchParams.set('max_emails', String(maxEmails));
      return NextResponse.redirect(back);
    }
  }

  const state = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
  return NextResponse.redirect(getMicrosoftAuthUrl(state));
}
