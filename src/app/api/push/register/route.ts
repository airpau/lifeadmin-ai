/**
 * POST /api/push/register
 *
 * The native mobile shell calls this on launch once the user has
 * granted push-notification permission. Upserts by (user_id,
 * platform, token) so multiple devices per user work.
 *
 * Body: { token: string, platform: 'ios' | 'android', device_name?: string }
 *
 * Auth: session cookie — the app loads paybacker.co.uk in a
 * WebView, so the user's Supabase session travels naturally.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  token?: string;
  platform?: 'ios' | 'android';
  device_name?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const token = (body.token ?? '').trim();
  const platform = body.platform;
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 });
  if (platform !== 'ios' && platform !== 'android') {
    return NextResponse.json({ error: "platform must be 'ios' or 'android'" }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: user.id,
        platform,
        token,
        device_name: body.device_name ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform,token' },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
