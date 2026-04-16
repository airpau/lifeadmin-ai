/**
 * Telegram Evening Summary Cron
 *
 * Runs at 8pm UTC (9pm BST) daily. Sends each linked Pro user an evening
 * wrap-up covering month-to-date spending and income, budget progress,
 * upcoming payments, and recent notable transactions.
 *
 * Redesigned to use month-to-date figures rather than "today's spending"
 * because Open Banking syncs can lag by hours or even days — showing a
 * running monthly total is always accurate regardless of sync timing.
 *
 * Uses the Telegram Bot API directly (fetch to api.telegram.org) with
 * the TELEGRAM_USER_BOT_TOKEN.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Map transaction user_category values → budget category names.
// Required because auto_categorise may use different names than the budget UI.
const CATEGORY_ALIASES: Record<string, string> = {
  utility: 'energy',
  utilities: 'energy',
  electric: 'energy',
  gas: 'energy',
  supermarket: 'groceries',
  food: 'groceries',
  dining: 'eating_out',
  restaurant: 'eating_out',
  transport: 'travel',
  commute: 'travel',
  fuel: 'travel',
  petrol: 'travel',
};

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function fmt(amount: number): string {
  return `£${Math.abs(amount).toFixed(2)}`;
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

  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
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
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysRemaining = daysInMonth - dayOfMonth;
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const todayStr = now.toISOString().split('T')[0];
  const sevenDaysStr = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  const startOfMonthStr = new Date(year, month - 1, 1).toISOString();

  // For recent activity: look back 7 days to handle sync lag
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // -------------------------------------------------------
  // Process each Pro user
  // -------------------------------------------------------
  for (const session of eligibleSessions) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Quick check: does this user have any bank data at all?
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

      // ------ 1. Month-to-date spending and income ------
      const [spendingTotalResult, incomeTotalResult, spendingBreakdownResult, billsRes, monthDebitsRes] =
        await Promise.all([
          supabase.rpc('get_monthly_spending_total', { p_user_id: userId, p_year: year, p_month: month }),
          supabase.rpc('get_monthly_income_total',   { p_user_id: userId, p_year: year, p_month: month }),
          supabase.rpc('get_monthly_spending',        { p_user_id: userId, p_year: year, p_month: month }),
          supabase.rpc('get_expected_bills',          { p_user_id: userId, p_year: year, p_month: month }),
          supabase
            .from('bank_transactions')
            .select('merchant_name, description, amount, user_category')
            .eq('user_id', userId)
            .lt('amount', 0)
            .gte('timestamp', startOfMonthStr),
        ]);

      const monthlySpending = Number(spendingTotalResult.data ?? 0);
      const monthlyIncome   = Number(incomeTotalResult.data   ?? 0);
      const net = monthlyIncome - monthlySpending;

      let monthSection = `\n\n*${monthName} so far* (${dayOfMonth} of ${daysInMonth} days)`;
      if (monthlyIncome > 0) {
        monthSection += `\nIncome:   *${fmt(monthlyIncome)}*`;
      }
      if (monthlySpending > 0) {
        monthSection += `\nSpending: *${fmt(monthlySpending)}*`;
        if (monthlyIncome > 0) {
          const netEmoji = net >= 0 ? '\u2705' : '\u26a0\ufe0f';
          monthSection += `\nNet: ${netEmoji} *${net >= 0 ? '+' : ''}${net < 0 ? '-' : ''}${fmt(Math.abs(net))}*`;
        }
      } else {
        monthSection += '\n_No spending data yet this month_';
      }
      sections.push(monthSection);

      // ------ 2. Budget progress ------
      // Build spentByCategory from RPC results, applying category aliases
      // so budget categories like 'energy' match transaction categories like 'utility'.
      const spentByCategory: Record<string, number> = {};
      for (const row of (spendingBreakdownResult.data ?? [])) {
        const cat   = String(row.category);
        const total = Number(row.category_total);
        // Store under original name
        spentByCategory[cat] = (spentByCategory[cat] ?? 0) + total;
        // Also store under alias (e.g. 'utility' → 'energy')
        const alias = CATEGORY_ALIASES[cat];
        if (alias) {
          spentByCategory[alias] = (spentByCategory[alias] ?? 0) + total;
        }
      }

      const { data: budgetsData } = await supabase
        .from('money_hub_budgets')
        .select('category, monthly_limit')
        .eq('user_id', userId);

      if (budgetsData && budgetsData.length > 0) {
        const budgetStatus = budgetsData.map(b => {
          const limit   = Number(b.monthly_limit);
          const spent   = spentByCategory[b.category] ?? 0;
          const remaining = limit - spent;
          const pct     = limit > 0 ? (spent / limit) * 100 : 0;
          return { category: b.category, spent, limit, remaining, pct };
        }).sort((a, b) => b.pct - a.pct);

        let budgetSection = `\n\n*Budget Progress (${daysRemaining} days left)*`;
        for (const b of budgetStatus.slice(0, 6)) {
          const emoji = b.pct >= 100 ? '\u274c' : b.pct >= 80 ? '\u26a0\ufe0f' : '\u2705';
          const spentStr = b.spent > 0
            ? `${fmt(b.spent)} of ${fmt(b.limit)} (${Math.round(b.pct)}%)`
            : `${fmt(b.limit)} unspent`;
          budgetSection += `\n  ${emoji} ${b.category}: ${spentStr}`;
        }
        sections.push(budgetSection);
      }

      // ------ 3. Top spending categories this month ------
      // Show the actual breakdown so Paul can see where money is going,
      // even when categories don't align with predefined budgets.
      const topSpend = ((spendingBreakdownResult.data ?? []) as Array<{category: string; category_total: number}>)
        .filter(r => !['transfers', 'income'].includes(r.category))
        .sort((a, b) => Number(b.category_total) - Number(a.category_total))
        .slice(0, 5);

      if (topSpend.length > 0) {
        let breakdownSection = '\n\n*Top Spending This Month*';
        for (const r of topSpend) {
          breakdownSection += `\n  \ud83d\udcca ${r.category}: *${fmt(Number(r.category_total))}*`;
        }
        sections.push(breakdownSection);
      }

      // ------ 4. Bank data freshness check ------
      // If the most recent transaction is more than 2 days old, warn the user.
      const { data: latestTxRow } = await supabase
        .from('bank_transactions')
        .select('timestamp')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      let syncNote: string | null = null;
      if (latestTxRow?.timestamp) {
        const latestDate = new Date(latestTxRow.timestamp);
        const daysBehind = Math.floor((now.getTime() - latestDate.getTime()) / (24 * 60 * 60 * 1000));
        if (daysBehind >= 2) {
          const latestStr = latestDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
          syncNote = `\n\n\u26a0\ufe0f *Bank sync issue* — data last updated *${latestStr}* (${daysBehind} days ago). Please reconnect your bank account in the app.`;
        }
      }

      // ------ 5. Recent notable transactions (last 7 days) ------
      // 7-day window handles sync lag gracefully — shows real transactions
      // even when today's data hasn't synced yet.
      const { data: recentTxData } = await supabase
        .from('bank_transactions')
        .select('description, merchant_name, amount, user_category, timestamp')
        .eq('user_id', userId)
        .lt('amount', 0)
        .gte('timestamp', sevenDaysAgo.toISOString())
        .order('amount', { ascending: true }) // most negative first = biggest spend
        .limit(8);

      const EXCLUDE_CATS = new Set(['transfers', 'income']);
      const notableTx = (recentTxData ?? []).filter(
        tx => !EXCLUDE_CATS.has(tx.user_category ?? '') && Math.abs(Number(tx.amount)) >= 10,
      ).slice(0, 5);

      if (notableTx.length > 0) {
        let recentSection = '\n\n*Recent Transactions*';
        for (const tx of notableTx) {
          const merchant = tx.merchant_name || tx.description?.split(' ').slice(0, 4).join(' ') || 'Unknown';
          const date = new Date(tx.timestamp).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short',
          });
          recentSection += `\n  \ud83d\udcb3 ${merchant} (${date}): *${fmt(Math.abs(Number(tx.amount)))}*`;
        }
        sections.push(recentSection);
      }

      // ------ 6. Sync warning (after recent activity section) ------
      if (syncNote) {
        sections.push(syncNote);
      }

      // ------ 7. Upcoming payments — next 7 days ------
      const { data: upcomingPayments } = await supabase
        .from('subscriptions')
        .select('provider_name, amount, next_billing_date')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('next_billing_date', todayStr)
        .lte('next_billing_date', sevenDaysStr)
        .order('next_billing_date', { ascending: true });

      if (upcomingPayments && upcomingPayments.length > 0) {
        const totalDue = upcomingPayments.reduce(
          (sum, p) => sum + Math.abs(Number(p.amount)), 0,
        );
        let paymentSection = `\n\n*Upcoming Payments (next 7 days)*\n${upcomingPayments.length} payment${upcomingPayments.length !== 1 ? 's' : ''} due (${fmt(totalDue)} total):`;
        for (const p of upcomingPayments) {
          const dateStr = new Date(p.next_billing_date + 'T00:00:00Z').toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short',
          });
          paymentSection += `\n  - ${p.provider_name}: ${fmt(Number(p.amount))} (${dateStr})`;
        }
        sections.push(paymentSection);
      }

      // ------ 8. Intelligent spend forecast ------
      // Uses known upcoming bills + variable daily rate to avoid naive linear over-projection.
      // Formula: projected = spent_so_far + unpaid_bills + (daily_variable_rate × days_remaining)
      try {
        type ExpectedBill = {
          provider_name: string;
          expected_amount: string | number;
          billing_day: number;
          occurrence_count: number;
        };

        // Filter to bills seen at least twice (genuine recurrences, not one-offs)
        const rawBills = ((billsRes.data ?? []) as ExpectedBill[]).filter(
          (b) => b.occurrence_count >= 2 && b.occurrence_count <= 30,
        );

        // Build merchant name list from this month's non-transfer debits for paid-bill detection
        const paidMerchants = ((monthDebitsRes.data ?? []) as Array<{
          merchant_name?: string;
          description?: string;
          user_category?: string;
        }>)
          .filter((t) => !['transfers', 'income'].includes(t.user_category ?? ''))
          .map((t) =>
            (t.merchant_name || t.description || '').substring(0, 30).toLowerCase(),
          );

        let paidBillsTotal = 0;
        let unpaidBillsTotal = 0;
        let unpaidCount = 0;

        for (const bill of rawBills) {
          const amount = Math.abs(Number(bill.expected_amount));
          const name = (bill.provider_name || '').toLowerCase().substring(0, 15);
          // Loose name match: bill name appears in a transaction or vice-versa
          const isPaid = paidMerchants.some(
            (pm) => pm.includes(name) || name.includes(pm.substring(0, 8)),
          );
          if (isPaid) {
            paidBillsTotal += amount;
          } else {
            unpaidBillsTotal += amount;
            unpaidCount++;
          }
        }

        // Variable spend rate: strip out identified fixed bills so one-off large
        // transactions don't inflate the daily rate.
        const variableSpent = Math.max(0, monthlySpending - paidBillsTotal);
        const dailyVariableRate = dayOfMonth > 0 ? variableSpent / dayOfMonth : 0;
        const projectedVariable = dailyVariableRate * daysRemaining;
        const projectedTotal = monthlySpending + unpaidBillsTotal + projectedVariable;

        if (rawBills.length > 0 && monthlySpending > 0) {
          let forecastSection = `\n\n\u2728 *Month Forecast: ${fmt(projectedTotal)}*`;
          forecastSection += `\n  \u2705 Spent so far: *${fmt(monthlySpending)}*`;
          if (unpaidBillsTotal > 0) {
            forecastSection += `\n  \ud83d\udcb3 Known upcoming: *${fmt(unpaidBillsTotal)}* (${unpaidCount} bill${unpaidCount !== 1 ? 's' : ''} remaining)`;
          }
          if (daysRemaining > 0) {
            forecastSection += `\n  \ud83d\udcc8 Est. variable: *${fmt(projectedVariable)}* (${daysRemaining} days \xd7 ${fmt(dailyVariableRate)}/day)`;
          }
          sections.push(forecastSection);
        } else if (monthlySpending > 0 && dayOfMonth > 0) {
          // No recurring bill data yet — fall back to linear projection
          const naiveProjection = Math.round((monthlySpending / dayOfMonth) * daysInMonth);
          sections.push(
            `\n\n\u2728 At this rate you're on track to spend *${fmt(naiveProjection)}* this month.`,
          );
        } else {
          sections.push(
            '\n\n\u2728 *Paybacker is working hard to find savings and dispute unfair charges for you.*',
          );
        }
      } catch {
        // Forecast failed — degrade gracefully to simple linear projection
        const naiveProjection =
          dayOfMonth > 0 ? Math.round((monthlySpending / dayOfMonth) * daysInMonth) : 0;
        sections.push(
          naiveProjection > 0
            ? `\n\n\u2728 At this rate you're on track to spend *${fmt(naiveProjection)}* this month.`
            : '\n\n\u2728 *Paybacker is working hard to find savings and dispute unfair charges for you.*',
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
