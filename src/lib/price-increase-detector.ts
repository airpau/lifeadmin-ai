import { createClient } from '@supabase/supabase-js';
import { normaliseMerchantName } from '@/lib/merchant-normalise';
import { EXCLUDED_SAVINGS_CATEGORIES } from '@/lib/savings-utils';

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

// Categories where amounts vary naturally — skip outright. Loans/mortgage/
// council_tax/credit etc. are handled via EXCLUDED_SAVINGS_CATEGORIES (shared
// with the Money Hub deals detector) so the two stay in lockstep.
const VARIABLE_CATEGORIES = new Set([
  'groceries', 'fuel', 'eating_out', 'shopping', 'cash', 'transfers',
  'income', 'other', 'transport', 'gambling',
  // Bank categories that are one-off purchases, not recurring bills
  'PURCHASE', 'ATM', 'TRANSFER', 'FEE_CHARGE', 'CASH',
  'CREDIT', 'INTEREST', 'OTHER',
]);

// Only these transaction categories can be recurring bills. Loans / mortgages
// / council tax / credit were removed Apr 2026 — their amounts fluctuate with
// repayment schedules or billing cycles, which the std-dev filter wasn't
// catching (see Funding Circle + Winchester Council in real user data).
const RECURRING_CATEGORIES = new Set([
  'DIRECT_DEBIT', 'STANDING_ORDER',
  // Mapped internal categories
  'energy', 'broadband', 'mobile', 'streaming', 'insurance',
  'water', 'fitness', 'software', 'bills',
]);

function looksLikeTransferToSelf(
  description: string,
  merchantName: string | null,
  userNameTokens: string[],
): boolean {
  if (userNameTokens.length === 0) return false;
  const haystack = `${merchantName ?? ''} ${description}`.toLowerCase();
  // Require at least two user-name tokens to appear — a single common first
  // name would false-positive on any retailer that happens to share it.
  const matches = userNameTokens.filter((t) => haystack.includes(t));
  return matches.length >= 2;
}

async function loadUserNameTokens(userId: string): Promise<string[]> {
  const db = getAdmin();
  try {
    const { data } = await db
      .from('profiles')
      .select('first_name, last_name, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (!data) return [];
    const raw = [data.first_name, data.last_name, data.full_name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const tokens = Array.from(new Set(raw.split(/\s+/).filter((t) => t.length >= 3)));
    return tokens;
  } catch {
    return [];
  }
}

/**
 * Detect price increases in recurring payments for a user.
 * Compares most recent payment amount for each merchant against
 * the average of previous payments. Flags increases > 2% on amounts > £5.
 */
export async function detectPriceIncreases(userId: string): Promise<PriceIncrease[]> {
  const supabase = getAdmin();
  const userNameTokens = await loadUserNameTokens(userId);

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
    const catLower = cat.toLowerCase();
    if (VARIABLE_CATEGORIES.has(cat) || EXCLUDED_SAVINGS_CATEGORIES.has(catLower)) continue;
    // Only track categories that represent recurring bills
    if (!RECURRING_CATEGORIES.has(cat)) continue;

    // Transfers to self (e.g. "PAUL AIREY … HALIFAX VIA MOBILE — PYMT") can
    // otherwise look like huge price rises when amounts vary. Skip them.
    if (looksLikeTransferToSelf(tx.description || '', tx.merchant_name, userNameTokens)) continue;

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

    // Need at least 3 months of data — a single comparison against one
    // previous month turned out to be too noisy in real user data.
    if (monthlyPayments.length < 3) continue;

    const latest = monthlyPayments[monthlyPayments.length - 1];
    const previous = monthlyPayments.slice(0, -1);

    // Skip if amount is £5 or under
    if (latest.amount <= 5) continue;

    // Calculate average of previous payments
    const avgPrevious = previous.reduce((sum, p) => sum + p.amount, 0) / previous.length;

    // Require previous payments to be tight (std dev < 15% of mean). Loan /
    // council-tax style schedules used to slip through at 20%.
    const variance = previous.reduce((sum, p) => sum + Math.pow(p.amount - avgPrevious, 2), 0) / previous.length;
    const stdDev = Math.sqrt(variance);
    if (avgPrevious > 0 && stdDev / avgPrevious > 0.15) continue;

    // Calculate increase
    const increasePct = ((latest.amount - avgPrevious) / avgPrevious) * 100;

    // Require ≥5% increase (old 2% was catching rounding noise)
    if (increasePct < 5) continue;

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
