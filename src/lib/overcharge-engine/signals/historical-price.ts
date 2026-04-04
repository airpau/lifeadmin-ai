import { createClient } from '@supabase/supabase-js';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import type { OverchargeSignal } from '../types';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const VARIABLE_CATEGORIES = new Set([
  'groceries', 'fuel', 'eating_out', 'shopping', 'cash', 'transfers',
  'income', 'other', 'transport', 'gambling',
  'PURCHASE', 'ATM', 'TRANSFER', 'FEE_CHARGE', 'CASH', 'CREDIT', 'INTEREST', 'OTHER',
]);

/**
 * Signal 1: Historical price increase detection (weight: 30)
 * Wraps logic from price-increase-detector.ts but returns a signal score
 * instead of a standalone PriceIncrease object.
 *
 * Score: 100 if >20% increase in 6 months, 50 if >5%, 0 if stable/decreasing
 */
export async function historicalPriceSignal(
  userId: string,
  merchantName: string,
  currentMonthly: number
): Promise<OverchargeSignal> {
  const supabase = getAdmin();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const normalised = normaliseMerchantName(merchantName);

  const { data: transactions } = await supabase
    .from('bank_transactions')
    .select('amount, timestamp, user_category, category')
    .eq('user_id', userId)
    .gte('timestamp', sixMonthsAgo.toISOString())
    .order('timestamp', { ascending: true });

  if (!transactions || transactions.length === 0) {
    return { type: 'price_increase', weight: 30, score: 0, detail: 'No transaction history available' };
  }

  // Filter to matching merchant transactions
  const matched = transactions.filter(tx => {
    const rawAmount = parseFloat(String(tx.amount));
    if (rawAmount >= 0) return false;
    const cat = tx.user_category || tx.category || '';
    if (VARIABLE_CATEGORIES.has(cat)) return false;
    return true;
  });

  // Group by month and find this merchant
  const byMonth = new Map<string, number[]>();
  for (const tx of matched) {
    const amount = Math.abs(parseFloat(String(tx.amount)));
    if (amount <= 5) continue;
    const month = new Date(tx.timestamp).toISOString().slice(0, 7);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(amount);
  }

  // Find payments close to current monthly amount (within 30%)
  const relevantPayments: { month: string; amount: number }[] = [];
  for (const [month, amounts] of byMonth) {
    for (const amt of amounts) {
      if (Math.abs(amt - currentMonthly) / currentMonthly < 0.3 || amt === currentMonthly) {
        relevantPayments.push({ month, amount: amt });
      }
    }
  }

  if (relevantPayments.length < 2) {
    return { type: 'price_increase', weight: 30, score: 0, detail: 'Insufficient payment history for trend analysis' };
  }

  // Sort by month and compare earliest vs latest
  relevantPayments.sort((a, b) => a.month.localeCompare(b.month));
  const earliest = relevantPayments[0];
  const latest = relevantPayments[relevantPayments.length - 1];

  const avgEarlier = relevantPayments.slice(0, -1).reduce((s, p) => s + p.amount, 0) / (relevantPayments.length - 1);
  const increasePct = avgEarlier > 0 ? ((latest.amount - avgEarlier) / avgEarlier) * 100 : 0;

  if (increasePct <= 0) {
    return { type: 'price_increase', weight: 30, score: 0, detail: 'Price stable or decreasing' };
  }

  // Score: >20% = 100, >10% = 75, >5% = 50, >2% = 25
  let score = 0;
  if (increasePct > 20) score = 100;
  else if (increasePct > 10) score = 75;
  else if (increasePct > 5) score = 50;
  else if (increasePct > 2) score = 25;

  const annualImpact = (latest.amount - avgEarlier) * 12;

  return {
    type: 'price_increase',
    weight: 30,
    score,
    detail: `${Math.round(increasePct)}% increase over 6 months (${earliest.month} to ${latest.month}), ~£${Math.round(annualImpact)}/yr impact`,
    data: { increasePct: Math.round(increasePct * 10) / 10, annualImpact: Math.round(annualImpact * 100) / 100, oldAvg: Math.round(avgEarlier * 100) / 100 },
  };
}
