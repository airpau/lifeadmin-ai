/**
 * Telegram Savings Milestone Cron
 *
 * Runs weekly (Sunday). Calculates total verified savings and sends a
 * celebratory message when the user crosses a milestone for the first time.
 *
 * Milestones: £50, £100, £250, £500, £1000, £2000, £5000
 * Each milestone is sent only once (tracked in notification_log).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isProPocketAgentEligible } from '@/lib/telegram/eligibility';
import { sendNotification } from '@/lib/notifications/dispatch';
import { loadUsersWithActiveWhatsApp } from '@/lib/telegram/whatsapp-dedup';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function fmt(amount: number): string {
  return `£${Math.abs(amount).toFixed(2)}`;
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

const MILESTONES = [50, 100, 250, 500, 1000, 2000, 5000];

const MILESTONE_MESSAGES: Record<number, string> = {
  50:   `That's your first saving — the snowball is rolling! ⛄`,
  100:  `Three figures saved — you're finding your rhythm! 🎯`,
  250:  `That's a weekend city break paid for 🏙️`,
  500:  `Half a grand back in your pocket — incredible! 🎉`,
  1000: `Four figures saved! That's a holiday fund 🌴`,
  2000: `Two thousand pounds! You're a financial powerhouse 💪`,
  5000: `Five grand saved with Paybacker. Absolutely legendary 🏆`,
};

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  if (!token) {
    console.warn('[telegram-savings-milestone] TELEGRAM_USER_BOT_TOKEN not set — skipping run');
    return NextResponse.json({ ok: true, skipped: true, reason: 'TELEGRAM_USER_BOT_TOKEN not set' });
  }

  const supabase = getAdmin();
  let sent = 0;
  const errors: string[] = [];

  // Get all active sessions
  const { data: sessions } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .eq('is_active', true);

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  // Filter to Pro users (includes onboarding trial users)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at')
    .in('id', sessions.map((s) => s.user_id));

  // Eligibility helper handles past_due / unpaid / incomplete (Stripe
  // retry window) so users keep getting alerts during the 7-day grace
  // before auto-demotion. See lib/telegram/eligibility.ts.
  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => isProPocketAgentEligible(p))
      .map((p) => p.id),
  );

  // Dedup user-facing alerts (2026-05-17): drop Telegram for WhatsApp users.
  const waUserIds = await loadUsersWithActiveWhatsApp(supabase);
  const proSessions = sessions
    .filter((s) => proUserIds.has(s.user_id))
    .filter((s) => !waUserIds.has(s.user_id));
  if (proSessions.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  // Check alert preferences — respect users who opted out of proactive alerts
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, proactive_alerts')
    .in('user_id', proSessions.map((s) => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));
  const eligible = proSessions.filter((s) => {
    const pref = prefMap.get(s.user_id);
    return !pref || pref.proactive_alerts !== false;
  });

  for (const session of eligible) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Total verified savings from verified_savings table
      const { data: savings } = await supabase
        .from('verified_savings')
        .select('amount_saved')
        .eq('user_id', userId);

      const totalSaved = (savings ?? []).reduce((sum, s) => sum + (Number(s.amount_saved) || 0), 0);
      if (totalSaved <= 0) continue;

      // Which milestones has the user crossed?
      const crossedMilestones = MILESTONES.filter((m) => totalSaved >= m);
      if (crossedMilestones.length === 0) continue;

      // Check which have already been celebrated
      const { data: existing } = await supabase
        .from('notification_log')
        .select('reference_key')
        .eq('user_id', userId)
        .eq('notification_type', 'savings_milestone');

      const celebrated = new Set((existing ?? []).map((e) => e.reference_key));
      const newMilestones = crossedMilestones.filter(
        (m) => !celebrated.has(`milestone_${m}`),
      );

      if (newMilestones.length === 0) continue;

      // Celebrate the highest new milestone
      const highest = newMilestones[newMilestones.length - 1];
      const flavour = MILESTONE_MESSAGES[highest] ?? `Keep going — the next milestone is within reach!`;

      // Find next milestone to set a goal
      const nextIdx = MILESTONES.findIndex((m) => m > highest);
      const nextMilestone = nextIdx >= 0 ? MILESTONES[nextIdx] : null;
      const toNext = nextMilestone ? nextMilestone - totalSaved : null;

      let message =
        `🎉 *Savings Milestone: ${fmt(highest)}!*\n\n` +
        `${flavour}\n\n` +
        `*Total saved with Paybacker: ${fmt(totalSaved)}*\n`;

      if (toNext !== null && nextMilestone !== null) {
        message += `\nNext milestone: ${fmt(nextMilestone)} — just ${fmt(toNext)} to go! 🚀`;
      }

      message += `\n\n_Keep disputing, cancelling, and saving — you're doing brilliantly 💪_`;

      const ok = await sendTelegramMessage(token, Number(chatId), message);
      if (ok) {
        sent++;
        // Mark all new milestones as celebrated (insert one by one, ignoring conflicts)
        for (const m of newMilestones) {
          await supabase.from('notification_log').insert({
            user_id: userId,
            notification_type: 'savings_milestone',
            reference_key: `milestone_${m}`,
          }).select().single();
        }
      } else {
        errors.push(`Failed chat ${chatId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-savings-milestone] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  // ----------------------------------------------------------------
  // WhatsApp pass — fire the Meta-approved
  // `paybacker_savings_goal_milestone` template against the user's
  // active savings goals when they cross a milestone band. Distinct
  // from the rotating £-amount milestones (50/100/250/...) above —
  // these are explicit user-set goals.
  // ----------------------------------------------------------------
  let waSent = 0;
  const { data: waSessions } = await supabase
    .from('whatsapp_sessions')
    .select('user_id, whatsapp_phone')
    .eq('is_active', true)
    .is('opted_out_at', null);

  if (waSessions && waSessions.length > 0) {
    const waUserIds = waSessions.map((s) => s.user_id);
    const { data: waProfiles } = await supabase
      .from('profiles')
      .select(
        'id, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at',
      )
      .in('id', waUserIds);
    const waProIds = new Set(
      (waProfiles ?? []).filter((p) => isProPocketAgentEligible(p)).map((p) => p.id),
    );

    for (const session of waSessions) {
      if (!waProIds.has(session.user_id)) continue;

      try {
        const { data: savings } = await supabase
          .from('verified_savings')
          .select('amount_saved')
          .eq('user_id', session.user_id);
        const totalSaved = (savings ?? []).reduce(
          (s, r) => s + (Number(r.amount_saved) || 0),
          0,
        );
        if (totalSaved <= 0) continue;

        const crossed = MILESTONES.filter((m) => totalSaved >= m);
        if (crossed.length === 0) continue;

        const { data: existing } = await supabase
          .from('notification_log')
          .select('reference_key')
          .eq('user_id', session.user_id)
          .eq('notification_type', 'savings_milestone_wa');
        const celebrated = new Set((existing ?? []).map((e) => e.reference_key));
        const newOnes = crossed.filter((m) => !celebrated.has(`milestone_${m}`));
        if (newOnes.length === 0) continue;

        const highest = newOnes[newOnes.length - 1];
        const pct =
          newOnes.length > 0
            ? Math.min(100, Math.round((totalSaved / (MILESTONES[MILESTONES.findIndex((m) => m === highest) + 1] ?? highest * 2)) * 100))
            : 100;

        // Template variables: goal_name, percent, amount_saved, target_amount
        const result = await sendNotification(supabase, {
          userId: session.user_id,
          event: 'savings_milestone',
          whatsapp: {
            templateName: 'paybacker_savings_goal_milestone',
            templateParameters: [
              `£${highest} saved`,
              String(pct),
              `£${totalSaved.toFixed(2)}`,
              `£${highest.toFixed(2)}`,
            ],
          },
        });

        if (result.delivered.includes('whatsapp')) {
          waSent++;
          for (const m of newOnes) {
            await supabase
              .from('notification_log')
              .insert({
                user_id: session.user_id,
                notification_type: 'savings_milestone_wa',
                reference_key: `milestone_${m}`,
              })
              .select()
              .single();
          }
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        console.error(`[telegram-savings-milestone][wa] ${session.user_id}: ${m}`);
        errors.push(`wa:${session.user_id}: ${m}`);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, waSent, errors: errors.length });
}
