/**
 * WhatsApp Proactive Alerts Cron — restored 2026-05-14.
 *
 * Multi-template fan-out for alert types that don't have their own
 * detection cron. Pulls signal directly from Supabase and fires the
 * Meta-approved template via the unified `sendNotification` dispatcher.
 *
 * Templates wired here (one per detection path):
 *   • paybacker_alert_unusual_charge   — bank charge >20% above merchant rolling avg
 *   • paybacker_alert_trial_ending     — subscription with free-trial ending in ≤3 days
 *   • paybacker_outcome_check          — T+7d follow-up nudge after a dispute is sent
 *
 * Templates handled elsewhere (DON'T duplicate them here):
 *   • paybacker_alert_price_increase  — /api/cron/price-increases
 *   • paybacker_alert_renewal         — /api/cron/renewal-reminders + contract-expiry-alerts
 *   • paybacker_dispute_reply         — /api/cron/dispute-reply-sync (watchdog)
 *   • paybacker_money_recovered       — /api/disputes/[id] PATCH
 *   • paybacker_complaint_letter_ready — /api/complaints/generate
 *   • paybacker_budget_alert          — /api/cron/telegram-budget-alerts (WhatsApp pass)
 *   • paybacker_morning_summary       — /api/cron/telegram-morning-summary (WhatsApp pass)
 *   • paybacker_recovery_total_weekly — /api/cron/telegram-weekly-summary (WhatsApp pass)
 *   • paybacker_savings_goal_milestone — /api/cron/telegram-savings-milestone (WhatsApp pass)
 *   • paybacker_reconnect_required    — /api/cron/consent-renewal
 *   • paybacker_welcome               — /api/whatsapp/webhook (on link-code redeem)
 *
 * Triggered by vercel.json every 6 hours.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canUseWhatsApp } from '@/lib/plan-limits';
import { sendNotification } from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface AlertCounts {
  unusual_charge: number;
  trial_ending: number;
  outcome_check: number;
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getAdmin();
  const counts: AlertCounts = {
    unusual_charge: 0,
    trial_ending: 0,
    outcome_check: 0,
  };
  const errors: string[] = [];

  // -------------------------------------------------------
  // Eligible WhatsApp Pro users in scope.
  // -------------------------------------------------------
  const { data: sessions, error: sessErr } = await sb
    .from('whatsapp_sessions')
    .select('user_id, whatsapp_phone')
    .eq('is_active', true)
    .is('opted_out_at', null);

  if (sessErr) {
    console.error('[cron/whatsapp-alerts]', sessErr);
    return NextResponse.json({ ok: false, error: sessErr.message }, { status: 500 });
  }
  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, counts, reason: 'no active sessions' });
  }

  const tierResults = await Promise.all(
    sessions.map(async (s) => ({ session: s, allowed: await canUseWhatsApp(s.user_id) })),
  );
  const eligibleSessions = tierResults.filter((r) => r.allowed).map((r) => r.session);

  // -------------------------------------------------------
  // Detection windows
  // -------------------------------------------------------
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const in3DaysStr = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  for (const session of eligibleSessions) {
    const userId = session.user_id;

    // ============================================================
    // 1) TRIAL ENDING — paid trials ending in next 3 days
    // ============================================================
    try {
      const { data: trials } = await sb
        .from('subscriptions')
        .select('id, provider_name, amount, billing_cycle, contract_end_date')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('contract_end_date', 'is', null)
        .gte('contract_end_date', todayStr)
        .lte('contract_end_date', in3DaysStr)
        .ilike('notes', '%trial%')
        .limit(5);

      for (const trial of trials ?? []) {
        // Idempotency per subscription per window
        const { data: alreadyAlerted } = await sb
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'trial_ending')
          .eq('reference_key', String(trial.id))
          .maybeSingle();
        if (alreadyAlerted) continue;

        const daysLeft = Math.max(
          1,
          Math.ceil(
            (new Date(trial.contract_end_date).getTime() - now.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );

        const result = await sendNotification(sb, {
          userId,
          event: 'trial_ending',
          telegram: {
            text:
              `⏰ *Trial ending in ${daysLeft} days*\n\n` +
              `*${trial.provider_name}* will auto-charge £${Number(trial.amount).toFixed(2)} on ${new Date(trial.contract_end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.\n\n` +
              `Reply "cancel ${trial.provider_name}" to draft a cancellation letter, or open Paybacker → Subscriptions.`,
          },
          whatsapp: {
            templateName: 'paybacker_alert_trial_ending',
            templateParameters: [
              trial.provider_name,
              String(daysLeft),
              `£${Number(trial.amount).toFixed(2)}`,
            ],
          },
          push: {
            title: 'Trial ending soon',
            body: `${trial.provider_name} charges in ${daysLeft} days`,
          },
        });

        if (result.delivered.length > 0) {
          counts.trial_ending++;
          await sb.from('notification_log').insert({
            user_id: userId,
            notification_type: 'trial_ending',
            reference_key: String(trial.id),
          });
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-alerts][trial_ending][${userId}] ${m}`);
      errors.push(`trial:${userId}: ${m}`);
    }

    // ============================================================
    // 2) UNUSUAL CHARGE — bank tx in last 24h that's >=20% above the
    //    merchant's 90-day rolling average
    // ============================================================
    try {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentCharges } = await sb
        .from('bank_transactions')
        .select('id, merchant_normalized, merchant_name, amount, timestamp')
        .eq('user_id', userId)
        .lt('amount', 0)
        .gte('timestamp', oneDayAgo)
        .not('merchant_normalized', 'is', null)
        .limit(50);

      for (const charge of recentCharges ?? []) {
        if (!charge.merchant_normalized) continue;
        const currentAmount = Math.abs(Number(charge.amount));
        if (currentAmount < 5) continue; // ignore tiny charges

        // 90-day rolling average for this merchant
        const { data: history } = await sb
          .from('bank_transactions')
          .select('amount, timestamp')
          .eq('user_id', userId)
          .eq('merchant_normalized', charge.merchant_normalized)
          .lt('amount', 0)
          .gte('timestamp', ninetyDaysAgo)
          .lt('timestamp', oneDayAgo)
          .limit(50);

        if (!history || history.length < 3) continue;
        const avg = history.reduce((s, r) => s + Math.abs(Number(r.amount)), 0) / history.length;
        if (avg === 0) continue;
        const percentHigher = Math.round(((currentAmount - avg) / avg) * 100);
        if (percentHigher < 20) continue;

        const { data: alreadyAlerted } = await sb
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'unusual_charge')
          .eq('reference_key', String(charge.id))
          .maybeSingle();
        if (alreadyAlerted) continue;

        const merchantLabel = charge.merchant_name || charge.merchant_normalized;
        const result = await sendNotification(sb, {
          userId,
          event: 'unusual_charge',
          telegram: {
            text:
              `🚨 *Unusual charge from ${merchantLabel}*\n\n` +
              `*£${currentAmount.toFixed(2)}* — ${percentHigher}% higher than your usual £${avg.toFixed(2)}.\n\n` +
              `Open Paybacker → Money Hub to investigate or dispute.`,
          },
          whatsapp: {
            templateName: 'paybacker_alert_unusual_charge',
            templateParameters: [
              merchantLabel,
              `£${currentAmount.toFixed(2)}`,
              `£${avg.toFixed(2)}`,
              String(percentHigher),
            ],
          },
          push: {
            title: 'Unusual charge detected',
            body: `${merchantLabel}: £${currentAmount.toFixed(2)} (+${percentHigher}%)`,
          },
        });

        if (result.delivered.length > 0) {
          counts.unusual_charge++;
          await sb.from('notification_log').insert({
            user_id: userId,
            notification_type: 'unusual_charge',
            reference_key: String(charge.id),
          });
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-alerts][unusual_charge][${userId}] ${m}`);
      errors.push(`unusual:${userId}: ${m}`);
    }

    // ============================================================
    // 3) OUTCOME CHECK — T+7d nudge for disputes still open
    // ============================================================
    try {
      const { data: opens } = await sb
        .from('disputes')
        .select('id, provider_name, issue_type, created_at, status')
        .eq('user_id', userId)
        .gte('created_at', eightDaysAgo)
        .lt('created_at', sevenDaysAgo)
        .not('status', 'in', '(resolved_won,resolved_lost,resolved_partial,withdrawn,closed,dismissed)')
        .limit(10);

      for (const dispute of opens ?? []) {
        const { data: alreadyAlerted } = await sb
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'outcome_check')
          .eq('reference_key', String(dispute.id))
          .maybeSingle();
        if (alreadyAlerted) continue;

        const actionType = dispute.issue_type || 'dispute';
        const result = await sendNotification(sb, {
          userId,
          event: 'outcome_check',
          telegram: {
            text:
              `📞 *Quick follow-up: ${dispute.provider_name}*\n\n` +
              `You opened a ${actionType.replace(/_/g, ' ')} 7 days ago. Did they reply, refund, or are they still ignoring you?\n\n` +
              `Reply with "escalate ${dispute.provider_name}" to draft an escalation letter, or "resolved" to close the case.`,
          },
          whatsapp: {
            templateName: 'paybacker_outcome_check',
            templateParameters: [dispute.provider_name, actionType.replace(/_/g, ' ')],
          },
          push: {
            title: `${dispute.provider_name} — any reply yet?`,
            body: '7-day follow-up on your open dispute',
          },
        });

        if (result.delivered.length > 0) {
          counts.outcome_check++;
          await sb.from('notification_log').insert({
            user_id: userId,
            notification_type: 'outcome_check',
            reference_key: String(dispute.id),
          });
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-alerts][outcome_check][${userId}] ${m}`);
      errors.push(`outcome:${userId}: ${m}`);
    }
  }

  console.log(
    `[cron/whatsapp-alerts] users=${eligibleSessions.length} counts=${JSON.stringify(counts)} errors=${errors.length}`,
  );

  return NextResponse.json({
    ok: true,
    users: eligibleSessions.length,
    counts,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
