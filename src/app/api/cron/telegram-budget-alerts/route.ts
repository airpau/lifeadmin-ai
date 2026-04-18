/**
 * Telegram Budget Alerts Cron
 *
 * Runs 3x daily: 8am, 1pm, 6pm.
 * For each Pro user with budgets set:
 * - Fetches actual spending via get_monthly_spending RPC (same source as dashboard)
 * - Alerts at 80% and 100% thresholds
 * - Only sends ONCE per threshold per category per month (tracked in budget_alert_log)
 * - Shows remaining budget and days left in the month
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isQuietHours } from '@/lib/telegram/quiet-hours';

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

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;

  // Days remaining in month
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate();

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
    .select('user_id, proactive_alerts, budget_overrun_alerts')
    .in('user_id', proSessions.map((s) => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));
  const eligible = proSessions.filter((s) => {
    const pref = prefMap.get(s.user_id);
    if (!pref) return true; // default on
    return pref.proactive_alerts !== false && pref.budget_overrun_alerts !== false;
  });

  for (const session of eligible) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      if (isQuietHours()) {
        console.log(`[telegram-budget-alerts] quiet hours: suppressed message to chat ${chatId}`);
        continue;
      }
      // Get user's budget limits
      const { data: budgets } = await supabase
        .from('money_hub_budgets')
        .select('category, monthly_limit')
        .eq('user_id', userId);

      if (!budgets || budgets.length === 0) continue;

      // Get actual spending by category via RPC (same as dashboard)
      const { data: spendingRows } = await supabase.rpc('get_monthly_spending', {
        p_user_id: userId,
        p_year: year,
        p_month: month,
      });

      type SpendingRow = { category: string; category_total: string };
      const spentByCategory: Record<string, number> = {};
      for (const row of (spendingRows as SpendingRow[]) ?? []) {
        spentByCategory[row.category] = parseFloat(row.category_total) || 0;
      }

      // Check which thresholds have already been alerted this month
      const { data: existingAlerts } = await supabase
        .from('budget_alert_log')
        .select('category, threshold')
        .eq('user_id', userId)
        .eq('month', monthStr);

      const alreadySent = new Set(
        (existingAlerts ?? []).map((a) => `${a.category}_${a.threshold}`),
      );

      // Find new threshold breaches
      const toAlert: Array<{ category: string; spent: number; limit: number; threshold: 80 | 100 }> = [];

      for (const budget of budgets) {
        const limit = Number(budget.monthly_limit);
        const spent = spentByCategory[budget.category] ?? 0;
        const pct = limit > 0 ? (spent / limit) * 100 : 0;

        // Check 100% first (higher priority)
        if (pct >= 100 && !alreadySent.has(`${budget.category}_100`)) {
          toAlert.push({ category: budget.category, spent, limit, threshold: 100 });
        } else if (pct >= 80 && pct < 100 && !alreadySent.has(`${budget.category}_80`)) {
          toAlert.push({ category: budget.category, spent, limit, threshold: 80 });
        }
      }

      if (toAlert.length === 0) continue;

      // Build and send alert messages
      for (const alert of toAlert) {
        const pct = Math.round((alert.spent / alert.limit) * 100);
        const remaining = Math.max(0, alert.limit - alert.spent);
        const emoji = alert.threshold === 100 ? '🚨' : '⚠️';
        const statusText = alert.threshold === 100
          ? `Budget exceeded! You've spent ${fmt(alert.spent - alert.limit)} over your limit.`
          : `You have ${fmt(remaining)} left for ${daysRemaining} more days.`;

        const message =
          `${emoji} *${alert.category.charAt(0).toUpperCase() + alert.category.slice(1)} Budget Alert*\n\n` +
          `${fmt(alert.spent)} / ${fmt(alert.limit)} (${pct}%)\n` +
          `${statusText}\n\n` +
          `_Ask me "show my budget status" for a full overview_`;

        const ok = await sendTelegramMessage(token, Number(chatId), message);
        if (ok) {
          sent++;
          // Log the alert to prevent duplicates
          await supabase
            .from('budget_alert_log')
            .insert({
              user_id: userId,
              category: alert.category,
              threshold: alert.threshold,
              month: monthStr,
            })
            .select()
            .single();
        } else {
          errors.push(`Failed budget alert for user ${userId} / ${alert.category}`);
        }

        // Small delay between messages to same user
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-budget-alerts] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
