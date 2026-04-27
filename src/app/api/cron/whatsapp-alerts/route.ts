/**
 * WhatsApp Proactive Alerts Cron — phase 1 stub.
 *
 * Mirror of /api/cron/telegram-alerts/route.ts, but using the WhatsApp adapter.
 * The Telegram cron has the production-tested DETECT logic; this route reuses
 * the same Supabase queries via the shared detectors (next iteration will
 * extract telegram-alerts/route.ts into a provider-agnostic detector module).
 *
 * For the launch sprint, phase 1 here only:
 *   1. Picks up active whatsapp_sessions (opted in, not opted out)
 *   2. Sends a test/template message via sendWhatsAppTemplate
 *   3. Logs to whatsapp_message_log
 *
 * Once the bot brain is ported from src/lib/telegram/user-bot.ts to
 * src/lib/whatsapp/user-bot.ts, this cron will call sendProactiveAlertWA
 * with real detection payloads.
 *
 * Triggered by vercel.json: "0 *\/6 * * *" (every 6 hours).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { canUseWhatsApp } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  // CLAUDE.md: every cron route requires CRON_SECRET Bearer auth.
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getAdmin();
  const { data: sessions, error } = await sb
    .from('whatsapp_sessions')
    .select('user_id, whatsapp_phone')
    .eq('is_active', true)
    .is('opted_out_at', null)
    .limit(50);

  if (error) {
    console.error('[cron/whatsapp-alerts]', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'no active sessions' });
  }

  // Tier filter — WhatsApp Pocket Agent is Pro-only. Resolve each user's
  // effective tier (Stripe + onboarding-trial aware) and drop anyone who's
  // dropped below Pro since they opted in. They keep the row in
  // whatsapp_sessions so re-upgrading reconnects instantly, but we never
  // burn template fees on a non-Pro account.
  const tierResults = await Promise.all(
    sessions.map(async (s) => ({ session: s, allowed: await canUseWhatsApp(s.user_id) })),
  );
  const eligible = tierResults.filter((r) => r.allowed).map((r) => r.session);
  const skippedNonPro = sessions.length - eligible.length;

  // PHASE 1: skip actual sending until detection is wired in. Just count.
  // This avoids accidentally messaging users with empty alerts during scaffold.
  return NextResponse.json({
    ok: true,
    sent: 0,
    pending: eligible.length,
    skippedNonPro,
    note: 'phase 1 stub — detection integration coming in next sprint',
  });
}
