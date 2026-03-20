import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMicrosoftAuthUrl } from '@/lib/outlook';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  if (!process.env.MICROSOFT_CLIENT_ID) {
    return NextResponse.redirect(
      new URL('/dashboard/scanner?error=outlook_not_configured', request.url)
    );
  }

  const state = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
  return NextResponse.redirect(getMicrosoftAuthUrl(state));
}
