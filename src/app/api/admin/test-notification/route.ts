/**
 * POST /api/admin/test-notification
 *
 * Admin-only. Sends a one-shot Telegram message via the unified
 * notification dispatcher so we can verify bot routing (PR #249)
 * without waiting for the next scheduled cron. Accepts an optional
 * target email so we can fire it to any user, defaulting to
 * ADMIN_EMAIL.
 *
 * Uses the `support_reply` event as the dispatch event type because
 * it has sensible channel defaults and a low false-positive cost.
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

  const stamp = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London' });
  const result = await sendNotification(admin as any, {
    userId: user.id,
    event: 'support_reply',
    telegram: {
      text: `🧪 *Paybacker test alert*\n\nIf you\'re reading this in the *Paybacker* bot (not Paybacker Assistant), the dispatcher routing fix is live.\n\nSent at ${stamp} BST.`,
    },
    bypassQuietHours: true,
  });

  return NextResponse.json({
    ok: true,
    target: user.email,
    sentAt: stamp,
    result,
    whichToken: process.env.TELEGRAM_USER_BOT_TOKEN ? 'TELEGRAM_USER_BOT_TOKEN' : 'TELEGRAM_BOT_TOKEN (fallback)',
  });
}
