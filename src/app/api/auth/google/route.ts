import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // State = base64(userId:timestamp) — verified in callback to prevent CSRF
  const state = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
  const authUrl = getGoogleAuthUrl(state);

  return NextResponse.redirect(authUrl);
}
