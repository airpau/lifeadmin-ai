/**
 * Telegram Weekly Summary Cron
 *
 * Runs every Monday at 8am. Sends each linked Pro user a week-ahead lookahead:
 * - Bills due this week (from get_expected_bills RPC)
 * - Total outgoings for the week
 * - Contracts/subscriptions renewing in the next 30 days
 *
 * Data sourced exclusively from the same RPCs used by the Money Hub dashboard.
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
    weekday: 'short',
    day: 'numeric',
    month: 'short',
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

  // Get all active linked sessions
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

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // Build the 7-day window as real Date objects so month-boundary weeks work
  // correctly (e.g. Jan 28 → Feb 3 includes bills due on Feb 1, 2, 3).
  const windowStart = new Date(now);
  windowStart.setHours(0, 0, 0, 0);
  const windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Helper: convert a billing_day for a given year/month into a real Date,
  // clamped to the last day of that month to handle short months.
  function billingDayToDate(billingDay: number, y: number, m: number): Date {
    const lastDay = new Date(y, m, 0).getDate();
    return new Date(y, m - 1, Math.min(billingDay, lastDay));
  }

  // Detect if the 7-day window crosses into next month
  const nextMonthDate = new Date(year, month, 1); // 1st of next month
  const crossesMonthBoundary = windowEnd >= nextMonthDate;
  const nextYear = nextMonthDate.getFullYear();
  const nextMonth = nextMonthDate.getMonth() + 1;

  // Contract expiry window: next 30 days
  const todayStr = now.toISOString().split('T')[0];
  const in30DaysStr = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  for (const session of eligible) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Fetch bills for the current month; also fetch next month's bills when
      // the 7-day window crosses a month boundary.
      const billFetches = [
        supabase.rpc('get_expected_bills', { p_user_id: userId, p_year: year, p_month: month }),
      ];
      if (crossesMonthBoundary) {
        billFetches.push(
          supabase.rpc('get_expected_bills', { p_user_id: userId, p_year: nextYear, p_month: nextMonth }),
        );
      }
      const billResults = await Promise.all(billFetches);

      // Combine and tag each bill with the month it belongs to
      type RawBill = { provider_name: string; expected_amount: string | number; billing_day: number; occurrence_count: number };
      const allBills: Array<RawBill & { fetchYear: number; fetchMonth: number }> = [];
      billResults.forEach((res, idx) => {
        const fy = idx === 0 ? year : nextYear;
        const fm = idx === 0 ? month : nextMonth;
        for (const b of (res.data ?? []) as RawBill[]) {
          allBills.push({ ...b, fetchYear: fy, fetchMonth: fm });
        }
      });

      // Filter to bills whose actual expected date falls within the 7-day window.
      // Using real Date objects avoids integer overflow across month boundaries.
      const weekBills = allBills.filter((b) => {
        if (b.occurrence_count < 2 || b.occurrence_count > 30) return false;
        const billDate = billingDayToDate(b.billing_day, b.fetchYear, b.fetchMonth);
        return billDate >= windowStart && billDate < windowEnd;
      });

      // Contracts/subscriptions ending in next 30 days
      const { data: upcomingContracts } = await supabase
        .from('subscriptions')
        .select('provider_name, contract_end_date, amount, billing_cycle, category')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('contract_end_date', 'is', null)
        .gte('contract_end_date', todayStr)
        .lte('contract_end_date', in30DaysStr)
        .order('contract_end_date', { ascending: true });

      // Only send if there's something to report
      if (
        (!weekBills || weekBills.length === 0) &&
        (!upcomingContracts || upcomingContracts.length === 0)
      ) {
        continue;
      }

      const sections: string[] = [];
      sections.push('📅 *Your Week Ahead*');

      // Bills this week
      if (weekBills && weekBills.length > 0) {
        const weekTotal = weekBills.reduce(
          (sum: number, b: { expected_amount: string | number }) => sum + (parseFloat(String(b.expected_amount)) || 0),
          0,
        );

        sections.push(`\n\n💸 *Bills Due This Week*\nTotal: *${fmt(weekTotal)}*`);

        for (const bill of weekBills) {
          const billDate = billingDayToDate(bill.billing_day, bill.fetchYear, bill.fetchMonth);
          const diffDays = Math.round((billDate.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24));
          const dayLabel = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' :
            billDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
          const amount = parseFloat(String(bill.expected_amount)) || 0;
          sections.push(`\n  • *${bill.provider_name}* — ${fmt(amount)} (${dayLabel})`);
        }
      } else {
        sections.push('\n\n✅ *No bills expected this week*');
      }

      // Contract renewals/endings
      if (upcomingContracts && upcomingContracts.length > 0) {
        sections.push('\n\n📋 *Contract Endings in Next 30 Days*');
        for (const c of upcomingContracts) {
          const endDate = new Date(c.contract_end_date);
          const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const urgency = daysLeft <= 7 ? '⚠️' : daysLeft <= 14 ? '🔔' : '📋';
          sections.push(
            `\n  ${urgency} *${c.provider_name}* — ${fmt(Number(c.amount))}/${c.billing_cycle ?? 'month'} ends ${fmtDate(c.contract_end_date)} (${daysLeft} days)`,
          );
        }
        sections.push('\n\n_Ask me to draft a switch letter or get alternative quotes_');
      }

      const message = sections.join('');
      const ok = await sendTelegramMessage(token, Number(chatId), message);
      if (ok) sent++;
      else errors.push(`Failed chat ${chatId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-weekly-summary] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
