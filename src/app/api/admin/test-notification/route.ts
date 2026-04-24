/**
 * POST /api/admin/test-notification
 *
 * Admin-only. Sends a one-shot Telegram message via the unified
 * notification dispatcher so we can verify bot routing (PR #249)
 * without waiting for the next scheduled cron. Accepts an optional
 * target email so we can fire it to any user, defaulting to
 * ADMIN_EMAIL.
 *
 * Also direct-fires the same message via the user bot as a control,
 * so a failure in the dispatcher path doesn't leave us blind —
 * `direct.ok=true` means the token + chat_id work end-to-end, and
 * `dispatch.delivered=['telegram']` is what we expect from the
 * unified routing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron, ADMIN_EMAIL } from '@/lib/admin-auth';
import { sendNotification } from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const targetEmail = (body.email ?? ADMIN_EMAIL).toLowerCase();

  const admin = getAdmin();
  const { data: user } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', targetEmail)
    .maybeSingle();
  if (!user) return NextResponse.json({ error: `User ${targetEmail} not found` }, { status: 404 });

  const { data: session } = await admin
    .from('telegram_sessions')
    .select('telegram_chat_id, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  const stamp = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London' });
  const text = `🧪 *Paybacker test alert*\n\nIf you\'re reading this in the *Paybacker* bot (not Paybacker Assistant), the dispatcher routing fix is live.\n\nSent at ${stamp} BST.`;

  const dispatch = await sendNotification(admin as any, {
    userId: user.id,
    event: 'price_increase',
    telegram: { text },
    bypassQuietHours: true,
  });

  // Control path: fire directly via the user bot, same precedence
  // as dispatch.sendTelegram, so we can see whether the token + chat
  // pair work irrespective of the dispatcher.
  const token = process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  let direct: { ok: boolean; status?: number; error?: string } = { ok: false, error: 'no chat_id or token' };
  if (token && session?.telegram_chat_id) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: session.telegram_chat_id, text, parse_mode: 'Markdown' }),
      });
      direct = { ok: res.ok, status: res.status };
    } catch (err) {
      direct = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({
    ok: true,
    target: user.email,
    sentAt: stamp,
    sessionPresent: !!session,
    chatId: session?.telegram_chat_id ?? null,
    whichToken: process.env.TELEGRAM_USER_BOT_TOKEN ? 'TELEGRAM_USER_BOT_TOKEN' : 'TELEGRAM_BOT_TOKEN (fallback)',
    dispatch,
    direct,
  });
}
