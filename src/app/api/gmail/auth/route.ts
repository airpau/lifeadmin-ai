import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getGoogleAuthUrl } from '@/lib/gmail';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/auth/login?redirect=/dashboard/profile', process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk'));
    }

    // State must be base64(userId:timestamp) — matches what the callback expects
    const state = Buffer.from(`${user.id}:${Date.now()}`).toString('base64');
    const authUrl = getGoogleAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch {
    return NextResponse.redirect(new URL('/dashboard/profile?error=gmail_auth_failed', process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk'));
  }
}
