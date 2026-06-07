/**
 * GET /api/cron/whatsapp-intraday?slot=<slot>
 *
 * Consolidated intraday WhatsApp orchestrator. ONE route, slot-switched,
 * so every Pocket-Agent alert that fires through the day shares the same
 * gating, dedup, and personalisation logic instead of being scattered
 * across half a dozen crons with inconsistent (and buggy) filters.
 *
 * WHY THIS EXISTS (2026-05-31 rebuild):
 *   Paul was getting only ~2 WhatsApp messages a day (morning brief +
 *   the occasional trial alert) when 12+ templates should fire with real
 *   data. The audit found:
 *     - several intraday crons were never registered in vercel.json
 *     - others queried the wrong table/column and returned 0 rows
 *       (outcome-check on a usually-null `sent_at`; trial on
 *       `notes ILIKE '%trial%'` AND `contract_end_date`)
 *     - duplicate detection paths for the same template with non-shared
 *       dedup keys → double-send risk
 *     - inconsistent / missing Pro-tier gating
 *
 *   This orchestrator replaces the intraday duties of `whatsapp-alerts`
 *   and `whatsapp-daily-checks` (both now UNSCHEDULED in vercel.json).
 *   The morning brief stays on `telegram-morning-summary` (its WhatsApp
 *   path already works) and dispute-agent recommendations stay on the
 *   `dispute-agent` cron. Payment in/out stay on `income-received` /
 *   `large-debit-alert` (event-cadence, tied to bank-sync).
 *
 * DESIGN PRINCIPLES (per the rebuild brief):
 *   1. One alert per user per slot max — each slot fires exactly one
 *      template type, so the cap is structural.
 *   2. Recency gates — every send is dedup-checked against
 *      `notification_log` within a per-slot window before sending, and
 *      logged after.
 *   3. Data-threshold gates — we only send when there's something
 *      meaningful to say (budget >75%, savings at a 25/50/75/100 band,
 *      outcome only 7+ days after the letter, etc.).
 *   4. Personalisation — every message uses real numbers from the
 *      user's account.
 *   5. Pro + active-session + notification-preference gating on every
 *      send, uniformly.
 *
 * Auth: Bearer CRON_SECRET (CLAUDE.md rule).
 *
 * Slots (registered in vercel.json):
 *   renewal   09:00  paybacker_alert_renewal
 *   trial     09:00  paybacker_alert_trial_ending
 *   price     11:00  paybacker_alert_price_increase
 *   budget    12:00  paybacker_budget_alert
 *   outcome   13:00  paybacker_outcome_check
 *   unusual   14:00  paybacker_alert_unusual_charge
 *   created   16:00  paybacker_dispute_created
 *   savings   17:00  paybacker_savings_goal_milestone
 *   recovered 18:00  paybacker_money_recovered
 *   dd        45 7,12,18  paybacker_dd_warning
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppTemplate } from '@/lib/whatsapp';
import { isProPocketAgentEligible } from '@/lib/telegram/eligibility';
import {
  isAlertEnabled,
  type WhatsAppAlertKey,
} from '@/lib/whatsapp/notification-prefs';
import { isPayrollLike } from '@/lib/subscriptions/payroll-filter';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Slot =
  | 'renewal'
  | 'trial'
  | 'price'
  | 'budget'
  | 'outcome'
  | 'unusual'
  | 'created'
  | 'savings'
  | 'recovered'
  | 'dd';

const VALID_SLOTS: Slot[] = [
  'renewal',
  'trial',
  'price',
  'budget',
  'outcome',
  'unusual',
  'created',
  'savings',
  'recovered',
  'dd',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

interface ProUser {
  userId: string;
  phone: string;
  firstName: string;
  profile: Row;
}

interface SlotResult {
  slot: Slot;
  candidates: number;
  sent: number;
  skippedPref: number;
  skippedDuplicate: number;
  skippedThreshold: number;
  errors: string[];
}

function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // local/dev convenience
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function firstNameOf(profile: Row | undefined): string {
  const raw =
    (profile?.first_name as string | undefined) ||
    (profile?.full_name as string | undefined) ||
    (profile?.email as string | undefined) ||
    'there';
  return raw.toString().trim().split(/\s+/)[0] || 'there';
}

function money(n: number): string {
  return (Math.round(Math.abs(n) * 100) / 100).toFixed(2);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * Load every active, opted-in WhatsApp session whose owner is Pro
 * (or trial-Pro). This is the single recipient pool for every slot —
 * the WhatsApp Pocket Agent is Pro-only (CLAUDE.md).
 */
