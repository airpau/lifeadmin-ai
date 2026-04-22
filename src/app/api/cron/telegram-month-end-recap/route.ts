/**
 * Telegram Month-End Recap Cron
 *
 * Runs on the 1st of each month at 9am. Sends each linked Pro user a recap
 * of the month just ended:
 * - Total spending vs previous month (from get_monthly_spending_total RPC)
 * - Top 5 categories (from get_monthly_spending RPC)
 * - Income received (from get_monthly_income_total RPC)
 * - Savings rate: (income - spending) / income * 100
 * - Subscriptions cancelled last month and money saved
 * - Total saved since joining Paybacker
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

async function sendTelegramMessage(token: string, chatId: number, text: string): Promise<boolean> {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: 'Markdown' }),
    });
    const data = (await res.json()) as { ok: boolean };
    if (!data.ok) return false;
  }
  return true;
}

const CATEGORY_EMOJI: Record<string, string> = {
  food: '🛒', transport: '🚗', streaming: '📺', utilities: '⚡', utility: '⚡',
  bills: '📄', mortgage: '🏠', insurance: '🛡️', fitness: '💪', mobile: '📱',
  broadband: '🌐', software: '💻', gaming: '🎮', travel: '✈️', healthcare: '🏥',
  education: '📚', charity: '❤️', other: '💰',
};

function categoryEmoji(cat: string): string {
  return CATEGORY_EMOJI[cat.toLowerCase()] ?? '💰';
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
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

  // Running on 1st of the month — recap covers the month just ended
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth() + 1;

  // Month before that for comparison
  const prevPrevDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const prevPrevYear = prevPrevDate.getFullYear();
  const prevPrevMonth = prevPrevDate.getMonth() + 1;

  // Window for cancelled subscriptions last month
  const prevMonthStart = new Date(prevYear, prevMonth - 1, 1).toISOString();
  const prevMonthEnd = new Date(prevYear, prevMonth, 1).toISOString();

  // Get all active linked sessions
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

  const proUserIds = new Set(
    (profiles ?? [])
      .filter((p) => {
        const hasStripe = !!p.stripe_subscription_id;
        const isActivePro = p.subscription_tier === 'pro' &&
          (hasStripe
            ? ['active', 'trialing'].includes(p.subscription_status ?? '')
            : p.subscription_status === 'trialing');
        const isOnboardingTrial = !!p.trial_ends_at &&
          p.trial_ends_at > new Date().toISOString() &&
          !p.trial_converted_at &&
          !p.trial_expired_at;
        return isActivePro || (!hasStripe && isOnboardingTrial);
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
      // Parallel RPC calls — same RPCs as Money Hub dashboard
      const [prevSpendRes, prevPrevSpendRes, prevIncomeRes, prevBreakdownRes] = await Promise.all([
        supabase.rpc('get_monthly_spending_total', { p_user_id: userId, p_year: prevYear, p_month: prevMonth }),
        supabase.rpc('get_monthly_spending_total', { p_user_id: userId, p_year: prevPrevYear, p_month: prevPrevMonth }),
        supabase.rpc('get_monthly_income_total', { p_user_id: userId, p_year: prevYear, p_month: prevMonth }),
        supabase.rpc('get_monthly_spending', { p_user_id: userId, p_year: prevYear, p_month: prevMonth }),
      ]);

      const spending = parseFloat(prevSpendRes.data) || 0;
      const prevSpending = parseFloat(prevPrevSpendRes.data) || 0;
      const income = parseFloat(prevIncomeRes.data) || 0;

      // Skip users with no data
      if (spending === 0 && income === 0) continue;

      const savingsRate = income > 0 ? ((income - spending) / income) * 100 : 0;
      const spendingDiff = spending - prevSpending;

      // Top 5 spending categories
      type SpendingRow = { category: string; category_total: string; transaction_count: number };
      const categories: SpendingRow[] = prevBreakdownRes.data ?? [];
      const top5 = categories
        .map((r) => ({ category: r.category, total: parseFloat(r.category_total) || 0 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      // Cancelled subscriptions last month
      const { data: cancelled } = await supabase
        .from('subscriptions')
        .select('provider_name, amount, billing_cycle')
        .eq('user_id', userId)
        .eq('status', 'cancelled')
        .gte('updated_at', prevMonthStart)
        .lt('updated_at', prevMonthEnd);

      // Total verified savings since joining
      const { data: savings } = await supabase
        .from('verified_savings')
        .select('amount_saved')
        .eq('user_id', userId);

      const totalSaved = (savings ?? []).reduce((sum, s) => sum + (Number(s.amount_saved) || 0), 0);

      // Build message
      const sections: string[] = [];
      sections.push(`📊 *${monthLabel(prevYear, prevMonth)} Financial Recap*`);

      // Income & spending
      sections.push(`\n\n*Overview*`);
      sections.push(`\n  💰 Income received: *${fmt(income)}*`);
      sections.push(`\n  💸 Total spending: *${fmt(spending)}*`);

      if (prevSpending > 0) {
        const arrow = spendingDiff > 0 ? '📈' : '📉';
        const direction = spendingDiff > 0 ? 'up' : 'down';
        sections.push(`\n  ${arrow} vs ${monthLabel(prevPrevYear, prevPrevMonth)}: *${fmt(Math.abs(spendingDiff))} ${direction}*`);
      }

      if (income > 0) {
        const rateEmoji = savingsRate >= 20 ? '🎉' : savingsRate >= 10 ? '👍' : '⚠️';
        sections.push(`\n  ${rateEmoji} Savings rate: *${savingsRate.toFixed(1)}%*`);
        const netPosition = income - spending;
        // fmt() uses Math.abs, so we must add the sign manually for both cases.
        const netSign = netPosition >= 0 ? '+' : '-';
        sections.push(`\n  ${netPosition >= 0 ? '✅' : '❌'} Net position: *${netSign}${fmt(netPosition)}*`);
      }

      // Top 5 categories
      if (top5.length > 0) {
        sections.push(`\n\n*Top Spending Categories*`);
        for (const c of top5) {
          const emoji = categoryEmoji(c.category);
          const pct = spending > 0 ? ((c.total / spending) * 100).toFixed(0) : '0';
          sections.push(`\n  ${emoji} ${c.category}: *${fmt(c.total)}* (${pct}%)`);
        }
      }

      // Cancelled subscriptions
      if (cancelled && cancelled.length > 0) {
        const annualSaved = cancelled.reduce((sum, c) => {
          const monthly = c.billing_cycle === 'yearly' ? Number(c.amount) / 12 :
            c.billing_cycle === 'quarterly' ? Number(c.amount) / 3 : Number(c.amount);
          return sum + monthly * 12;
        }, 0);
        sections.push(`\n\n*Cancelled This Month*`);
        for (const c of cancelled) {
          sections.push(`\n  ✂️ ${c.provider_name} — ${fmt(Number(c.amount))}/${c.billing_cycle ?? 'month'}`);
        }
        sections.push(`\n  _Saves ~${fmt(annualSaved)}/year_`);
      }

      // Lifetime savings milestone
      if (totalSaved > 0) {
        sections.push(`\n\n🏆 *Total saved with Paybacker: ${fmt(totalSaved)}*`);
      }

      const message = sections.join('');
      const ok = await sendTelegramMessage(token, Number(chatId), message);
      if (ok) sent++;
      else errors.push(`Failed chat ${chatId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-month-end-recap] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
