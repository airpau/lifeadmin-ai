import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications/dispatch';
import {
  detectRecurringPayments,
  dueWithin,
  type RecurringPayment,
} from '@/lib/payments/recurring-detector';

export const maxDuration = 60;

/**
 * Smart payment alerts — fires 30 minutes after each bank-sync run.
 *
 * Two signal types for Pro users with active Yapily connections:
 *
 * 1. Upcoming-payment + low-balance warning
 *    - Fires only from the 04:30 UTC run (morning brief) to avoid
 *      nagging users 5x daily.
 *    - Detects monthly/weekly recurring debits due in the next 1-3
 *      days and compares the expected amount to the user's combined
 *      account balance. If balance < expected × 1.2 we warn.
 *
 * 2. Large outgoing payment just posted (debit > £100)
 *    - Looks at debits in the last 4h (= sync interval).
 *    - Idempotent via the `payment_alerts_log` table — a row with
 *      (user_id, transaction_id, alert_type='large_debit') blocks
 *      retries.
 *
 * Note: incoming payment ("money in") alerts are owned by
 * /api/cron/income-received, which runs on the same schedule and
 * applies smarter filtering (excludes refunds, transfers, fees).
 * Don't duplicate that logic here.
 *
 * WhatsApp note: this route currently routes via email + telegram +
 * push only. Adding WhatsApp requires Meta-approved templates for
 * each alert shape (24h window doesn't apply for proactive alerts).
 * TODO: when templates are approved, add `whatsapp` payloads.
 */