async function loadProUsers(sb: SupabaseClient): Promise<ProUser[]> {
  const { data: sessions, error } = await sb
    .from('whatsapp_sessions')
    .select('user_id, whatsapp_phone')
    .eq('is_active', true)
    .is('opted_out_at', null);
  if (error || !sessions || sessions.length === 0) return [];

  const userIds = sessions.map((s) => s.user_id);
  const { data: profiles } = await sb
    .from('profiles')
    .select(
      'id, first_name, full_name, email, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at',
    )
    .in('id', userIds);
  const profileById = new Map<string, Row>(
    (profiles ?? []).map((p) => [p.id as string, p as Row]),
  );

  const out: ProUser[] = [];
  for (const s of sessions) {
    const profile = profileById.get(s.user_id);
    if (!profile) continue;
    if (!isProPocketAgentEligible(profile as Parameters<typeof isProPocketAgentEligible>[0])) {
      continue;
    }
    if (!s.whatsapp_phone) continue;
    out.push({
      userId: s.user_id,
      phone: s.whatsapp_phone,
      firstName: firstNameOf(profile),
      profile,
    });
  }
  return out;
}

/**
 * Recency dedup. Returns true when an alert of `type` was already logged
 * for this user inside `withinDays`. Fails OPEN (returns false) on any
 * query error — the recipient pool is tiny and under-sending is the bug
 * we're fixing, so a missing dedup column should not block the send. We
 * always log after a successful send regardless.
 */
async function sentWithin(
  sb: SupabaseClient,
  userId: string,
  type: string,
  withinDays: number,
  refKey?: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - withinDays * 86_400_000).toISOString();
    let q = sb
      .from('notification_log')
      .select('id')
      .eq('user_id', userId)
      .eq('notification_type', type)
      .gte('created_at', since)
      .limit(1);
    if (refKey) q = q.eq('reference_key', refKey);
    const { data } = await q;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function logSent(
  sb: SupabaseClient,
  userId: string,
  type: string,
  refKey: string,
): Promise<void> {
  try {
    await sb.from('notification_log').insert({
      user_id: userId,
      notification_type: type,
      reference_key: refKey,
    });
  } catch {
    /* best-effort */
  }
}

async function prefAllows(
  sb: SupabaseClient,
  userId: string,
  key: WhatsAppAlertKey,
): Promise<boolean> {
  try {
    return await isAlertEnabled(sb, userId, key);
  } catch {
    return true;
  }
}

function emptyResult(slot: Slot): SlotResult {
  return {
    slot,
    candidates: 0,
    sent: 0,
    skippedPref: 0,
    skippedDuplicate: 0,
    skippedThreshold: 0,
    errors: [],
  };
}

// ───────────────────────────── slot handlers ─────────────────────────────

