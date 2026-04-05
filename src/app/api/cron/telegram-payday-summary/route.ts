// USER NOTIFICATION — sends each linked Pro user their own financial data only
/**
 * Telegram Payday Summary Cron
 *
 * Runs daily. Detects when a salary or large income transaction has arrived
 * today or yesterday, then sends a payday breakdown:
 * - Income received (from get_monthly_income_total RPC)
 * - Total expected bills for the month (from get_expected_bills RPC)
 * - Discretionary income remaining
 * - Suggested savings target (20% of income)
 *
 * Only sends once per payday per user (tracked in notification_log).
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

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
  const data = (await res.json()) as { ok: boolean };
  return data.ok;
}

// Minimum amount to consider as salary (£500+)
const MIN_SALARY_AMOUNT = 500;

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.TELEGRAM_USER_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });

  const supabase = getAdmin();
  let sent = 0;
  const errors: string[] = [];

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const todayStr = now.toISOString().split('T')[0];

  // Look for income transactions in last 2 days
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const tomorrowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

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
      // Look for salary/income transactions in the last 2 days
      // Income: positive amounts, categorised as income, or large credits
      const { data: incomeTxns } = await supabase
        .from('bank_transactions')
        .select('id, merchant_name, description, amount, timestamp, category, income_type')
        .eq('user_id', userId)
        .gt('amount', MIN_SALARY_AMOUNT) // Large credits only
        .gte('timestamp', twoDaysAgo)
        .lt('timestamp', tomorrowStart);

      if (!incomeTxns || incomeTxns.length === 0) continue;

      // Filter to salary-like transactions (income category or no TRANSFER flag)
      const salaryTxns = incomeTxns.filter((t) => {
        const cat = (t.category ?? '').toUpperCase();
        const desc = (t.description ?? '').toLowerCase();
        const incomeType = (t.income_type ?? '').toLowerCase();
        // Exclude transfers between own accounts
        if (cat === 'TRANSFER' || desc.includes('transfer') || desc.includes('to a/c')) return false;
        if (incomeType === 'transfer') return false;
        return true;
      });

      if (salaryTxns.length === 0) continue;

      // Use the date of the first salary transaction as the reference key
      const txnDate = salaryTxns[0].timestamp.split('T')[0];
      const refKey = `payday_${txnDate}`;

      // Check we haven't already sent a payday summary for this date
      const { data: existing } = await supabase
        .from('notification_log')
        .select('id')
        .eq('user_id', userId)
        .eq('notification_type', 'payday_summary')
        .eq('reference_key', refKey)
        .single();

      if (existing) continue;

      // Get total monthly income via RPC (same source as dashboard)
      const { data: incomeTotal } = await supabase.rpc('get_monthly_income_total', {
        p_user_id: userId,
        p_year: year,
        p_month: month,
      });

      const monthlyIncome = parseFloat(incomeTotal) || 0;
      if (monthlyIncome === 0) continue;

      // Get expected bills for this month via RPC
      const { data: rawBills } = await supabase.rpc('get_expected_bills', {
        p_user_id: userId,
        p_year: year,
        p_month: month,
      });

      const bills = (rawBills ?? []).filter(
        (b: { occurrence_count: number }) => b.occurrence_count >= 2 && b.occurrence_count <= 30,
      );

      const totalBills = bills.reduce(
        (sum: number, b: { expected_amount: string | number }) => sum + (parseFloat(String(b.expected_amount)) || 0),
        0,
      );

      const discretionary = Math.max(0, monthlyIncome - totalBills);
      const savingsTarget = monthlyIncome * 0.2;
      const savingsAfterBills = Math.max(0, discretionary - (discretionary * 0.8)); // 20% of discretionary

      const savingsRateEmoji = discretionary >= savingsTarget ? '🎯' : '💡';

      let message =
        `💰 *Payday! Here's your money plan:*\n\n` +
        `Salary received: *${fmt(monthlyIncome)}*\n\n` +
        `📋 Expected bills this month: *${fmt(totalBills)}*\n`;

      if (bills.length > 0) {
        const topBills = bills
          .sort((a: { expected_amount: string }, b: { expected_amount: string }) =>
            parseFloat(b.expected_amount) - parseFloat(a.expected_amount))
          .slice(0, 4);
        for (const bill of topBills) {
          message += `  • ${bill.provider_name}: ${fmt(parseFloat(String(bill.expected_amount)))}\n`;
        }
        if (bills.length > 4) message += `  _...and ${bills.length - 4} more_\n`;
      }

      message +=
        `\n✅ *Discretionary remaining: ${fmt(discretionary)}*\n\n` +
        `${savingsRateEmoji} *Savings suggestion (20%): ${fmt(savingsTarget)}*\n`;

      if (discretionary < totalBills * 0.1) {
        message += `\n⚠️ _Your bills are taking up most of your income this month. Ask me to find savings opportunities._`;
      } else {
        message += `\n_Ask me "show my subscriptions" or "find savings opportunities" to make the most of this month_`;
      }

      const ok = await sendTelegramMessage(token, Number(chatId), message);
      if (ok) {
        sent++;
        await supabase.from('notification_log').insert({
          user_id: userId,
          notification_type: 'payday_summary',
          reference_key: refKey,
        }).select().single();
      } else {
        errors.push(`Failed chat ${chatId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-payday-summary] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
