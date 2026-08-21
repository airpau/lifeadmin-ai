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
 *
 * ────────────────────────────────────────────────────────────────────
 * 2026-08-16 — WhatsApp cost/fatigue rework
 * ────────────────────────────────────────────────────────────────────
 * Three of the four blocks (unusual_charge, outcome_check,
 * payment_outgoing) no longer send an individually-billed WhatsApp
 * template. They ENQUEUE a one-line item into `whatsapp_alert_queue`,
 * which /api/cron/whatsapp-evening-digest delivers as ONE sectioned
 * message at 18:00. Telegram + push legs are UNCHANGED.
 *
 * `trial_ending` stays immediate — a trial about to auto-charge is
 * genuinely time-critical — but still passes through the capped send
 * facade in src/lib/whatsapp/index.ts.
 *
 * NOTE: /api/cron/whatsapp-intraday was a competing consolidated
 * orchestrator that claimed to replace this cron and
 * whatsapp-daily-checks, but was never registered in vercel.json while
 * both crons it replaced stayed scheduled. It has been DELETED — its
 * one-alert-per-slot design would have produced up to 10 billed
 * templates a day, which is the problem this rework exists to solve.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canUseWhatsApp } from '@/lib/plan-limits';
import { sendNotification } from '@/lib/notifications/dispatch';
import { getEffectiveThreshold } from '@/lib/intelligence/detection-thresholds';
import { enqueueDigestItem } from '@/lib/whatsapp/alert-queue';
import { isFutureDated } from '@/lib/alerts/future-dated';

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
  payment_outgoing: number;
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
    payment_outgoing: 0,
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
              `Reply *CANCEL* to draft a cancellation email citing the 14-day cooling-off rule.`,
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
        .select('id, merchant_name, amount, timestamp')
        .eq('user_id', userId)
        .lt('amount', 0)
        .gte('timestamp', oneDayAgo)
        .not('merchant_name', 'is', null)
        .limit(50);

      for (const charge of recentCharges ?? []) {
        // FUTURE-DATED GUARD — "Unusual charge from X" reads as money
        // already taken. A scheduled payment dated in the future hasn't
        // been charged yet (banks set is_pending = false on these, so
        // that flag can't be relied on). Leave it to the upcoming
        // /scheduled-payments surface.
        if (isFutureDated(charge.timestamp)) continue;
        if (!charge.merchant_name) continue;
        const currentAmount = Math.abs(Number(charge.amount));
        if (currentAmount < 5) continue; // ignore tiny charges

        // 90-day rolling average for this merchant
        const { data: history } = await sb
          .from('bank_transactions')
          .select('amount, timestamp')
          .eq('user_id', userId)
          .eq('merchant_name', charge.merchant_name)
          .lt('amount', 0)
          .gte('timestamp', ninetyDaysAgo)
          .lt('timestamp', oneDayAgo)
          .limit(50);

        if (!history || history.length < 3) continue;
        const avg = history.reduce((s, r) => s + Math.abs(Number(r.amount)), 0) / history.length;
        if (avg === 0) continue;
        const percentHigher = Math.round(((currentAmount - avg) / avg) * 100);
        // Phase 3 — threshold is per-merchant. Default 20%; auto-tune
        // raises it for merchants where the user dismisses repeatedly.
        const threshold = await getEffectiveThreshold(
          'unusual_charge',
          charge.merchant_name,
          20,
        );
        if (percentHigher < threshold) continue;

        const { data: alreadyAlerted } = await sb
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'unusual_charge')
          .eq('reference_key', String(charge.id))
          .maybeSingle();
        if (alreadyAlerted) continue;

        const merchantLabel = charge.merchant_name;
        const result = await sendNotification(sb, {
          userId,
          event: 'unusual_charge',
          telegram: {
            text:
              `🚨 *Unusual charge from ${merchantLabel}*\n\n` +
              `*£${currentAmount.toFixed(2)}* — ${percentHigher}% higher than your usual £${avg.toFixed(2)}.\n\n` +
              `Reply *DISPUTE* to draft a complaint letter, or *EXPLAIN* if it looks expected.`,
          },
          push: {
            title: 'Unusual charge detected',
            body: `${merchantLabel}: £${currentAmount.toFixed(2)} (+${percentHigher}%)`,
          },
        });

        // WhatsApp leg → evening digest (2026-08-16).
        const queued = await enqueueDigestItem(sb, {
          userId,
          eventType: 'unusual_charge',
          section: 'money_out',
          line:
            `${merchantLabel} charged £${currentAmount.toFixed(2)} vs your usual ` +
            `£${avg.toFixed(2)} (${percentHigher}% higher).`,
          amount: currentAmount,
          provider: merchantLabel,
          url: 'paybacker.co.uk/dashboard/money-hub',
          templateName: 'paybacker_alert_unusual_charge',
          parameters: [
            merchantLabel,
            `£${currentAmount.toFixed(2)}`,
            `£${avg.toFixed(2)}`,
            String(percentHigher),
          ],
          dedupKey: `unusual_charge_${charge.id}`,
        });

        if (result.delivered.length > 0 || queued !== 'error') {
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
    //
    // 2026-05-28 fix: the template parameters now carry a friendlier
    // action label (e.g. "energy dispute" not "energy_dispute") and the
    // Telegram body uses the structured reply keywords the user-bot
    // already understands (WON / PARTIAL / REJECTED / ONGOING) instead
    // of the older "escalate X" / "resolved" free-form copy.
    // ============================================================
    try {
      const { data: opens } = await sb
        .from('disputes')
        .select('id, provider_name, issue_type, dispute_type, created_at, first_letter_sent_at, money_recovered, status')
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

        // Action-type label — strip "_dispute" / "_complaint" suffixes
        // from the raw issue_type so the template reads "Your Sky energy
        // dispute" not "Your Sky energy_dispute dispute". We also drop
        // the trailing "dispute" word because the template already says
        // "your {{merchant}} {{action_type}}" with the template-side
        // copy assuming the action_type is the noun phrase.
        const rawType = dispute.issue_type || dispute.dispute_type || 'dispute';
        const actionLabel = rawType
          .replace(/_dispute$|_complaint$/i, '')
          .replace(/_/g, ' ')
          .trim() || 'dispute';
        // Days since the letter was sent (falls back to dispute creation
        // when the engine never recorded a send timestamp).
        const sentAt = dispute.first_letter_sent_at || dispute.created_at;
        const daysSince = Math.floor(
          (now.getTime() - new Date(sentAt).getTime()) / 86_400_000,
        );

        const result = await sendNotification(sb, {
          userId,
          event: 'outcome_check',
          telegram: {
            text:
              `📞 *${dispute.provider_name} — outcome check*\n\n` +
              `It's been ${daysSince} day${daysSince === 1 ? '' : 's'} since you sent your ${actionLabel} dispute. ` +
              `Have they responded?\n\n` +
              `Reply *WON*, *PARTIAL*, *REJECTED*, or *ONGOING* and I will update your case. ` +
              `For a follow-up letter, reply CHASE; to refer to the regulator, reply ESCALATE.`,
          },
          push: {
            title: `${dispute.provider_name} — any reply yet?`,
            body: `${daysSince}-day follow-up on your open dispute`,
          },
        });

        // WhatsApp leg → evening digest (2026-08-16).
        const queued = await enqueueDigestItem(sb, {
          userId,
          eventType: 'outcome_check',
          section: 'other',
          line:
            `${dispute.provider_name} ${actionLabel} dispute: ${daysSince} days since you sent it. ` +
            `Reply WON, PARTIAL, REJECTED or ONGOING to update it.`,
          provider: dispute.provider_name,
          url: `paybacker.co.uk/dashboard/disputes/${dispute.id}`,
          templateName: 'paybacker_outcome_check',
          // {{1}} = merchant, {{2}} = action label (e.g. "energy dispute")
          parameters: [dispute.provider_name, `${actionLabel} dispute`],
          dedupKey: `outcome_check_${dispute.id}`,
        });

        if (result.delivered.length > 0 || queued !== 'error') {
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

    // ============================================================
    // 4) PAYMENT OUTGOING — debit >= user threshold cleared in last 24h
    //
    // Uses the new paybacker_payment_outgoing template (PENDING Meta
    // approval — provider will skip-with-warning until SID lands).
    // ============================================================
    try {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { data: profile } = await sb
        .from('profiles')
        .select('first_name, full_name, upcoming_bill_threshold')
        .eq('id', userId)
        .maybeSingle();
      const userThreshold = Math.max(
        50,
        Number((profile as { upcoming_bill_threshold?: number })?.upcoming_bill_threshold ?? 100),
      );
      const firstName =
        (profile?.first_name as string | undefined) ||
        (profile?.full_name as string | undefined)?.split(' ')[0] ||
        'there';

      const { data: outgoing } = await sb
        .from('bank_transactions')
        .select('id, merchant_name, amount, category, user_category, timestamp')
        .eq('user_id', userId)
        .lt('amount', 0)
        .gte('timestamp', oneDayAgo)
        .limit(20);

      for (const tx of outgoing ?? []) {
        // FUTURE-DATED GUARD. This alert reads "£X just left your
        // account" — never true for a payment the bank has merely
        // scheduled. HSBC returns those as ordinary rows dated on the
        // due day with is_pending = false, so is_pending can't be used.
        // Future-dated debits belong in upcoming/scheduled payments.
        if (isFutureDated(tx.timestamp)) continue;
        const absAmount = Math.abs(Number(tx.amount));
        if (absAmount < userThreshold) continue;

        const refKey = `payment_outgoing_${tx.id}`;
        const { data: already } = await sb
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'payment_outgoing')
          .eq('reference_key', refKey)
          .maybeSingle();
        if (already) continue;

        const merchant = tx.merchant_name || 'a merchant';
        const category = (tx.user_category || tx.category || 'general') as string;
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { data: monthCat } = await sb
          .from('bank_transactions')
          .select('amount')
          .eq('user_id', userId)
          .or(`user_category.eq.${category},category.eq.${category}`)
          .lt('amount', 0)
          .gte('timestamp', monthStart);
        const monthlyTotal = (monthCat ?? []).reduce(
          (s, r) => s + Math.abs(Number(r.amount)),
          0,
        );

        const result = await sendNotification(sb, {
          userId,
          event: 'payment_outgoing',
          telegram: {
            text:
              `💳 *£${absAmount.toFixed(2)} just left your account*\n\n` +
              `To *${merchant}*. ${category} spend this month: £${monthlyTotal.toFixed(0)}.\n\n` +
              `Reply DISPUTE if this doesn't look right.`,
          },
          push: {
            title: `£${absAmount.toFixed(2)} sent`,
            body: `To ${merchant}`,
          },
        });

        // WhatsApp leg → evening digest (2026-08-16). Same dedup key
        // shape as /api/cron/large-debit-alert so the two detection
        // paths can't both queue the same transaction.
        const queued = await enqueueDigestItem(sb, {
          userId,
          eventType: 'payment_outgoing',
          section: 'money_out',
          line: `£${absAmount.toFixed(2)} to ${merchant} (${category}).`,
          amount: absAmount,
          provider: merchant,
          url: 'paybacker.co.uk/dashboard/money-hub',
          templateName: 'paybacker_payment_outgoing',
          parameters: [
            firstName,
            absAmount.toFixed(2),
            merchant,
            category,
            monthlyTotal.toFixed(0),
          ],
          dedupKey: refKey,
        });

        if (result.delivered.length > 0 || queued !== 'error') {
          counts.payment_outgoing++;
          await sb.from('notification_log').insert({
            user_id: userId,
            notification_type: 'payment_outgoing',
            reference_key: refKey,
          });
        }
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-alerts][payment_outgoing][${userId}] ${m}`);
      errors.push(`payment_out:${userId}: ${m}`);
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

