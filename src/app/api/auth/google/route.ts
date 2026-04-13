import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/dashboard/scanner';

  // State = base64(JSON) — includes userId, timestamp, and returnTo
  const state = Buffer.from(JSON.stringify({
    userId: user.id,
    ts: Date.now(),
    returnTo,
  })).toString('base64');
  const authUrl = getGoogleAuthUrl(state);

  return NextResponse.redirect(authUrl);
}
