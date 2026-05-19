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
import { isProPocketAgentEligible } from '@/lib/telegram/eligibility';
import { loadUsersWithActiveWhatsApp } from '@/lib/telegram/whatsapp-dedup';
import { sendWhatsAppText } from '@/lib/whatsapp';

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

  // Soft Telegram gate — missing token is no longer fatal so the WhatsApp
  // dispatch block below can still run for WhatsApp Pocket Agent users.
  // Same pattern as the morning-summary P2 fix.
  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  const telegramEnabled = Boolean(token);

  const supabase = getAdmin();
  let sent = 0;
  let waSent = 0;
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

  // Load BOTH channel session lists — Telegram and WhatsApp are
  // independent transports. The dedup commit (2026-05-17) drops
  // Telegram for WhatsApp users, but didn't add a WhatsApp dispatch
  // pass — leaving WhatsApp users silent on dispute follow-ups, even
  // when their FCA 8-week deadline was a couple of days away. This
  // block restores parity.
  const [{ data: tgRows }, { data: waRows }] = await Promise.all([
    supabase
      .from('telegram_sessions')
      .select('user_id, telegram_chat_id')
      .eq('is_active', true),
    supabase
      .from('whatsapp_sessions')
      .select('user_id, whatsapp_phone, last_message_at')
      .eq('is_active', true)
      .is('opted_out_at', null),
  ]);
  const sessions = tgRows ?? [];
  const waSessions = waRows ?? [];

  if (sessions.length === 0 && waSessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  // Filter to Pro users (includes onboarding trial users) — union of both
  // channel session lists so each user is looked up once.
  const allUserIds = Array.from(
    new Set([...sessions.map((s) => s.user_id), ...waSessions.map((s) => s.user_id)]),
  );
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at')
    .in('id', allUserIds);

  // Eligibility helper handles past_due / unpaid / incomplete (Stripe
  // retry window) so users keep getting alerts during the 7-day grace
  // before auto-demotion. See lib/telegram/eligibility.ts.
  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => isProPocketAgentEligible(p))
      .map((p) => p.id),
  );

  // Dedup user-facing alerts (2026-05-17): drop Telegram-side sends for
  // any user with an active WhatsApp session. WhatsApp is the user-facing
  // Pocket Agent channel now; Telegram is reserved for admin / founder.
  const waUserIds = await loadUsersWithActiveWhatsApp(supabase);
  const proSessions = sessions
    .filter((s) => proUserIds.has(s.user_id))
    .filter((s) => !waUserIds.has(s.user_id));
  const proWaSessions = waSessions.filter((s) => proUserIds.has(s.user_id));

  if (proSessions.length === 0 && proWaSessions.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  // Check alert preferences — one row per user, both channels honour the
  // same `dispute_followups` flag.
  const eligibleUserIds = Array.from(
    new Set([
      ...proSessions.map((s) => s.user_id),
      ...proWaSessions.map((s) => s.user_id),
    ]),
  );
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, proactive_alerts, dispute_followups')
    .in('user_id', eligibleUserIds);

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));
  const prefAllows = (uid: string): boolean => {
    const pref = prefMap.get(uid);
    if (!pref) return true;
    return pref.proactive_alerts !== false && pref.dispute_followups !== false;
  };
  const eligible = proSessions.filter((s) => prefAllows(s.user_id));
  const waEligible = proWaSessions.filter((s) => prefAllows(s.user_id));

  // user_id -> { phone, lastInbound } so the per-dispute loop can fan
  // out to WhatsApp without re-querying.
  const waPhoneByUser = new Map<string, { phone: string; lastInbound: string | null }>();
  for (const s of waEligible) {
    waPhoneByUser.set(s.user_id, {
      phone: s.whatsapp_phone,
      lastInbound: s.last_message_at,
    });
  }
  // WhatsApp-only users (no Telegram session) — walk their disputes too
  // with a pseudo-session whose chatId is 0 so the Telegram send is
  // skipped but the WhatsApp send still fires.
  const telegramUserIds = new Set(eligible.map((s) => s.user_id));
  const waOnlyPseudoSessions = waEligible
    .filter((s) => !telegramUserIds.has(s.user_id))
    .map((s) => ({ user_id: s.user_id, telegram_chat_id: 0 }));
  const allSessionsToProcess = [...eligible, ...waOnlyPseudoSessions];

  for (const session of allSessionsToProcess) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Get open/awaiting disputes. The legacy filter caught only
      // open/awaiting_response/escalated, missing the agent state
      // machine's awaiting_user_input, responded, escalation_due and
      // still_open. Broaden the whitelist so disputes the agent has
      // advanced still get the FCA-deadline follow-up.
      const { data: disputes } = await supabase
        .from('disputes')
        .select('id, provider_name, issue_type, status, agent_state, created_at, updated_at, disputed_amount')
        .eq('user_id', userId)
        .in('status', [
          'open',
          'awaiting_response',
          'awaiting_user_input',
          'escalated',
          'responded',
          'escalation_due',
          'still_open',
        ])
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

        // Dispatch to both channels independently. The dedup helper
        // already removed WhatsApp users from `eligible`, so Telegram
        // only fires for users WITHOUT WhatsApp. WhatsApp dispatch
        // covers everyone with an active session, regardless of
        // Telegram. Only one notification_log row per dispute per week.
        let anyDelivered = false;

        if (telegramEnabled && token && chatId) {
          const ok = await sendTelegramMessage(token, Number(chatId), message);
          if (ok) {
            sent++;
            anyDelivered = true;
          } else {
            errors.push(`Failed chat ${chatId}`);
          }
        }

        // WhatsApp dispatch — only inside the 24h customer-service window
        // (free-form text). Outside the window we have no Meta-approved
        // dispute template yet (see template-registry.ts — most are
        // PENDING_RESUBMISSION) so we skip silently. The cron retries
        // next day; once the user messages us or a template lands the
        // alert flows.
        const waEntry = waPhoneByUser.get(userId);
        if (waEntry) {
          const insideWindow =
            waEntry.lastInbound &&
            Date.now() - new Date(waEntry.lastInbound).getTime() < 24 * 60 * 60 * 1000;
          if (insideWindow) {
            try {
              const waText = message.replace(/\*([^*\n]+)\*/g, '$1');
              await sendWhatsAppText({ to: waEntry.phone, text: waText });
              waSent++;
              anyDelivered = true;
            } catch (waErr) {
              const m = waErr instanceof Error ? waErr.message : String(waErr);
              errors.push(`wa:${userId}: ${m}`);
            }
          }
        }

        if (anyDelivered) {
          await supabase.from('notification_log').insert({
            user_id: userId,
            notification_type: 'dispute_followup',
            reference_key: refKey,
          }).select().single();
        }

        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-dispute-tracker] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    waSent,
    telegramEnabled,
    errors: errors.length,
  });
}
