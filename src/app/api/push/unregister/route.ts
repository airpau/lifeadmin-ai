/**
 * POST /api/push/unregister
 *
 * Called by the mobile shell on sign-out (and during app account
 * switching) so the previous user doesn't keep receiving the next
 * user's pushes on the same device.
 *
 * Body: { token: string }
 *   The shell only knows the token it was issued. We delete by
 *   (user_id, token) so an attacker who guesses someone else's
 *   token can only delete it from THEIR own account — no one
 *   else's. RLS on push_tokens enforces user_id ownership too.
 *
 * Auth: session cookie (same as /api/push/register).
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  token?: string;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const token = (body.token ?? '').trim();
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  // Delete just the (user, token) pair — leave any other rows for
  // this user untouched (they may have multiple devices).
  const { error, count } = await supabase
    .from('push_tokens')
    .delete({ count: 'exact' })
    .eq('user_id', user.id)
    .eq('token', token);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, removed: count ?? 0 });
}
