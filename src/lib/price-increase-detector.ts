import { createClient } from '@supabase/supabase-js';
import { normaliseMerchantName } from '@/lib/merchant-normalise';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface PriceIncrease {
  merchantName: string;
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
  oldDate: string;
  newDate: string;
}

// Categories where amounts vary naturally -- skip these
const VARIABLE_CATEGORIES = new Set([
  'groceries', 'fuel', 'eating_out', 'shopping', 'cash', 'transfers',
  'income', 'other', 'transport', 'gambling',
  // Bank categories that are one-off purchases, not recurring bills
  'PURCHASE', 'ATM', 'TRANSFER', 'FEE_CHARGE', 'CASH',
  'CREDIT', 'INTEREST', 'OTHER',
]);

// Only these transaction categories can be recurring bills
const RECURRING_CATEGORIES = new Set([
  'DIRECT_DEBIT', 'STANDING_ORDER',
  // Mapped internal categories
  'energy', 'broadband', 'mobile', 'streaming', 'insurance',
  'mortgage', 'loans', 'credit', 'council_tax', 'water',
  'fitness', 'software', 'bills',
]);

/**
 * Detect price increases in recurring payments for a user.
 * Compares most recent payment amount for each merchant against
 * the average of previous payments. Flags increases > 2% on amounts > £5.
 */
export async function detectPriceIncreases(userId: string): Promise<PriceIncrease[]> {
  const supabase = getAdmin();

  // Fetch last 6 months of debit transactions
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: transactions, error } = await supabase
    .from('bank_transactions')
    .select('description, merchant_name, amount, timestamp, category, user_category, is_recurring')
    .eq('user_id', userId)
    .gte('timestamp', sixMonthsAgo.toISOString())
    .order('timestamp', { ascending: true });

  if (error || !transactions || transactions.length === 0) {
    return [];
  }

  // Group by normalised merchant name
  const merchantGroups = new Map<string, Array<{
    amount: number;
    timestamp: string;
    description: string;
    category: string;
    month: string;
  }>>();

  for (const tx of transactions) {
    const rawAmount = parseFloat(String(tx.amount));
    // Only look at outgoing payments (negative amounts = debits)
    // Skip incoming payments (positive amounts = credits/income)
    if (rawAmount >= 0) continue;
    const amount = Math.abs(rawAmount);

    // Use user_category if set, otherwise category
    const cat = tx.user_category || tx.category || '';
    if (VARIABLE_CATEGORIES.has(cat)) continue;
    // Only track categories that represent recurring bills
    if (!RECURRING_CATEGORIES.has(cat)) continue;

    const normalised = normaliseMerchantName(tx.description || tx.merchant_name || '');
    if (normalised === 'Unknown') continue;

    const month = new Date(tx.timestamp).toISOString().slice(0, 7); // YYYY-MM

    if (!merchantGroups.has(normalised)) {
      merchantGroups.set(normalised, []);
    }
    merchantGroups.get(normalised)!.push({
      amount,
      timestamp: tx.timestamp,
      description: tx.description || '',
      category: cat,
      month,
    });
  }

  const increases: PriceIncrease[] = [];

  for (const [merchant, txList] of merchantGroups) {
    // Deduplicate by month -- take one payment per month (the main recurring one)
    const byMonth = new Map<string, typeof txList[0]>();
    for (const tx of txList) {
      const existing = byMonth.get(tx.month);
      // Keep the one closest to the most common amount (likely the recurring payment)
      if (!existing || tx.amount > existing.amount) {
        byMonth.set(tx.month, tx);
      }
    }

    const monthlyPayments = Array.from(byMonth.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Need at least 2 months of data
    if (monthlyPayments.length < 2) continue;

    const latest = monthlyPayments[monthlyPayments.length - 1];
    const previous = monthlyPayments.slice(0, -1);

    // Skip if amount is £5 or under
    if (latest.amount <= 5) continue;

    // Calculate average of previous payments
    const avgPrevious = previous.reduce((sum, p) => sum + p.amount, 0) / previous.length;

    // Check previous payments were roughly consistent (std dev < 20% of mean)
    // This ensures we're comparing recurring payments, not random purchases
    const variance = previous.reduce((sum, p) => sum + Math.pow(p.amount - avgPrevious, 2), 0) / previous.length;
    const stdDev = Math.sqrt(variance);
    if (avgPrevious > 0 && stdDev / avgPrevious > 0.20) continue;

    // Calculate increase
    const increasePct = ((latest.amount - avgPrevious) / avgPrevious) * 100;

    // Flag if increase > 2%
    if (increasePct <= 2) continue;

    const annualImpact = (latest.amount - avgPrevious) * 12;

    increases.push({
      merchantName: latest.description,
      merchantNormalized: merchant,
      oldAmount: Math.round(avgPrevious * 100) / 100,
      newAmount: Math.round(latest.amount * 100) / 100,
      increasePct: Math.round(increasePct * 10) / 10,
      annualImpact: Math.round(annualImpact * 100) / 100,
      oldDate: previous[previous.length - 1].timestamp.split('T')[0],
      newDate: latest.timestamp.split('T')[0],
    });
  }

  // Sort by annual impact descending
  increases.sort((a, b) => b.annualImpact - a.annualImpact);

  return increases;
}
