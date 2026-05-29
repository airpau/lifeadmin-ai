/**
 * Daily WhatsApp template detections — consolidated cron.
 *
 * One scheduled run at 09:00 UTC (10:00 BST) fans out across the
 * detections that were previously unwired. Each block is independent
 * and dedup'd via notification_log so a re-run within the day produces
 * no double-sends.
 *
 * Templates fired by this route:
 *
 *   paybacker_outcome_check          T+7d after a dispute letter was
 *                                    sent and outcome is still null.
 *
 *   paybacker_alert_trial_ending     Subscriptions whose trial ends in
 *                                    the next 3 days.
 *
 *   paybacker_savings_goal_milestone Goals that have just crossed a
 *                                    25/50/75/100% threshold.
 *
 *   paybacker_better_deal_found      Users paying more in a category
 *                                    than the best available
 *                                    affiliate_deals.price_monthly.
 *
 *   paybacker_recovery_total_weekly  Saturday-only. Weekly recovered
 *                                    total + lifetime total.
 *
 * Every block:
 *   1. Loads a small, indexed slice of candidate rows.
 *   2. Resolves the user's active WhatsApp session (Pro + opted-in).
 *   3. Sends the template with the right vars.
 *   4. Writes a notification_log row keyed on a (template, ref, day)
 *      tuple to dedup re-runs / multi-day windows.
 *
 * CRON_SECRET Bearer auth (CLAUDE.md rule for every cron route).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface WhatsAppSession {
  whatsapp_phone: string;
}

async function getActiveSession(
  sb: SupabaseClient,
  userId: string,
): Promise<WhatsAppSession | null> {
  const { data } = await sb
    .from('whatsapp_sessions')
    .select('whatsapp_phone')
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('opted_out_at', null)
    .maybeSingle();
  return data as WhatsAppSession | null;
}

async function alreadyLogged(
  sb: SupabaseClient,
  refKey: string,
): Promise<boolean> {
  const { data } = await sb
    .from('notification_log')
    .select('id')
    .eq('reference_key', refKey)
    .limit(1);
  return Array.isArray(data) && data.length > 0;
}

async function logSend(
  sb: SupabaseClient,
  userId: string,
  notificationType: string,
  refKey: string,
): Promise<void> {
  await sb.from('notification_log').insert({
    user_id: userId,
    notification_type: notificationType,
    reference_key: refKey,
  });
}

// ── Detection: paybacker_outcome_check (T+7d unresolved) ─────────────
async function runOutcomeCheck(sb: SupabaseClient, today: string): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString();

  const { data: disputes } = await sb
    .from('disputes')
    .select('id, user_id, provider_name, sent_at, outcome')
    .lte('sent_at', cutoff)
    .is('outcome', null)
    .is('outcome_check_sent_at', null)
    .limit(200);

  if (!disputes || disputes.length === 0) return 0;
  let sent = 0;
  for (const d of disputes as Array<{
    id: string;
    user_id: string;
    provider_name: string | null;
    sent_at: string;
  }>) {
    const refKey = `outcome_check_${d.id}_${today}`;
    if (await alreadyLogged(sb, refKey)) continue;
    const session = await getActiveSession(sb, d.user_id);
    if (!session) continue;
    try {
      await sendWhatsAppTemplate({
        to: session.whatsapp_phone,
        templateName: 'paybacker_outcome_check',
        // Body: "Your {{1}} {{2}} hit 7 days. Have they responded? …"
        // We pass the merchant as {{1}} and a noun ("complaint") as {{2}}.
        // No newlines in vars (Twilio 21656 rule).
        parameters: [d.provider_name ?? 'recent', 'complaint'],
      });
      await sb
        .from('disputes')
        .update({ outcome_check_sent_at: new Date().toISOString() })
        .eq('id', d.id);
      await logSend(sb, d.user_id, 'outcome_check', refKey);
      sent += 1;
    } catch (e) {
      console.warn('[daily-checks] outcome_check send failed', e);
    }
  }
  return sent;
}

// ── Detection: paybacker_alert_trial_ending (next 3 days) ────────────
async function runTrialEnding(sb: SupabaseClient, today: string): Promise<number> {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 3);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data: subs } = await sb
    .from('subscriptions')
    .select(
      'id, user_id, provider_name, amount, billing_cycle, next_billing_date',
    )
    .eq('status', 'active')
    .not('next_billing_date', 'is', null)
    .lte('next_billing_date', horizonIso)
    .gte('next_billing_date', today)
    .limit(200);

  if (!subs || subs.length === 0) return 0;
  let sent = 0;
  for (const s of subs as Array<{
    id: string;
    user_id: string;
    provider_name: string;
    amount: number | string;
    billing_cycle: string | null;
    next_billing_date: string;
  }>) {
    const refKey = `trial_ending_${s.id}_${today}`;
    if (await alreadyLogged(sb, refKey)) continue;
    const session = await getActiveSession(sb, s.user_id);
    if (!session) continue;
    const daysLeft = Math.max(
      0,
      Math.round(
        (new Date(s.next_billing_date).getTime() - new Date(today).getTime()) /
          86_400_000,
      ),
    );
    const amount = `£${Number(s.amount).toFixed(2)}`;
    try {
      await sendWhatsAppTemplate({
        to: session.whatsapp_phone,
        templateName: 'paybacker_alert_trial_ending',
        // Body: "Your {{1}} trial ends in {{2}} days — you will be charged £{{3}}…"
        // {{3}} is just the number, the template has the £ baked in.
        parameters: [s.provider_name, String(daysLeft), Number(s.amount).toFixed(2)],
      });
      await logSend(sb, s.user_id, 'trial_ending', refKey);
      sent += 1;
    } catch (e) {
      console.warn('[daily-checks] trial_ending send failed', e);
    }
  }
  return sent;
}

// ── Detection: paybacker_savings_goal_milestone ──────────────────────
async function runSavingsMilestones(sb: SupabaseClient, today: string): Promise<number> {
  const { data: goals } = await sb
    .from('savings_goals')
    .select('id, user_id, name, current_amount, target_amount')
    .gt('target_amount', 0)
    .limit(200);

  if (!goals || goals.length === 0) return 0;
  const milestones = [25, 50, 75, 100];
  let sent = 0;
  for (const g of goals as Array<{
    id: string;
    user_id: string;
    name: string;
    current_amount: number | string;
    target_amount: number | string;
  }>) {
    const current = Number(g.current_amount) || 0;
    const target = Number(g.target_amount) || 0;
    if (target === 0) continue;
    const pct = Math.floor((current / target) * 100);
    // Find the highest milestone the user has now crossed.
    const crossed = milestones.filter((m) => pct >= m).slice(-1)[0];
    if (!crossed) continue;
    const refKey = `savings_milestone_${g.id}_${crossed}`;
    if (await alreadyLogged(sb, refKey)) continue;
    const session = await getActiveSession(sb, g.user_id);
    if (!session) continue;
    try {
      await sendWhatsAppTemplate({
        to: session.whatsapp_phone,
        templateName: 'paybacker_savings_goal_milestone',
        // Body: "Goal \"{{1}}\" just hit {{2}}% — £{{3}} saved of £{{4}}…"
        parameters: [
          g.name,
          String(crossed),
          current.toFixed(2),
          target.toFixed(2),
        ],
      });
      await logSend(sb, g.user_id, 'savings_milestone', refKey);
      sent += 1;
    } catch (e) {
      console.warn('[daily-checks] savings_milestone send failed', e);
    }
  }
  return sent;
}

// ── Detection: paybacker_better_deal_found ───────────────────────────
async function runBetterDealFound(sb: SupabaseClient, today: string): Promise<number> {
  // Strategy: for every (category, user) where the user's current
  // monthly spend > 1.2× the cheapest active affiliate_deal for that
  // category, surface the saving.
  const { data: deals } = await sb
    .from('affiliate_deals')
    .select('id, category, provider, plan_name, price_monthly, switch_url')
    .eq('is_active', true)
    .not('price_monthly', 'is', null)
    .order('price_monthly', { ascending: true });

  if (!deals || deals.length === 0) return 0;
  // Pick cheapest per category.
  const cheapest = new Map<
    string,
    { provider: string; plan_name: string; price_monthly: number; switch_url: string | null }
  >();
  for (const d of deals as Array<{
    category: string;
    provider: string;
    plan_name: string;
    price_monthly: number;
    switch_url: string | null;
  }>) {
    if (!cheapest.has(d.category) || (cheapest.get(d.category)!.price_monthly > d.price_monthly)) {
      cheapest.set(d.category, {
        provider: d.provider,
        plan_name: d.plan_name,
        price_monthly: d.price_monthly,
        switch_url: d.switch_url,
      });
    }
  }

  // For each cheapest, find users currently paying more in that category.
  let sent = 0;
  for (const [category, best] of cheapest.entries()) {
    const threshold = best.price_monthly * 1.2;
    const { data: paying } = await sb
      .from('subscriptions')
      .select('user_id, amount')
      .ilike('category', `%${category}%`)
      .eq('status', 'active')
      .gt('amount', threshold)
      .limit(50);
    if (!paying || paying.length === 0) continue;
    for (const sub of paying as Array<{ user_id: string; amount: number | string }>) {
      const refKey = `better_deal_${sub.user_id}_${category}_${today}`;
      if (await alreadyLogged(sb, refKey)) continue;
      const session = await getActiveSession(sb, sub.user_id);
      if (!session) continue;
      const savingMonthly = Number(sub.amount) - best.price_monthly;
      const savingYearly = Math.round(savingMonthly * 12);
      if (savingYearly < 30) continue; // skip noisy small wins
      try {
        await sendWhatsAppTemplate({
          to: session.whatsapp_phone,
          templateName: 'paybacker_better_deal_found',
          // Body: "We found a cheaper {{1}} deal — could save you about
          // £{{2}}/year. See it here: {{3}} — switch in a couple of taps."
          parameters: [
            category,
            String(savingYearly),
            best.switch_url ?? 'paybacker.co.uk/dashboard/deals',
          ],
        });
        await logSend(sb, sub.user_id, 'better_deal_found', refKey);
        sent += 1;
      } catch (e) {
        console.warn('[daily-checks] better_deal_found send failed', e);
      }
    }
  }
  return sent;
}

// ── Detection: paybacker_recovery_total_weekly (Saturdays only) ──────
async function runWeeklyRecovery(sb: SupabaseClient, today: string): Promise<number> {
  // Saturday = day 6.
  if (new Date(today).getUTCDay() !== 6) return 0;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString();

  // Aggregate recovered amounts per user, both for the last 7 days
  // and lifetime. Keeps the DB roundtrips low by pulling all resolved-
  // won disputes once and bucketing in JS.
  const { data: rows } = await sb
    .from('disputes')
    .select('user_id, recovered_amount_gbp, resolved_at')
    .eq('outcome', 'won')
    .not('recovered_amount_gbp', 'is', null);
  if (!rows) return 0;
  const lifetimeByUser = new Map<string, number>();
  const weeklyByUser = new Map<string, number>();
  for (const r of rows as Array<{
    user_id: string;
    recovered_amount_gbp: number | string;
    resolved_at: string | null;
  }>) {
    const amt = Number(r.recovered_amount_gbp) || 0;
    lifetimeByUser.set(r.user_id, (lifetimeByUser.get(r.user_id) ?? 0) + amt);
    if (r.resolved_at && r.resolved_at >= cutoff) {
      weeklyByUser.set(r.user_id, (weeklyByUser.get(r.user_id) ?? 0) + amt);
    }
  }
  let sent = 0;
  for (const [userId, weekAmount] of weeklyByUser.entries()) {
    if (weekAmount <= 0) continue;
    const refKey = `recovery_weekly_${userId}_${today}`;
    if (await alreadyLogged(sb, refKey)) continue;
    const session = await getActiveSession(sb, userId);
    if (!session) continue;
    const lifetime = lifetimeByUser.get(userId) ?? 0;
    try {
      await sendWhatsAppTemplate({
        to: session.whatsapp_phone,
        templateName: 'paybacker_recovery_total_weekly',
        // Body: "This week Paybacker recovered £{{1}} for you. Lifetime
        // total: £{{2}}. See the breakdown at paybacker.co.uk/…"
        parameters: [weekAmount.toFixed(2), lifetime.toFixed(2)],
      });
      await logSend(sb, userId, 'recovery_weekly', refKey);
      sent += 1;
    } catch (e) {
      console.warn('[daily-checks] recovery_weekly send failed', e);
    }
  }
  return sent;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sb = getAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const counts: Record<string, number> = {};
  // Run sequentially, not in parallel — each block is small and we
  // value isolation if one query throws over throughput.
  for (const [name, fn] of [
    ['outcome_check', runOutcomeCheck],
    ['trial_ending', runTrialEnding],
    ['savings_milestone', runSavingsMilestones],
    ['better_deal_found', runBetterDealFound],
    ['recovery_weekly', runWeeklyRecovery],
  ] as const) {
    try {
      counts[name] = await fn(sb, today);
    } catch (e) {
      console.error(`[daily-checks] ${name} failed:`, e);
      counts[name] = -1;
    }
  }
  return NextResponse.json({ ok: true, date: today, counts });
}
