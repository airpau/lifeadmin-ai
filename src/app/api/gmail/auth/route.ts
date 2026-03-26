import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/gmail';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/auth/login?redirect=/dashboard/scanner', process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk'));
    }

    const authUrl = getGoogleAuthUrl(user.id);
    return NextResponse.redirect(authUrl);
  } catch {
    return NextResponse.redirect(new URL('/dashboard/scanner?error=gmail_auth_failed', process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk'));
  }
}
