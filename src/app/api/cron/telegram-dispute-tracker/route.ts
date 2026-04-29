/**
 * Telegram Dispute Tracker Cron
 *
 * Runs daily at 9am. Checks active disputes and prompts follow-ups:
 * - If a letter was sent > 14 days ago with no response, suggest following up
 * - If approaching the 56-day (8-week) FCA/ombudsman deadline, alert urgently
 *
 * Uses notification_log to prevent spamming the same follow-up every day.
 * Only sends one follow-up alert every 7 days per dispute.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  const data = (await res.json()) as { ok: boolean };
  return data.ok;
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  if (!token) return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });

  const supabase = getAdmin();
  let sent = 0;
  const errors: string[] = [];

  const now = new Date();

  // 8-week FCA deadline = 56 days
  const FCA_DEADLINE_DAYS = 56;

  // ISO week number — used as the time bucket for reference keys so each new
  // week gets a fresh DB row rather than conflicting with the previous one.
  const isoWeek = (d: Date): number => {
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  };
  const weekKey = `w${isoWeek(now)}_${now.getFullYear()}`;

  // Get all active sessions
  const { data: sessions } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .eq('is_active', true);

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  // Filter to Pro users
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id')
    .in('id', sessions.map((s) => s.user_id));

  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => {
        const hasStripe = !!p.stripe_subscription_id;
        return (
          p.subscription_tier === 'pro' &&
          (hasStripe
            ? ['active', 'trialing'].includes(p.subscription_status ?? '')
            : p.subscription_status === 'trialing')
        );
      })
      .map((p) => p.id),
  );

  const proSessions = sessions.filter((s) => proUserIds.has(s.user_id));
  if (proSessions.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Check alert preferences
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, proactive_alerts, dispute_followups')
    .in('user_id', proSessions.map((s) => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));
  const eligible = proSessions.filter((s) => {
    const pref = prefMap.get(s.user_id);
    if (!pref) return true;
    return pref.proactive_alerts !== false && pref.dispute_followups !== false;
  });

  for (const session of eligible) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Get open/awaiting disputes
      const { data: disputes } = await supabase
        .from('disputes')
        .select('id, provider_name, issue_type, status, created_at, updated_at, disputed_amount')
        .eq('user_id', userId)
        .in('status', ['open', 'awaiting_response', 'escalated'])
        .order('created_at', { ascending: true });

      if (!disputes || disputes.length === 0) continue;

      for (const dispute of disputes) {
        const sentDate = new Date(dispute.created_at);
        const daysSinceSent = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));

        // Only track if > 14 days old
        if (daysSinceSent < 14) continue;

        const daysUntilFcaDeadline = FCA_DEADLINE_DAYS - daysSinceSent;
        const isUrgent = daysUntilFcaDeadline <= 14 && daysUntilFcaDeadline > 0;
        const isPastDeadline = daysUntilFcaDeadline <= 0;

        // Check if we already sent a follow-up for this dispute this ISO week.
        // Using a week-bucketed key (dispute.id + week number) means each week
        // gets a fresh unique row — old rows never block new ones, and within
        // a single week the unique constraint prevents duplicates.
        const refKey = `${dispute.id}_${weekKey}`;
        const { data: recentAlert } = await supabase
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'dispute_followup')
          .eq('reference_key', refKey)
          .single();

        if (recentAlert) continue; // Already sent this week

        let message: string;

        if (isPastDeadline) {
          message =
            `🚨 *${dispute.provider_name} complaint — FCA deadline passed*\n\n` +
            `You sent a complaint on ${fmtDate(dispute.created_at)} (${daysSinceSent} days ago).\n\n` +
            `The 8-week FCA response window has passed. You can now escalate to the relevant ombudsman:\n` +
            `• Energy: Energy Ombudsman (0330 440 1624)\n` +
            `• Telecoms: CISAS or Ombudsman Services\n` +
            `• Banking/Finance: Financial Ombudsman Service\n` +
            `• Other: Citizens Advice Consumer Helpline\n\n` +
            `_Ask me to "draft an ombudsman escalation letter for ${dispute.provider_name}"_`;
        } else if (isUrgent) {
          message =
            `⚠️ *${dispute.provider_name} complaint — ${daysUntilFcaDeadline} days until FCA deadline*\n\n` +
            `Sent on ${fmtDate(dispute.created_at)} (${daysSinceSent} days ago).\n\n` +
            `Under FCA rules, ${dispute.provider_name} must respond within 8 weeks. ` +
            `If you don't hear back by ${fmtDate(new Date(sentDate.getTime() + FCA_DEADLINE_DAYS * 24 * 60 * 60 * 1000).toISOString())}, ` +
            `you can escalate to the ombudsman.\n\n` +
            `_Ask me to send a follow-up letter or check your dispute status_`;
        } else {
          message =
            `📬 *${dispute.provider_name} — no response after ${daysSinceSent} days*\n\n` +
            `Your complaint sent on ${fmtDate(dispute.created_at)} has had no recorded response.\n\n` +
            `Under UK consumer law, companies should acknowledge complaints within 5 working days. ` +
            `You have ${daysUntilFcaDeadline} days before the 8-week FCA deadline.\n\n` +
            `_Ask me to "draft a follow-up letter to ${dispute.provider_name}" to escalate_`;
        }

        const ok = await sendTelegramMessage(token, Number(chatId), message);
        if (ok) {
          sent++;
          await supabase.from('notification_log').insert({
            user_id: userId,
            notification_type: 'dispute_followup',
            reference_key: refKey,
          }).select().single();
        } else {
          errors.push(`Failed chat ${chatId}`);
        }

        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-dispute-tracker] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
