/**
 * Telegram Evening Summary Cron
 *
 * Runs at 8pm UK time daily. Sends each linked Pro user an evening
 * wrap-up covering today's spending vs daily average, remaining budget,
 * price increase alerts, savings progress, tomorrow's payments,
 * and a motivational close.
 *
 * Uses the Telegram Bot API directly (fetch to api.telegram.org) with
 * the TELEGRAM_USER_BOT_TOKEN.
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

function fmt(amount: number): string {
  return `£${Math.abs(amount).toFixed(2)}`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function splitMessage(text: string, limit = 4000): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = i + limit;
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + limit / 2) end = nl + 1;
    }
    chunks.push(text.slice(i, end));
    i = end;
  }
  return chunks;
}

async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<boolean> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: 'Markdown',
      }),
    });
    const data = (await res.json()) as { ok: boolean };
    if (!data.ok) return false;
  }
  return true;
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.TELEGRAM_USER_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });
  }

  const supabase = getAdmin();
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  // -------------------------------------------------------
  // Get all active linked Pro users
  // -------------------------------------------------------
  const { data: sessions, error: sessErr } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .eq('is_active', true);

  if (sessErr || !sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  const userIds = sessions.map((s) => s.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, subscription_status, stripe_subscription_id')
    .in('id', userIds);

  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => {
        const tier = p.subscription_tier;
        const status = p.subscription_status;
        const hasStripe = !!p.stripe_subscription_id;
        return (
          tier === 'pro' &&
          (hasStripe ? ['active', 'trialing'].includes(status ?? '') : status === 'trialing')
        );
      })
      .map((p) => p.id),
  );

  const proSessions = sessions.filter((s) => proUserIds.has(s.user_id));

  // Check alert preferences — skip users who disabled evening summary
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, evening_summary')
    .in('user_id', proSessions.map(s => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map(p => [p.user_id, p]));
  const eligibleSessions = proSessions.filter(s => {
    const pref = prefMap.get(s.user_id);
    return !pref || pref.evening_summary !== false;
  });

  // -------------------------------------------------------
  // Date helpers
  // -------------------------------------------------------
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const tomorrowStr = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Current month boundaries
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysRemaining = daysInMonth - dayOfMonth;

  // For 30-day average calculation
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // -------------------------------------------------------
  // Process each Pro user
  // -------------------------------------------------------
  for (const session of eligibleSessions) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Check if user has any bank transaction data at all
      const { count: txCount } = await supabase
        .from('bank_transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (!txCount || txCount === 0) {
        skipped++;
        continue;
      }

      const sections: string[] = [];
      sections.push('*Here\'s your evening money wrap-up:*');

      // ------ 1. Today's spending vs daily average ------
      const [todayTxResult, last30TxResult] = await Promise.all([
        supabase
          .from('bank_transactions')
          .select('user_category, amount')
          .eq('user_id', userId)
          .lt('amount', 0)
          .gte('timestamp', todayStart.toISOString())
          .lt('timestamp', now.toISOString()),
        supabase
          .from('bank_transactions')
          .select('user_category, amount')
          .eq('user_id', userId)
          .lt('amount', 0)
          .gte('timestamp', thirtyDaysAgo.toISOString())
          .lt('timestamp', todayStart.toISOString()),
      ]);

      // Exclude transfers and income from spending totals
      const EXCLUDE_CATS = new Set(['transfers', 'income']);
      const todayTx = (todayTxResult.data ?? []).filter(
        t => !EXCLUDE_CATS.has(t.user_category ?? ''),
      );
      const last30Tx = (last30TxResult.data ?? []).filter(
        t => !EXCLUDE_CATS.has(t.user_category ?? ''),
      );

      const todayTotal = todayTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      const last30Total = last30Tx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
      const dailyAvg = last30Tx.length > 0 ? last30Total / 30 : 0;

      let spendingSection = `\n\n*Today's Spending*\nTotal: *${fmt(todayTotal)}*`;
      if (dailyAvg > 0) {
        const diff = todayTotal - dailyAvg;
        if (diff > 0) {
          spendingSection += `\n\u26a0\ufe0f That's *${fmt(diff)} above* your daily average of ${fmt(dailyAvg)}`;
        } else if (diff < 0) {
          spendingSection += `\n\u2705 That's *${fmt(Math.abs(diff)) } below* your daily average of ${fmt(dailyAvg)}`;
        } else {
          spendingSection += `\nRight on your daily average of ${fmt(dailyAvg)}`;
        }
      }
      sections.push(spendingSection);

      // ------ 2. Remaining budget for top categories ------
      // Use get_monthly_spending RPC — correctly reads user_category and excludes
      // transfers/income. Falls back to empty array if function unavailable.
      const [budgets, spendingRpcResult] = await Promise.all([
        supabase
          .from('money_hub_budgets')
          .select('category, monthly_limit')
          .eq('user_id', userId),
        supabase.rpc('get_monthly_spending', {
          p_user_id: userId,
          p_year: now.getFullYear(),
          p_month: now.getMonth() + 1,
        }),
      ]);

      const spentByCategory: Record<string, number> = {};
      for (const row of spendingRpcResult.data ?? []) {
        // RPC returns { category: string, category_total: numeric }
        spentByCategory[row.category] = Number(row.category_total);
      }

      const budgetStatus: Array<{
        category: string;
        spent: number;
        limit: number;
        remaining: number;
        pct: number;
      }> = [];
      for (const b of budgets.data ?? []) {
        const limit = Number(b.monthly_limit);
        const spentAmt = spentByCategory[b.category] ?? 0;
        const remaining = limit - spentAmt;
        const pct = limit > 0 ? (spentAmt / limit) * 100 : 0;
        budgetStatus.push({ category: b.category, spent: spentAmt, limit, remaining, pct });
      }

      if (budgetStatus.length > 0) {
        budgetStatus.sort((a, b) => b.pct - a.pct);
        let budgetSection = `\n\n*Budget Remaining (${daysRemaining} days left this month)*`;
        for (const b of budgetStatus.slice(0, 5)) {
          const emoji = b.pct >= 100 ? '\u274c' : b.pct >= 80 ? '\u26a0\ufe0f' : '\u2705';
          const remainStr =
            b.remaining >= 0 ? `${fmt(b.remaining)} left` : `${fmt(Math.abs(b.remaining))} over`;
          budgetSection += `\n  ${emoji} ${b.category}: ${remainStr} (${Math.round(b.pct)}% used)`;
        }
        sections.push(budgetSection);
      }

      // ------ 3. Price increase alerts detected today ------
      const { data: priceAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_name, old_amount, new_amount, annual_impact')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gte('detected_at', todayStart.toISOString());

      if (priceAlerts && priceAlerts.length > 0) {
        let alertSection = '\n\n*Price Increase Alerts Today*';
        for (const a of priceAlerts) {
          const increase = Number(a.new_amount) - Number(a.old_amount);
          alertSection += `\n  \ud83d\udcc8 ${a.merchant_name}: up ${fmt(increase)}/month (${fmt(Number(a.annual_impact))}/year)`;
        }
        sections.push(alertSection);
      }

      // ------ 4. Savings progress ------
      const { data: savings } = await supabase
        .from('verified_savings')
        .select('amount_saved')
        .eq('user_id', userId);

      const totalSaved = (savings ?? []).reduce(
        (sum, s) => sum + Math.abs(Number(s.amount_saved ?? 0)),
        0,
      );

      if (totalSaved > 0) {
        sections.push(`\n\n*Savings Progress*\n\ud83c\udfe6 Verified savings total: *${fmt(totalSaved)}*`);
      }

      // ------ 5. Tomorrow's upcoming payments ------
      const { data: tomorrowPayments } = await supabase
        .from('subscriptions')
        .select('provider_name, amount, billing_cycle')
        .eq('user_id', userId)
        .eq('status', 'active')
        .eq('next_billing_date', tomorrowStr);

      if (tomorrowPayments && tomorrowPayments.length > 0) {
        const totalDue = tomorrowPayments.reduce(
          (sum, p) => sum + Math.abs(Number(p.amount)),
          0,
        );
        let paymentSection = `\n\n*Tomorrow's Payments*\n${tomorrowPayments.length} payment${tomorrowPayments.length !== 1 ? 's' : ''} due (${fmt(totalDue)} total):`;
        for (const p of tomorrowPayments) {
          paymentSection += `\n  - ${p.provider_name}: ${fmt(Number(p.amount))}`;
        }
        sections.push(paymentSection);
      }

      // ------ 6. Motivational close ------
      if (totalSaved > 0) {
        sections.push(
          `\n\n\u2728 *You've saved ${fmt(totalSaved)} with Paybacker so far.* Keep it up!`,
        );
      } else {
        sections.push(
          '\n\n\u2728 *Start saving by letting Paybacker handle your bill complaints and cancellations.*',
        );
      }

      // ------ Build and send ------
      const message = sections.join('');
      const ok = await sendTelegramMessage(token, Number(chatId), message);

      if (ok) {
        sent++;
      } else {
        errors.push(`Failed to send to user ${userId}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-evening-summary] Error for user ${userId}:`, errMsg);
      errors.push(`${userId}: ${errMsg}`);
    }
  }

  console.log(
    `[telegram-evening-summary] Processed ${proSessions.length} users, sent ${sent}, skipped ${skipped}, errors ${errors.length}`,
  );

  return NextResponse.json({
    ok: true,
    users: proSessions.length,
    sent,
    skipped,
    errors: errors.length,
  });
}
