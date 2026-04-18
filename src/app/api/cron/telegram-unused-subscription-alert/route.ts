/**
 * Telegram Unused Subscription Alert Cron
 *
 * Runs every Wednesday. Finds active subscriptions where no matching bank
 * transaction has been seen in the last 90 days, suggesting the user is
 * paying for something they no longer use.
 *
 * Matching uses normalised merchant names (same approach as expected-bills).
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
  // Check if one contains the first 6 chars of the other
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

  const token = (process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN);
  if (!token) return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });

  const supabase = getAdmin();
  let sent = 0;
  const errors: string[] = [];

  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
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
      if (isQuietHours()) {
        console.log(`[telegram-unused-subscription-alert] quiet hours: suppressed message to chat ${chatId}`);
        continue;
      }
      // Get active subscriptions (exclude one-time and yearly — yearly is expected to have gaps)
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('id, provider_name, amount, billing_cycle, category, created_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .in('billing_cycle', ['monthly', 'quarterly'])
        .order('amount', { ascending: false });

      if (!subscriptions || subscriptions.length === 0) continue;

      // Get recent transactions (last 90 days)
      const { data: recentTxns } = await supabase
        .from('bank_transactions')
        .select('merchant_name, description, amount')
        .eq('user_id', userId)
        .lt('amount', 0) // debits only
        .gte('timestamp', ninetyDaysAgo);

      if (!recentTxns || recentTxns.length === 0) continue;

      // Skip subscriptions added within the last 90 days (they may just be new)
      const cutoff = new Date(ninetyDaysAgo);
      const establishedSubs = subscriptions.filter(
        (s) => !s.created_at || new Date(s.created_at) < cutoff,
      );

      // Find subscriptions with no matching transactions
      const unused: typeof establishedSubs = [];
      for (const sub of establishedSubs) {
        const matched = recentTxns.some((txn) => {
          const txnName = txn.merchant_name || txn.description || '';
          return namesMatch(sub.provider_name, txnName);
        });
        if (!matched) unused.push(sub);
      }

      if (unused.length === 0) continue;

      // Check notification_log — don't re-alert for the same subscription this month
      const { data: existing } = await supabase
        .from('notification_log')
        .select('reference_key')
        .eq('user_id', userId)
        .eq('notification_type', 'unused_subscription')
        .gte('sent_at', `${monthStr}-01`);

      const alreadyAlerted = new Set((existing ?? []).map((e) => e.reference_key));
      const newUnused = unused.filter(
        (s) => !alreadyAlerted.has(`${s.provider_name.toLowerCase()}_${monthStr}`),
      );

      if (newUnused.length === 0) continue;

      // Build message
      const totalMonthly = newUnused.reduce((sum, s) => {
        const amt = Number(s.amount);
        if (s.billing_cycle === 'quarterly') return sum + amt / 3;
        return sum + amt;
      }, 0);

      let message = `💤 *Unused Subscriptions Detected*\n\n`;
      message += `These subscriptions have had no matching bank transactions in 90 days:\n\n`;

      for (const sub of newUnused.slice(0, 5)) {
        const monthly = sub.billing_cycle === 'quarterly' ? Number(sub.amount) / 3 : Number(sub.amount);
        const annual = monthly * 12;
        message += `• *${sub.provider_name}* — ${fmt(Number(sub.amount))}/${sub.billing_cycle ?? 'month'} (~${fmt(annual)}/year)\n`;
      }

      if (newUnused.length > 5) {
        message += `_...and ${newUnused.length - 5} more_\n`;
      }

      message += `\nTotal: *${fmt(totalMonthly)}/month* you may not be using\n\n`;
      message += `_Reply "cancel [name]" or ask me to draft a cancellation email_`;

      const ok = await sendTelegramMessage(token, Number(chatId), message);
      if (ok) {
        sent++;
        // Log to prevent re-alerting this month
        for (const sub of newUnused) {
          await supabase.from('notification_log').insert({
            user_id: userId,
            notification_type: 'unused_subscription',
            reference_key: `${sub.provider_name.toLowerCase()}_${monthStr}`,
          }).select().single();
        }
      } else {
        errors.push(`Failed chat ${chatId}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-unused-subscription-alert] Error for user ${userId}:`, msg);
      errors.push(`${userId}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, sent, errors: errors.length });
}
