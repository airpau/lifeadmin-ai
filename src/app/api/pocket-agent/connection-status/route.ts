import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

/**
 * Returns whether the authenticated user has any active Pocket Agent
 * sessions (Telegram and/or WhatsApp).
 *
 * Why a server route: telegram_sessions and whatsapp_sessions are
 * protected by RLS that does not permit the browser/anon Supabase
 * client to read other users' rows — and in some environments not even
 * the authenticated user's own rows directly. We therefore use the
 * service-role client server-side, after verifying the caller's
 * Supabase auth cookie, and scope the lookup to the resolved user.id.
 *
 * Mirrors the active-session predicates used by
 * src/lib/pocket-agent/dispatch.ts:
 *   telegram_sessions: is_active = true
 *   whatsapp_sessions: is_active = true AND opted_out_at IS NULL
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { telegram: false, whatsapp: false },
      { status: 401 }
    );
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [{ count: tg }, { count: wa }] = await Promise.all([
    admin
      .from('telegram_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true),
    admin
      .from('whatsapp_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('opted_out_at', null),
  ]);

  return NextResponse.json({
    telegram: (tg ?? 0) > 0,
    whatsapp: (wa ?? 0) > 0,
  });
}