const LARGE_TXN_THRESHOLD = 100;
const LOW_BALANCE_BUFFER = 1.2;
const RECENT_TX_WINDOW_HOURS = 4;

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function gbp(amount: number): string {
  return `£${Math.abs(amount).toFixed(2)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function daysUntil(isoDate: string, now: Date): number {
  const target = new Date(isoDate).getTime();
  const today = new Date(now.toISOString().split('T')[0]).getTime();
  return Math.round((target - today) / 86_400_000);
}

interface BankConnectionRow {
  id: string;
  user_id: string;
  current_balance: number | null;
  available_balance: number | null;
}

interface AlertableTx {
  id: string;
  amount: number;
  merchant_name: string | null;
  description: string | null;
  timestamp: string;
}

async function loadProUsersWithBanks(supabase: SupabaseClient): Promise<{
  userId: string;
  balance: number;
  connectionIds: string[];
}[]> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, subscription_tier, trial_ends_at, trial_converted_at, trial_expired_at');

  if (!profiles) return [];

  const now = Date.now();
  const proUserIds = profiles
    .filter((p) => {
      if (p.subscription_tier === 'pro') return true;
      const trialActive =
        p.trial_ends_at &&
        new Date(p.trial_ends_at).getTime() > now &&
        !p.trial_converted_at &&
        !p.trial_expired_at;
      return trialActive;
    })
    .map((p) => p.id);

  if (proUserIds.length === 0) return [];

  const { data: connections } = await supabase
    .from('bank_connections')
    .select('id, user_id, current_balance, available_balance')
    .in('user_id', proUserIds)
    .eq('provider', 'yapily')
    .eq('status', 'active')
    .is('archived_at', null)
    .is('deleted_at', null);

  if (!connections) return [];

  const byUser = new Map<string, { balance: number; connectionIds: string[] }>();
  for (const row of connections as BankConnectionRow[]) {
    const balance = Number(row.available_balance ?? row.current_balance ?? 0);
    const existing = byUser.get(row.user_id);
    if (existing) {
      existing.balance += balance;
      existing.connectionIds.push(row.id);
    } else {
      byUser.set(row.user_id, { balance, connectionIds: [row.id] });
    }
  }

  return Array.from(byUser.entries()).map(([userId, v]) => ({
    userId,
    balance: v.balance,
    connectionIds: v.connectionIds,
  }));
}

async function sendUpcomingPaymentAlert(
  supabase: SupabaseClient,
  userId: string,
  payment: RecurringPayment,
  balance: number,
  now: Date,
): Promise<void> {
  const days = daysUntil(payment.nextExpectedDate, now);
  const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const merchantSafe = escapeHtml(payment.merchant);
  const subject = `⚠️ ${payment.merchant} payment due ${when} — balance may be tight`;
  const html = `
    <p>Hi,</p>
    <p>Your <strong>${merchantSafe}</strong> payment of about
    <strong>${gbp(payment.averageAmount)}</strong> is expected ${when}.</p>
    <p>Your current balance across connected accounts is
    <strong>${gbp(balance)}</strong>. You may need to top up before it lands.</p>
    <p>— Paybacker</p>
  `;
  const telegramText =
    `⚠️ *Upcoming payment*\n\n` +
    `${payment.merchant} — ~${gbp(payment.averageAmount)} due ${when}.\n` +
    `Balance: ${gbp(balance)}. You may need to top up.`;

  await sendNotification(supabase, {
    userId,
    event: 'unusual_charge',
    email: { subject, html },
    telegram: { text: telegramText },
    push: {
      title: `${payment.merchant} payment ${when}`,
      body: `~${gbp(payment.averageAmount)} expected. Balance ${gbp(balance)}.`,
      deepLink: '/dashboard/money-hub',
    },
  });
}

async function sendLargeDebitAlert(
  supabase: SupabaseClient,
  userId: string,
  tx: AlertableTx,
  balanceAfter: number,
): Promise<void> {
  const merchant = tx.merchant_name || tx.description || 'a merchant';
  const merchantSafe = escapeHtml(merchant);
  const subject = `💸 Large payment out: ${gbp(tx.amount)} to ${merchant}`;
  const html = `
    <p>Hi,</p>
    <p>A large payment just left your account:
    <strong>${gbp(tx.amount)}</strong> to <strong>${merchantSafe}</strong>.</p>
    <p>Balance is now around <strong>${gbp(balanceAfter)}</strong>.</p>
    <p>— Paybacker</p>
  `;
  const telegramText =
    `💸 *Large payment out*\n\n` +
    `${gbp(tx.amount)} to ${merchant}.\n` +
    `Balance: ${gbp(balanceAfter)}.`;

  await sendNotification(supabase, {
    userId,
    event: 'unusual_charge',
    email: { subject, html },
    telegram: { text: telegramText },
    push: {
      title: 'Large payment out',
      body: `${gbp(tx.amount)} to ${merchant}. Balance ${gbp(balanceAfter)}.`,
      deepLink: '/dashboard/money-hub',
    },
  });
}

async function alreadyAlerted(
  supabase: SupabaseClient,
  userId: string,
  txId: string,
  alertType: 'large_debit',
): Promise<boolean> {
  const { count } = await supabase
    .from('payment_alerts_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('transaction_id', txId)
    .eq('alert_type', alertType);
  return (count ?? 0) > 0;
}

async function logAlert(
  supabase: SupabaseClient,
  row: {
    userId: string;
    alertType: 'upcoming_payment' | 'large_debit';
    transactionId?: string;
    merchant?: string | null;
    amount?: number;
    dueDate?: string;
    balanceAtSend: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from('payment_alerts_log').insert({
    user_id: row.userId,
    alert_type: row.alertType,
    transaction_id: row.transactionId ?? null,
    merchant: row.merchant ?? null,
    amount: row.amount ?? null,
    due_date: row.dueDate ?? null,
    balance_at_send: row.balanceAtSend,
    metadata: row.metadata ?? {},
  });
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();
  const runHour = now.getUTCHours();
  // Morning brief = 04:30 UTC. Upcoming-payment warnings fire only from
  // this run so users get one heads-up per day, not five.
  const isMorningRun = runHour === 4;

  const users = await loadProUsersWithBanks(supabase);
  if (users.length === 0) {
    return NextResponse.json({ ok: true, alertedUsers: 0, reason: 'no eligible Pro users' });
  }

  const sinceIso = new Date(now.getTime() - RECENT_TX_WINDOW_HOURS * 3_600_000).toISOString();

  const summary = {
    upcomingPaymentAlerts: 0,
    largeDebitAlerts: 0,
    usersScanned: users.length,
    errors: 0,
  };

  for (const user of users) {
    try {
      // === 1. Upcoming-payment + low-balance warning (morning run only) ===
      if (isMorningRun) {
        const predictions = await detectRecurringPayments(supabase, user.userId);
        const upcoming = dueWithin(predictions, 3, now);
        for (const payment of upcoming) {
          if (payment.confidence === 'low') continue;
          if (user.balance >= payment.averageAmount * LOW_BALANCE_BUFFER) continue;

          // Dedup via unique index on (user_id, merchant, due_date).
          const { count: prior } = await supabase
            .from('payment_alerts_log')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.userId)
            .eq('alert_type', 'upcoming_payment')
            .eq('merchant', payment.merchant)
            .eq('due_date', payment.nextExpectedDate);
          if (prior && prior > 0) continue;

          await sendUpcomingPaymentAlert(supabase, user.userId, payment, user.balance, now);
          await logAlert(supabase, {
            userId: user.userId,
            alertType: 'upcoming_payment',
            merchant: payment.merchant,
            amount: payment.averageAmount,
            dueDate: payment.nextExpectedDate,
            balanceAtSend: user.balance,
            metadata: { confidence: payment.confidence, frequency: payment.frequency },
          });
          summary.upcomingPaymentAlerts++;
        }
      }

      // === 2. Recent large debits ===
      // Filter by `created_at` (when we first synced the row) rather than
      // `timestamp` (date the merchant posted it). Yapily backfills older
      // transactions on every sync, so `timestamp` can be days behind even
      // when the row only just landed in our DB.
      // Credits are handled by /api/cron/income-received with better
      // refund/transfer filtering — only debits land here.
      const { data: recentTxs } = await supabase
        .from('bank_transactions')
        .select('id, amount, merchant_name, description, timestamp')
        .eq('user_id', user.userId)
        .lt('amount', 0)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: true });

      for (const raw of (recentTxs ?? []) as AlertableTx[]) {
        const amount = Number(raw.amount);
        if (Math.abs(amount) < LARGE_TXN_THRESHOLD) continue;

        if (await alreadyAlerted(supabase, user.userId, raw.id, 'large_debit')) continue;
        await sendLargeDebitAlert(supabase, user.userId, { ...raw, amount }, user.balance);
        await logAlert(supabase, {
          userId: user.userId,
          alertType: 'large_debit',
          transactionId: raw.id,
          merchant: raw.merchant_name ?? raw.description ?? null,
          amount: Math.abs(amount),
          balanceAtSend: user.balance,
        });
        summary.largeDebitAlerts++;
      }
    } catch (err) {
      summary.errors++;
      console.error(`[payment-alerts] user ${user.userId} failed:`, err);
    }
  }

  console.log(
    `[payment-alerts] run_hour=${runHour} morning=${isMorningRun} ` +
      `upcoming=${summary.upcomingPaymentAlerts} debits=${summary.largeDebitAlerts} ` +
      `users=${summary.usersScanned} errors=${summary.errors}`,
  );

  return NextResponse.json({ ok: true, runHour, isMorningRun, ...summary });
}
