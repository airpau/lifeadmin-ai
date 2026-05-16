// src/app/api/cron/daily-audit/route.ts
// Vercel cron entry point. Schedule in vercel.json:
//   {
//     "crons": [
//       { "path": "/api/cron/daily-audit", "schedule": "0 6 * * *" }
//     ]
//   }
//
// What it does, in order:
//   1. Authenticates the cron call (CRON_SECRET).
//   2. Runs the daily audit.
//   3. For every linked admin user (founding_member = true, subscription_tier in ('pro','admin')),
//      looks up their telegram_chat_id and sends the summary with inline buttons.
//   4. For each fixable finding, writes a row to telegram_pending_actions so
//      that when the user taps the button, the existing webhook can pick it up
//      and run the registered fix (see src/app/api/telegram/audit-actions).
//   5. Always returns 200 with a structured report so Vercel logs are clean.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, sendTelegramMessage, type InlineKeyboard } from '@/lib/telegram';
import { runDailyAudit } from '@/lib/daily-audit';

// Vercel cron uses an Authorization: Bearer <CRON_SECRET> header.
// We also accept a ?token= query param for manual triggering during dev.
function isAuthorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('token') === expected) return true;
  return false;
}

// Hard-coded admin recipient: Paul. Add more here if you want the audit
// to fan out to the rest of the team.
const ADMIN_RECIPIENT_EMAILS = ['aireypaul@googlemail.com'];

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();

  // 1. Audit
  const audit = await runDailyAudit(admin);

  // 2. Find admin recipients with linked Telegram chats
  const { data: recipients } = await admin
    .from('profiles')
    .select('id, email, telegram_sessions!inner(telegram_chat_id, is_active)')
    .in('email', ADMIN_RECIPIENT_EMAILS)
    .eq('telegram_sessions.is_active', true);

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({
      ok: true,
      audit_summary: audit.summary_markdown,
      delivered_to: [],
      note: 'no admin recipients with active telegram_sessions',
    });
  }

  const delivered: Array<{ email: string; chat_id: number; message_id?: number }> = [];

  for (const recipient of recipients) {
    const chatId: number = (recipient as { telegram_sessions: Array<{ telegram_chat_id: number }> }).telegram_sessions[0].telegram_chat_id;

    // 3. Build the inline keyboard: one "Fix" button per fixable finding,
    //    plus a "Show details" button, plus a "Snooze" button.
    const keyboard: InlineKeyboard = [];
    for (const finding of audit.findings.filter(f => f.fixable)) {
      keyboard.push([
        { text: `🔧 Fix: ${finding.title.slice(0, 32)}`, callback_data: `audit:${finding.id}` },
      ]);
    }
    keyboard.push([
      { text: '📋 Show full report', callback_data: 'audit:show_details' },
      { text: '💤 Snooze 24h', callback_data: 'audit:snooze' },
    ]);

    // 4. For each fixable finding, register a pending action so the webhook
    //    knows what to do when the button is tapped. expires_at = 6h.
    if (audit.findings.some(f => f.fixable)) {
      const pending = audit.findings
        .filter(f => f.fixable)
        .map(f => ({
          user_id: (recipient as { id: string }).id,
          telegram_chat_id: chatId,
          action_type: f.id,
          payload: { title: f.title, detail: f.detail, severity: f.severity },
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
        }));
      const { error } = await admin.from('telegram_pending_actions').insert(pending);
      if (error) {
        console.error('telegram_pending_actions insert failed', error);
      }
    }

    // 5. Send the message
    const sendResult = await sendTelegramMessage(admin, {
      chatId,
      text: audit.summary_markdown,
      inlineKeyboard: keyboard,
    });

    delivered.push({
      email: (recipient as { email: string }).email,
      chat_id: chatId,
      message_id: sendResult.result?.message_id,
    });
  }

  // 6. Also write the handoff into the daily log table for in-app history.
  await admin.from('telegram_message_log').insert({
    chat_id: delivered[0]?.chat_id ?? null,
    direction: 'outbound',
    content: audit.summary_markdown,
    metadata: { source: 'daily-audit', findings_count: audit.findings.length },
  });

  return NextResponse.json({
    ok: true,
    generated_at: audit.generated_at,
    delivered_to: delivered,
    findings_count: audit.findings.length,
  });
}

