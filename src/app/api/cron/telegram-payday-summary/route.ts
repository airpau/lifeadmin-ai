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

// Minimum amount to consider as salary (£500+)
const MIN_SALARY_AMOUNT = 500;

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
      if (isQuietHours()) {
        console.log(`[telegram-payday-summary] quiet hours: suppressed message to chat ${chatId}`);
        continue;
      }
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

      // Use the actual detected salary amount rather than the monthly total
      const salaryAmount = salaryTxns.reduce((sum, t) => sum + Number(t.amount), 0);
      if (salaryAmount < MIN_SALARY_AMOUNT) continue;

      // Get expected bills for this month via RPC
      const { data: rawBills } = await supabase.rpc('get_expected_bills', {
        p_user_id: userId,
        p_year: year,
        p_month: month,
      });

      const bills = (rawBills ?? []).filter(
        (b: { occurrence_count: number }) => b.occurrence_count >= 2 && b.occurrence_count <= 30,
      );

      // Fetch actual transactions this month to check for already-paid bills
      const startOfMonth = new Date(year, month - 1, 1).toISOString();
      const endOfMonth = new Date(year, month, 1).toISOString();

      const [txnRes, manualRes] = await Promise.all([
        supabase
          .from('bank_transactions')
          .select('id, merchant_name, description, amount, timestamp')
          .eq('user_id', userId)
          .lt('amount', 0)
          .gte('timestamp', startOfMonth)
          .lt('timestamp', endOfMonth),
        supabase
          .from('manual_bill_payments')
          .select('provider_name, amount, paid_date')
          .eq('user_id', userId)
          .eq('year', year)
          .eq('month', month),
      ]);

      const actualDebits = (txnRes.data ?? []).map(t => {
        const raw = (t.merchant_name || t.description || '').toLowerCase().replace(/[^a-z0-9\\s]/g, '').trim();
        const cleaned = raw.replace(/\\s+\\d{6,}.*$/, '').replace(/\\s+(dd|ref|mandate)\\b.*$/i, '').trim();
        return {
          name: cleaned,
          nameTokens: cleaned.split(/\\s+/).filter(Boolean),
          amount: Math.abs(Number(t.amount)),
          date: new Date(t.timestamp),
        };
      });

      const manualPayments = new Map<string, { amount: number | null; date: string }>();
      for (const mp of (manualRes.data ?? [])) {
        const key = (mp.provider_name ?? '').toLowerCase().replace(/[^a-z0-9\\s]/g, '').trim();
        manualPayments.set(key, { amount: mp.amount ? Number(mp.amount) : null, date: mp.paid_date });
      }

      const matchBillToTransaction = (billName: string, expectedAmount: number) => {
        const normBill = billName.toLowerCase().replace(/[^a-z0-9\\s]/g, '').trim();
        const billTokens = normBill.split(/\\s+/).filter(Boolean);
        const COMMON_WORDS = new Set(['ltd', 'limited', 'uk', 'plc', 'the', 'direct', 'debit', 'payment', 'to', 'from', 'card']);
        const significantBillTokens = billTokens.filter(t => t.length >= 3 && !COMMON_WORDS.has(t));

        let bestMatch: { amount: number; date: Date } | null = null;
        let bestScore = 0;

        for (const debit of actualDebits) {
          let tokenMatches = 0;
          for (const bt of significantBillTokens) {
            if (debit.name.includes(bt) || debit.nameTokens.some((dt: string) => dt.includes(bt) || bt.includes(dt))) {
              tokenMatches++;
            }
          }
          const tokenScore = significantBillTokens.length > 0 ? tokenMatches / significantBillTokens.length : 0;
          const amountDiff = Math.abs(debit.amount - expectedAmount);
          const amountTolerance = expectedAmount * 0.20;
          const amountScore = amountDiff <= amountTolerance ? 1 : amountDiff <= expectedAmount * 0.5 ? 0.5 : 0;
          const combined = tokenScore * 0.6 + amountScore * 0.4;
          if (tokenScore >= 0.5 && combined > bestScore) {
            bestScore = combined;
            bestMatch = { amount: debit.amount, date: debit.date };
          }
        }
        if (!bestMatch && normBill.length >= 4) {
          const prefix = normBill.substring(0, Math.min(normBill.length, 8));
          for (const debit of actualDebits) {
            if (debit.name.startsWith(prefix) || debit.name.includes(prefix)) {
              if (Math.abs(debit.amount - expectedAmount) <= expectedAmount * 0.25) {
                return { amount: debit.amount, date: debit.date };
              }
            }
          }
        }
        return bestMatch;
      };

      const unpaidBills = bills.filter((bill: any) => {
        const expectedAmount = parseFloat(bill.expected_amount) || 0;
        const normBillKey = (bill.provider_name ?? '').toLowerCase().replace(/[^a-z0-9\\s]/g, '').trim();
        for (const [key, mp] of manualPayments) {
          if (normBillKey.includes(key) || key.includes(normBillKey.substring(0, Math.min(normBillKey.length, 8)))) {
            return false; // Paid manually
          }
        }
        const match = matchBillToTransaction(bill.provider_name, expectedAmount);
        return !match;
      });

      const totalUnpaidBills = unpaidBills.reduce(
        (sum: number, b: { expected_amount: string | number }) => sum + (parseFloat(String(b.expected_amount)) || 0),
        0,
      );

      const discretionary = Math.max(0, salaryAmount - totalUnpaidBills);

      // Evaluate actual affiliate deals / potential savings instead of generic 20% rule
      const { data: activeSubs } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .is('dismissed_at', null);

      let potentialSavings = 0;
      let matchedDealsCount = 0;

      if (activeSubs && activeSubs.length > 0) {
        const subIds = activeSubs.map((s: any) => s.id);
        const { data: comps } = await supabase
          .from('subscription_comparisons')
          .select('subscription_id, annual_saving, current_price')
          .in('subscription_id', subIds)
          .eq('dismissed', false)
          .order('annual_saving', { ascending: false });

        const grouped: Record<string, boolean> = {};
        for (const c of (comps || [])) {
          const currentPrice = parseFloat(String(c.current_price));
          const annualSaving = parseFloat(String(c.annual_saving));
          if (currentPrice > 0 && annualSaving > currentPrice * 12 * 0.8) continue;
          if (!grouped[c.subscription_id]) {
            grouped[c.subscription_id] = true;
            matchedDealsCount++;
            potentialSavings += annualSaving;
          }
        }
      }

      let message =
        `💰 *Payday! Here's your money plan:*\n\n` +
        `Salary received: *${fmt(salaryAmount)}*\n\n`;
        
      if (unpaidBills.length > 0) {
        message += `📋 Remaining bills to pay this month: *${fmt(totalUnpaidBills)}*\n`;
        const topBills = unpaidBills
          .sort((a: { expected_amount: string }, b: { expected_amount: string }) =>
            parseFloat(b.expected_amount) - parseFloat(a.expected_amount))
          .slice(0, 4);
        for (const bill of topBills) {
          message += `  • ${bill.provider_name}: ${fmt(parseFloat(String(bill.expected_amount)))}\n`;
        }
        if (unpaidBills.length > 4) message += `  _...and ${unpaidBills.length - 4} more_\n`;
      } else {
        message += `📋 Remaining bills: *£0.00* (All your expected bills are paid!)\n`;
      }

      message += `\n✅ *Discretionary remaining: ${fmt(discretionary)}*\n\n`;

      if (potentialSavings > 0) {
        message += `🔥 *We found ${fmt(potentialSavings)}/yr in savings* across ${matchedDealsCount} of your current providers! Switch to these deals to keep more of your payday.`;
      } else {
        message += `💡 Want to stretch your payday further? Ask me to scan for cheaper deals!`;
      }
      
      message += `\n\n_Tip: Ask me "find savings opportunities" to switch & save_`;

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