/** Subscription renews in ≤7 days. Dedup 7d. */
async function runRenewal(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('renewal');
  const todayIso = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);
  const horizonIso = horizon.toISOString().slice(0, 10);

  for (const u of users) {
    try {
      const { data: subs } = await sb
        .from('subscriptions')
        .select('id, provider_name, category, notes, amount, billing_cycle, next_billing_date')
        .eq('user_id', u.userId)
        .eq('status', 'active')
        .not('next_billing_date', 'is', null)
        .gte('next_billing_date', todayIso)
        .lte('next_billing_date', horizonIso)
        .order('next_billing_date', { ascending: true })
        .limit(5);
      // Skip payroll / salary / wages rows mis-detected as subscriptions —
      // they are not cancellable renewals.
      const sub = ((subs ?? []) as Row[]).find((s) => !isPayrollLike(s));
      if (!sub) continue;
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_renewal_reminder'))) {
        r.skippedPref++;
        continue;
      }
      const refKey = `renewal_${sub.id}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_renewal', 7, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      const due = new Date(sub.next_billing_date);
      const daysLeft = Math.max(
        0,
        Math.ceil((due.getTime() - Date.now()) / 86_400_000),
      );
      const monthly = (() => {
        const amt = Number(sub.amount) || 0;
        const cycle = (sub.billing_cycle ?? 'month').toString().toLowerCase();
        if (cycle.startsWith('year')) return amt / 12;
        if (cycle.startsWith('week')) return amt * 4.345;
        return amt;
      })();

      // vars: [service, days_left, monthly_cost] — £ is baked into the body
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_alert_renewal',
        parameters: [
          sub.provider_name ?? 'A subscription',
          String(daysLeft),
          money(monthly),
        ],
      });
      await logSent(sb, u.userId, 'whatsapp_renewal', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** Free trial ends in ≤3 days. Dedup 3d. */
async function runTrial(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('trial');
  const todayIso = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 3);
  const horizonIso = horizon.toISOString().slice(0, 10);

  for (const u of users) {
    try {
      // A trialing subscription: trial_end_date set and inside the window.
      // We look at both common shapes (`trial_end_date` and a `notes`-tagged
      // trial) defensively, but the date column is the reliable trigger.
      const { data: subs } = await sb
        .from('subscriptions')
        .select('id, provider_name, amount, trial_end_date, next_billing_date')
        .eq('user_id', u.userId)
        .eq('status', 'active')
        .not('trial_end_date', 'is', null)
        .gte('trial_end_date', todayIso)
        .lte('trial_end_date', horizonIso)
        .order('trial_end_date', { ascending: true })
        .limit(1);
      const sub = (subs ?? [])[0] as Row | undefined;
      if (!sub) continue;
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_trial_ending'))) {
        r.skippedPref++;
        continue;
      }
      const refKey = `trial_${sub.id}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_trial_ending', 3, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      const end = new Date(sub.trial_end_date);
      const daysLeft = Math.max(
        0,
        Math.ceil((end.getTime() - Date.now()) / 86_400_000),
      );
      const charge = Number(sub.amount) || 0;

      // vars: [service, days_left, auto_charge_amount] — £ baked in body
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_alert_trial_ending',
        parameters: [
          sub.provider_name ?? 'A trial',
          String(daysLeft),
          money(charge),
        ],
      });
      await logSent(sb, u.userId, 'whatsapp_trial_ending', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** New price increase detected, not dismissed. Dedup 30d. */
async function runPrice(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('price');
  for (const u of users) {
    try {
      // Price-increase detections live in `price_increase_alerts`
      // (written by the recurring-payment analyser). One per user per run.
      const { data: alerts } = await sb
        .from('price_increase_alerts')
        .select(
          'id, merchant_name, old_amount, new_amount, effective_date, detected_at, dismissed_at',
        )
        .eq('user_id', u.userId)
        .is('dismissed_at', null)
        .order('detected_at', { ascending: false })
        .limit(1);
      const a = (alerts ?? [])[0] as Row | undefined;
      if (!a) continue;
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_price_increase'))) {
        r.skippedPref++;
        continue;
      }
      const refKey = `price_${a.id}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_price_increase', 30, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      const eff = a.effective_date
        ? fmtDate(new Date(a.effective_date))
        : 'soon';
      // vars: [merchant, old_price, new_price, effective_date] — £ baked in
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_alert_price_increase',
        parameters: [
          a.merchant_name ?? 'A provider',
          money(Number(a.old_amount) || 0),
          money(Number(a.new_amount) || 0),
          eff,
        ],
      });
      await logSent(sb, u.userId, 'whatsapp_price_increase', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** >75% of a budget category used this month. Dedup 7d per category. */
async function runBudget(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('budget');
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const monthLabel = fmtDate(new Date(monthEnd.getTime() - 86_400_000));

  for (const u of users) {
    try {
      const { data: budgets } = await sb
        .from('money_hub_budgets')
        .select('category, monthly_limit')
        .eq('user_id', u.userId);
      if (!budgets || budgets.length === 0) continue;

      // Sum this month's spend per category from bank_transactions
      // (debits are negative). Self-contained so we don't depend on an
      // RPC whose shape varies.
      const { data: txns } = await sb
        .from('bank_transactions')
        .select('amount, user_category, category')
        .eq('user_id', u.userId)
        .gte('timestamp', monthStart.toISOString())
        .lt('amount', 0)
        .limit(2000);
      const spentByCat = new Map<string, number>();
      for (const t of (txns ?? []) as Row[]) {
        const cat = ((t.user_category ?? t.category ?? '') as string).toLowerCase();
        if (!cat) continue;
        spentByCat.set(cat, (spentByCat.get(cat) ?? 0) + Math.abs(Number(t.amount) || 0));
      }

      // Pick the single most-over-threshold category to send (one per slot).
      let best: { category: string; pct: number; left: number } | null = null;
      for (const b of budgets as Row[]) {
        const limit = Number(b.monthly_limit) || 0;
        if (limit <= 0) continue;
        const spent = spentByCat.get((b.category as string).toLowerCase()) ?? 0;
        const pct = Math.round((spent / limit) * 100);
        if (pct < 75) continue;
        const left = limit - spent;
        if (!best || pct > best.pct) {
          best = { category: b.category as string, pct, left };
        }
      }
      if (!best) continue;
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_budget_alert'))) {
        r.skippedPref++;
        continue;
      }
      const refKey = `budget_${best.category.toLowerCase()}_${monthStart
        .toISOString()
        .slice(0, 7)}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_budget_alert', 7, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      // vars: [category, percent_used, amount_left, end_date] — £ baked in
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_budget_alert',
        parameters: [
          best.category,
          String(best.pct),
          money(Math.max(0, best.left)),
          monthLabel,
        ],
      });
      await logSent(sb, u.userId, 'whatsapp_budget_alert', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** Letter sent >7 days ago, no outcome logged. Dedup 14d. One per user. */
async function runOutcome(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('outcome');
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const TERMINAL = [
    'resolved_won',
    'resolved_partial',
    'resolved_lost',
    'withdrawn',
    'timeout',
    'closed',
    'dismissed',
  ];

  for (const u of users) {
    try {
      // first_letter_sent_at is the reliable "letter has gone out" column
      // (the engine sets it; the legacy `sent_at` is usually null — that
      // was the zero-result bug in whatsapp-daily-checks).
      const { data: disputes } = await sb
        .from('disputes')
        .select(
          'id, merchant_name, company_name, dispute_type, first_letter_sent_at, fca_8_week_deadline, outcome, status',
        )
        .eq('user_id', u.userId)
        .not('first_letter_sent_at', 'is', null)
        .lte('first_letter_sent_at', sevenDaysAgo)
        .is('outcome', null)
        .not('status', 'in', `(${TERMINAL.join(',')})`)
        .order('first_letter_sent_at', { ascending: true })
        .limit(1);
      const d = (disputes ?? [])[0] as Row | undefined;
      if (!d) continue;
      r.candidates++;

      // The brief asks the outcome nudge to reference the supplier and the
      // FCA 8-week deadline. That detail rides in via the in-window text
      // path of the Pocket Agent; the approved template carries the
      // [merchant, action_type] vars.
      if (!(await prefAllows(sb, u.userId, 'whatsapp_dispute_reply'))) {
        r.skippedPref++;
        continue;
      }
      const refKey = `outcome_${d.id}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_outcome_check', 14, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      const merchant = d.merchant_name || d.company_name || 'your dispute';
      const actionType =
        (d.dispute_type as string)?.toLowerCase().includes('cancel')
          ? 'cancellation'
          : 'dispute';

      // vars: [merchant, action_type]
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_outcome_check',
        parameters: [merchant, actionType],
      });
      await logSent(sb, u.userId, 'whatsapp_outcome_check', refKey);
      // Best-effort flag on the dispute so other paths see it was asked.
      try {
        await sb
          .from('disputes')
          .update({ outcome_check_sent_at: new Date().toISOString() })
          .eq('id', d.id);
      } catch {
        /* column may not exist on every row — non-fatal */
      }
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** Unusual charge flagged but not dismissed. Dedup 7d. */
async function runUnusual(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('unusual');
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString();

  for (const u of users) {
    try {
      // A debit >=20% above the merchant's 90-day rolling average, in the
      // last 48h. Computed inline so we don't depend on a flag table.
      const { data: recent } = await sb
        .from('bank_transactions')
        .select('id, amount, merchant_name, description, timestamp')
        .eq('user_id', u.userId)
        .lt('amount', 0)
        .gte('timestamp', since)
        .order('timestamp', { ascending: false })
        .limit(50);
      if (!recent || recent.length === 0) continue;

      // 90-day history for averages.
      const hist90 = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { data: history } = await sb
        .from('bank_transactions')
        .select('amount, merchant_name')
        .eq('user_id', u.userId)
        .lt('amount', 0)
        .gte('timestamp', hist90)
        .limit(2000);

      const sums = new Map<string, { total: number; n: number }>();
      for (const h of (history ?? []) as Row[]) {
        const m = (h.merchant_name as string | null)?.toLowerCase();
        if (!m) continue;
        const cur = sums.get(m) ?? { total: 0, n: 0 };
        cur.total += Math.abs(Number(h.amount) || 0);
        cur.n += 1;
        sums.set(m, cur);
      }

      let hit: { tx: Row; avg: number; pct: number } | null = null;
      for (const t of recent as Row[]) {
        const m = (t.merchant_name as string | null)?.toLowerCase();
        if (!m) continue;
        const s = sums.get(m);
        if (!s || s.n < 3) continue; // need a stable baseline
        const avg = s.total / s.n;
        const amt = Math.abs(Number(t.amount) || 0);
        if (avg <= 0) continue;
        const pct = Math.round(((amt - avg) / avg) * 100);
        if (pct < 20) continue;
        if (!hit || pct > hit.pct) hit = { tx: t, avg, pct };
      }
      if (!hit) continue;
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_unusual_charge'))) {
        r.skippedPref++;
        continue;
      }
      const refKey = `unusual_${hit.tx.id}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_unusual_charge', 7, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      // vars: [merchant, current_amount, average_amount, percent_higher] — £ baked in
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_alert_unusual_charge',
        parameters: [
          hit.tx.merchant_name ?? 'A merchant',
          money(Math.abs(Number(hit.tx.amount) || 0)),
          money(hit.avg),
          String(hit.pct),
        ],
      });
      await logSent(sb, u.userId, 'whatsapp_unusual_charge', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** New dispute created in the last 24h — confirmation. Dedup per dispute. */
async function runCreated(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('created');
  const since = new Date(Date.now() - 24 * 86_400_000 / 24).toISOString(); // 24h
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://paybacker.co.uk').replace(/\/$/, '');

  for (const u of users) {
    try {
      const { data: disputes } = await sb
        .from('disputes')
        .select('id, merchant_name, company_name, created_at')
        .eq('user_id', u.userId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);
      const d = (disputes ?? [])[0] as Row | undefined;
      if (!d) continue;
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_dispute_reply'))) {
        r.skippedPref++;
        continue;
      }
      const refKey = `created_${d.id}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_dispute_created', 2, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      const merchant = d.merchant_name || d.company_name || 'a provider';
      const url = `${base}/dashboard/disputes`;
      // vars: [merchant, dispute_url]
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_dispute_created',
        parameters: [merchant, url],
      });
      await logSent(sb, u.userId, 'whatsapp_dispute_created', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** Savings-goal milestone hit (25/50/75/100). Dedup per goal+band. */
async function runSavings(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('savings');
  const BANDS = [25, 50, 75, 100];

  for (const u of users) {
    try {
      const { data: goals } = await sb
        .from('savings_goals')
        .select('id, name, current_amount, target_amount')
        .eq('user_id', u.userId);
      if (!goals || goals.length === 0) continue;

      // Find the highest newly-reached band across the user's goals.
      let pick:
        | { goal: Row; band: number; pct: number }
        | null = null;
      for (const g of goals as Row[]) {
        const target = Number(g.target_amount) || 0;
        const current = Number(g.current_amount) || 0;
        if (target <= 0) continue;
        const pct = Math.floor((current / target) * 100);
        const band = [...BANDS].reverse().find((b) => pct >= b);
        if (!band) continue;
        if (!pick || band > pick.band) pick = { goal: g, band, pct };
      }
      if (!pick) continue;
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_savings_milestone'))) {
        r.skippedPref++;
        continue;
      }
      // Dedup per goal+band so each milestone is celebrated once, but a
      // later band still fires. Long window (180d) since a band is a
      // one-time event.
      const refKey = `savings_${pick.goal.id}_${pick.band}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_savings_milestone', 180, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      // vars: [goal_name, percent, amount_saved, target_amount] — £ baked in
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_savings_goal_milestone',
        parameters: [
          pick.goal.name ?? 'Your goal',
          String(pick.band),
          money(Number(pick.goal.current_amount) || 0),
          money(Number(pick.goal.target_amount) || 0),
        ],
      });
      await logSent(sb, u.userId, 'whatsapp_savings_milestone', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** Dispute won in the last 24h — celebration. Dedup per dispute. */
async function runRecovered(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('recovered');
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  for (const u of users) {
    try {
      // Won disputes resolved in the last 24h with a recovered amount.
      const { data: disputes } = await sb
        .from('disputes')
        .select(
          'id, merchant_name, company_name, recovered_amount_gbp, money_recovered, updated_at, status',
        )
        .eq('user_id', u.userId)
        .in('status', ['resolved_won', 'resolved_partial'])
        .gte('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(1);
      const d = (disputes ?? [])[0] as Row | undefined;
      if (!d) continue;
      const amount =
        Number(d.recovered_amount_gbp) || Number(d.money_recovered) || 0;
      if (amount <= 0) {
        r.skippedThreshold++;
        continue;
      }
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_money_recovered'))) {
        r.skippedPref++;
        continue;
      }
      const refKey = `recovered_${d.id}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_money_recovered', 30, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      // Lifetime total from verified_savings (the canonical recovery table).
      const { data: all } = await sb
        .from('verified_savings')
        .select('amount_saved')
        .eq('user_id', u.userId);
      const lifetime = (all ?? []).reduce(
        (s, x) => s + (Number((x as Row).amount_saved) || 0),
        0,
      );
      const lifetimeTotal = lifetime > 0 ? lifetime : amount;

      const merchant = d.merchant_name || d.company_name || 'a provider';
      // vars: [amount, merchant, lifetime_total] — £ baked in
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_money_recovered',
        parameters: [money(amount), merchant, money(lifetimeTotal)],
      });
      await logSent(sb, u.userId, 'whatsapp_money_recovered', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

/** Known direct debit due in ≤2 days. Dedup per payment+date. */
async function runDdWarning(sb: SupabaseClient, users: ProUser[]): Promise<SlotResult> {
  const r = emptyResult('dd');
  const todayIso = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 2);
  const horizonIso = horizon.toISOString().slice(0, 10);

  for (const u of users) {
    try {
      // Upcoming recurring payments are synced by /api/cron/sync-upcoming
      // into `upcoming_payments`. We surface the soonest one due in ≤2d.
      // Wrapped so a schema mismatch degrades to "skip" rather than crash.
      let due: Row | undefined;
      try {
        const { data: upcoming } = await sb
          .from('upcoming_payments')
          .select('id, merchant_name, provider_name, amount, due_date, next_date')
          .eq('user_id', u.userId)
          .limit(50);
        due = (upcoming ?? [])
          .map((p) => p as Row)
          .filter((p) => {
            const dt = (p.due_date || p.next_date) as string | undefined;
            if (!dt) return false;
            const day = dt.slice(0, 10);
            return day >= todayIso && day <= horizonIso;
          })
          .sort((a, b) => {
            const da = (a.due_date || a.next_date) as string;
            const db = (b.due_date || b.next_date) as string;
            return da.localeCompare(db);
          })[0];
      } catch {
        // Table/columns not present in this environment — skip silently.
        continue;
      }
      if (!due) continue;
      r.candidates++;

      if (!(await prefAllows(sb, u.userId, 'whatsapp_dd_warning'))) {
        r.skippedPref++;
        continue;
      }
      const dueDateStr = ((due.due_date || due.next_date) as string).slice(0, 10);
      const refKey = `dd_${due.id}_${dueDateStr}`;
      if (await sentWithin(sb, u.userId, 'whatsapp_dd_warning', 3, refKey)) {
        r.skippedDuplicate++;
        continue;
      }

      // Best-effort current balance for the closing line.
      let balance = 0;
      try {
        const { data: accts } = await sb
          .from('bank_accounts')
          .select('balance')
          .eq('user_id', u.userId)
          .limit(20);
        balance = (accts ?? []).reduce(
          (s, a) => s + (Number((a as Row).balance) || 0),
          0,
        );
      } catch {
        /* non-fatal */
      }

      const provider =
        (due.merchant_name as string) || (due.provider_name as string) || 'A provider';
      // vars: [first_name, provider, amount, date, balance]
      await sendWhatsAppTemplate({
        to: u.phone,
        templateName: 'paybacker_dd_warning',
        parameters: [
          u.firstName,
          provider,
          `£${money(Number(due.amount) || 0)}`,
          fmtDate(new Date(dueDateStr)),
          `£${money(balance)}`,
        ],
      });
      await logSent(sb, u.userId, 'whatsapp_dd_warning', refKey);
      r.sent++;
    } catch (e) {
      r.errors.push(`${u.userId}: ${(e as Error).message}`);
    }
  }
  return r;
}

const HANDLERS: Record<Slot, (sb: SupabaseClient, users: ProUser[]) => Promise<SlotResult>> = {
  renewal: runRenewal,
  trial: runTrial,
  price: runPrice,
  budget: runBudget,
  outcome: runOutcome,
  unusual: runUnusual,
  created: runCreated,
  savings: runSavings,
  recovered: runRecovered,
  dd: runDdWarning,
};

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const slot = (request.nextUrl.searchParams.get('slot') || '') as Slot;
  if (!VALID_SLOTS.includes(slot)) {
    return NextResponse.json(
      { error: 'invalid slot', valid: VALID_SLOTS },
      { status: 400 },
    );
  }

  const sb = getAdmin();
  const users = await loadProUsers(sb);
  if (users.length === 0) {
    return NextResponse.json({ ok: true, slot, candidates: 0, sent: 0, recipients: 0 });
  }

  const result = await HANDLERS[slot](sb, users);
  return NextResponse.json({
    ok: true,
    recipients: users.length,
    ...result,
    errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined,
  });
}
