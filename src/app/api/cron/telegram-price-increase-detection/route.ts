// USER NOTIFICATION — sends each linked Pro user their own financial data only
/**
 * Telegram Price Increase Detection Cron
 *
 * Runs daily after bank sync. Compares this month's recurring payment amounts
 * to previous months to detect price rises > £1.
 *
 * Strategy: for each subscription, find matching bank transactions this month
 * and the month before. If the average amount has increased by > £1, alert.
 *
 * Uses notification_log to prevent re-alerting the same price increase.
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

function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/paypal\s*\*/gi, '')
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk)\b/g, '')
    .replace(/\d{5,}/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normaliseName(a);
  const nb = normaliseName(b);
  if (!na || !nb) return false;
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  return longer.includes(shorter.substring(0, Math.min(shorter.length, 8)));
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

  const token = process.env.TELEGRAM_USER_BOT_TOKEN;
  if (!token) return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });

  const supabase = getAdmin();
  let sent = 0;
  const errors: string[] = [];

  const now = new Date();

  // Current month window
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // Previous month window
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const prevMonthEnd = thisMonthStart;

  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

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
    .select('user_id, proactive_alerts, price_increase_alerts')
    .in('user_id', proSessions.map((s) => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));
  const eligible = proSessions.filter((s) => {
    const pref = prefMap.get(s.user_id);
    if (!pref) return true;
    return pref.proactive_alerts !== false && pref.price_increase_alerts !== false;
  });

  for (const session of eligible) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      // Get active subscriptions
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('id, provider_name, amount, billing_cycle, category')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('billing_cycle', ['monthly', 'quarterly']);

      if (!subscriptions || subscriptions.length === 0) continue;

      // Get transactions for both months
      const [thisMonthRes, prevMonthRes] = await Promise.all([
        supabase
          .from('bank_transactions')
          .select('merchant_name, description, amount')
          .eq('user_id', userId)
          .lt('amount', 0)
          .gte('timestamp', thisMonthStart)
          .lt('timestamp', thisMonthEnd),
        supabase
          .from('bank_transactions')
          .select('merchant_name, description, amount')
          .eq('user_id', userId)
          .lt('amount', 0)
          .gte('timestamp', prevMonthStart)
          .lt('timestamp', prevMonthEnd),
      ]);

      const thisTxns = thisMonthRes.data ?? [];
      const prevTxns = prevMonthRes.data ?? [];

      // For each subscription, find matching transactions and compare amounts
      const increases: Array<{
        name: string;
        prevAmount: number;
        newAmount: number;
        increase: number;
        annualIncrease: number;
      }> = [];

      for (const sub of subscriptions) {
        const thisSub = thisTxns
          .filter((t) => namesMatch(sub.provider_name, t.merchant_name || t.description || ''))
          .map((t) => Math.abs(Number(t.amount)));

        const prevSub = prevTxns
          .filter((t) => namesMatch(sub.provider_name, t.merchant_name || t.description || ''))
          .map((t) => Math.abs(Number(t.amount)));

        // Need at least one match in each month
        if (thisSub.length === 0 || prevSub.length === 0) continue;

        const thisAmt = Math.max(...thisSub);
        const prevAmt = Math.max(...prevSub);
        const increase = thisAmt - prevAmt;

        // Only alert if increase > £1
        if (increase <= 1) continue;

        // Check we haven't already alerted for this increase this month
        const refKey = `${sub.provider_name.toLowerCase().replace(/\s+/g, '_')}_${monthStr}`;
        const { data: existing } = await supabase
          .from('notification_log')
          .select('id')
          .eq('user_id', userId)
          .eq('notification_type', 'price_increase')
          .eq('reference_key', refKey)
          .single();

        if (existing) continue;

        const annualIncrease = increase * 12;
        increases.push({ name: sub.provider_name, prevAmount: prevAmt, newAmount: thisAmt, increase, annualIncrease });
      }

      if (increases.length === 0) continue;

      // Send one message per increase
      for (const inc of increases) {
        const message =
          `📈 *Price Increase Detected*\n\n` +
          `*${inc.name}* has gone up:\n` +
          `${fmt(inc.prevAmount)}/month → *${fmt(inc.newAmount)}/month* (+${fmt(inc.increase)})\n` +
          `Annual impact: *+${fmt(inc.annualIncrease)}/year*\n\n` +
          `_Ask me to "write a complaint to ${inc.name} about the price increase" or show alternative deals_`;

        const ok = await sendTelegramMessage(token, Number(chatId), message);
        if (ok) {
          sent++;
          const refKey = `${inc.name.toLowerCase().replace(/\s+/g, '_')}_${monthStr}`;
          await supabase.from('notification_log').insert({
            user_id: userId,
            notification_type: 'price_increase',
            reference_key: refKey,
          }).select().single();
        } else {
          errors.push(`Failed chat ${chatId}`);
        }

        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-price-increase-detection] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
