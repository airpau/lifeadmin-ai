import { createClient } from '@supabase/supabase-js';
import { normaliseMerchantName } from '@/lib/merchant-normalise';

// Categories where amounts follow an amortisation schedule (loan balance
// shrinks, interest changes, credit-card balances vary) so a "price
// increase" is meaningless. These are a narrower set than the
// EXCLUDED_SAVINGS_CATEGORIES used by the deals widget — council_tax
// and business_rates are specifically NOT here, because annual hikes on
// those bills are exactly what we want to flag.
const EXCLUDED_FROM_PRICE_DETECTION = new Set([
  'mortgage', 'mortgages',
  'loan', 'loans',
  'credit_card', 'credit cards', 'credit-cards', 'credit',
  'car_finance', 'car finance', 'car-finance',
  'fee', 'fees',
  'parking',
]);

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
  category: string;
}

// Categories where amounts vary naturally — skip outright.
const VARIABLE_CATEGORIES = new Set([
  'groceries', 'fuel', 'eating_out', 'shopping', 'cash', 'transfers',
  'income', 'other', 'transport', 'gambling',
  // Bank categories that are one-off purchases, not recurring bills
  'PURCHASE', 'ATM', 'TRANSFER', 'FEE_CHARGE', 'CASH',
  'CREDIT', 'INTEREST', 'OTHER',
  // Variable-by-design bills -- flagging these as "price increases" is noise
  // because they legitimately move month to month (amortisation, council tax
  // 10-month cycle, variable credit card balances, BNPL).
  'mortgage', 'loans', 'credit', 'credit_card', 'council_tax',
  'bank_transfer', 'debt_repayment',
]);

<<<<<<< HEAD
// Categories that can legitimately be recurring bills where a hike is
// surface-worthy. council_tax and business_rates typically step up once
// a year (April) — the std-dev filter below still works because the
// previous N monthly payments are flat, and the April jump is flagged.
const RECURRING_CATEGORIES = new Set([
  'DIRECT_DEBIT', 'STANDING_ORDER',
  'energy', 'broadband', 'mobile', 'streaming', 'insurance',
  'water', 'fitness', 'software', 'bills',
  'council_tax', 'business_rates', 'tax',
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
=======
// Only these transaction categories can be recurring bills with a stable price
const RECURRING_CATEGORIES = new Set([
  'DIRECT_DEBIT', 'STANDING_ORDER',
  // Mapped internal categories (fixed-price subscriptions only)
  'energy', 'broadband', 'mobile', 'streaming', 'insurance',
  'water', 'fitness', 'software', 'bills',
]);

// Merchant-name heuristics -- block even if category looks recurring
const BLOCKED_MERCHANT_PATTERNS = [
  /\bcouncil\s*tax\b/i,
  /\bfunding\s*circle\b/i,
  /\bklarna\b/i,
  /\bpaypal\s*credit\b/i,
  /\bPYMT\s*FP\b/i,          // manual Faster Payments (e.g. Halifax mobile)
  /\bBTPP\b/i,               // Bill payment transfers
  /\b(b\/?card|barclaycard|amex|visa\s+plat)\b/i,
];

// Hard cap -- if the "new" payment is more than this multiple of the old,
// it is almost certainly a different kind of transaction, not a price rise.
const MAX_PRICE_INCREASE_RATIO = 2.0;

// Require at least this many prior payments to establish a stable baseline.
const MIN_PREVIOUS_PAYMENTS = 3;
>>>>>>> 6ed4f978 (feat: managed agents with memory + finance-analyst, decommission legacy executives, hardened MCP v2.1.0)

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
    if (VARIABLE_CATEGORIES.has(cat) || EXCLUDED_FROM_PRICE_DETECTION.has(catLower)) continue;
    // Only track categories that represent recurring bills
    if (!RECURRING_CATEGORIES.has(cat)) continue;

    // Transfers to self (e.g. "PAUL AIREY … HALIFAX VIA MOBILE — PYMT") can
    // otherwise look like huge price rises when amounts vary. Skip them.
    if (looksLikeTransferToSelf(tx.description || '', tx.merchant_name, userNameTokens)) continue;

    const normalised = normaliseMerchantName(tx.description || tx.merchant_name || '');
    if (normalised === 'Unknown') continue;

    // Merchant-level blocklist -- catches transactions that slip through the
    // category filter (manual transfers, council tax, loan repayments, etc.)
    const haystack = `${normalised} ${tx.description || ''}`;
    if (BLOCKED_MERCHANT_PATTERNS.some(rx => rx.test(haystack))) continue;

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

<<<<<<< HEAD
    // Need at least 3 months of data — a single comparison against one
    // previous month turned out to be too noisy in real user data.
    if (monthlyPayments.length < 3) continue;
=======
    // Need at least MIN_PREVIOUS_PAYMENTS months of prior data + 1 latest.
    // A single prior payment gives a variance of zero so any spike passes --
    // that's how manual transfers were sneaking through.
    if (monthlyPayments.length < MIN_PREVIOUS_PAYMENTS + 1) continue;
>>>>>>> 6ed4f978 (feat: managed agents with memory + finance-analyst, decommission legacy executives, hardened MCP v2.1.0)

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

    // Sanity cap -- anything more than a 2x jump is almost certainly a
    // different kind of transaction, not a price increase.
    if (avgPrevious > 0 && latest.amount > avgPrevious * MAX_PRICE_INCREASE_RATIO) continue;

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
      category: latest.category,
    });
  }

  // Sort by annual impact descending
  increases.sort((a, b) => b.annualImpact - a.annualImpact);

  return increases;
}
