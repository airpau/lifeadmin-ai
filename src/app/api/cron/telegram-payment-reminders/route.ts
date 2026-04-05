// USER NOTIFICATION — sends each linked Pro user their own financial data only
/**
 * Telegram Payment Reminders Cron
 *
 * Runs at 8am daily. For each Pro user with an active Telegram session,
 * checks for subscriptions, bills, and loan payments due in the next 7 days
 * and sends a formatted payment schedule message.
 *
 * Only runs if the user has payments due. Skipped if the user has opted out
 * via telegram_alert_preferences.payment_reminders = false.
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtPaymentDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
}

const LOAN_CATEGORIES = new Set(['mortgage', 'loan']);
const BILL_CATEGORIES = new Set(['utility', 'council_tax', 'water', 'broadband', 'mobile', 'bills']);
const FINANCE_KEYWORDS = [
  'mortgage', 'loan', 'finance', 'credit card', 'lendinvest', 'skipton',
  'novuna', 'zopa', 'barclaycard', 'mbna', 'amex', 'american express', 'securepay',
];

function getPaymentType(name: string, category: string | null): string {
  const lower = name.toLowerCase();
  if (FINANCE_KEYWORDS.some((kw) => lower.includes(kw))) return 'loan';
  if (LOAN_CATEGORIES.has(category ?? '')) return 'loan';
  if (BILL_CATEGORIES.has(category ?? '')) return 'bill';
  return 'subscription';
}

function buildPaymentMessage(
  payments: Array<{ provider_name: string; amount: string | number; next_billing_date: string; category: string | null }>,
): string {
  const total = payments.reduce((sum, p) => sum + Math.abs(Number(p.amount)), 0);

  let text = '\u{1F4B0} *Upcoming payments this week:*\n';
  for (const p of payments) {
    const dateLabel = fmtPaymentDate(p.next_billing_date);
    const type = getPaymentType(p.provider_name, p.category);
    const typeLabel = type !== 'subscription' ? ` (${type})` : '';
    text += `\n\u{1F4C5} ${dateLabel} \u2014 ${p.provider_name}${typeLabel}: ${fmt(Number(p.amount))}`;
  }

  text += `\n\n*Total due: ${fmt(total)}*`;
  text += '\n\n_Reply "details [payment]" for more info._';
  return text;
}

async function sendTelegramMessage(
  token: string,
  chatId: number,
  text: string,
): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
    }),
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
  if (!token) {
    return NextResponse.json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, { status: 500 });
  }

  const supabase = getAdmin();
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  // -------------------------------------------------------
  // Get all active linked Telegram sessions
  // -------------------------------------------------------
  const { data: sessions, error: sessErr } = await supabase
    .from('telegram_sessions')
    .select('user_id, telegram_chat_id')
    .eq('is_active', true);

  if (sessErr || !sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No active sessions', sent: 0 });
  }

  // -------------------------------------------------------
  // Filter to Pro users only
  // -------------------------------------------------------
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

  if (proSessions.length === 0) {
    return NextResponse.json({ ok: true, message: 'No Pro sessions', sent: 0 });
  }

  // -------------------------------------------------------
  // Check alert preferences — skip users who disabled payment reminders
  // -------------------------------------------------------
  const { data: allPrefs } = await supabase
    .from('telegram_alert_preferences')
    .select('user_id, payment_reminders')
    .in('user_id', proSessions.map((s) => s.user_id));

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.user_id, p]));
  const eligibleSessions = proSessions.filter((s) => {
    const pref = prefMap.get(s.user_id);
    return !pref || pref.payment_reminders !== false; // default to on
  });

  // -------------------------------------------------------
  // Date range: today to +7 days
  // -------------------------------------------------------
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const endStr = endDate.toISOString().split('T')[0];

  // -------------------------------------------------------
  // Process each eligible Pro user
  // -------------------------------------------------------
  for (const session of eligibleSessions) {
    const { user_id: userId, telegram_chat_id: chatId } = session;

    try {
      const { data: payments } = await supabase
        .from('subscriptions')
        .select('provider_name, amount, next_billing_date, category')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('next_billing_date', 'is', null)
        .gte('next_billing_date', todayStr)
        .lte('next_billing_date', endStr)
        .order('next_billing_date', { ascending: true });

      if (!payments || payments.length === 0) {
        skipped++;
        continue;
      }

      const message = buildPaymentMessage(payments);
      const ok = await sendTelegramMessage(token, Number(chatId), message);

      if (ok) {
        sent++;
      } else {
        errors.push(`Failed to send to user ${userId}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[telegram-payment-reminders] Error for user ${userId}:`, errMsg);
      errors.push(`${userId}: ${errMsg}`);
    }
  }

  console.log(
    `[telegram-payment-reminders] Processed ${eligibleSessions.length} users, sent ${sent}, skipped ${skipped}, errors ${errors.length}`,
  );

  return NextResponse.json({
    ok: true,
    users: eligibleSessions.length,
    sent,
    skipped,
    errors: errors.length,
  });
}
