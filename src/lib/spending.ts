/**
 * Centralised "real spending" filter for bank_transactions.
 *
 * Why: every surface that summarises spending (weekly digest, money
 * hub, budgets, telegram morning/evening summary, monthly recap) has
 * historically done its own `SUM(ABS(amount)) WHERE amount < 0` and
 * therefore lumped together:
 *   - real outgoings (groceries, energy, mobile, eating out)
 *   - self-transfers between the user's own accounts
 *   - credit-card bill repayments (already counted as the underlying
 *     CC purchases, double-counts if added)
 *   - loan & mortgage principal repayments (treated as "saving" by
 *     most personal-finance products)
 *   - investments / Loqbox / pension top-ups
 *
 * The 27 Apr 2026 digest reported £20,733 of spending in 7 days, of
 * which ~£10k was self-transfers and £8k was a single business
 * payment (SOURCED NETWORK / AIRPROP LTD). Without exclusions the
 * digest is misinformation — exactly what this helper exists to
 * stop.
 *
 * Source of truth: callers should use either:
 *   - isRealSpend(tx) — boolean predicate for filtering arrays
 *   - sumRealSpend(rows) — summed `Math.abs(amount)` of the survivors
 *   - groupRealSpend(rows) — { [category]: total } breakdown
 *
 * Excluded user_category values (case-insensitive):
 *   transfers, transfer, internal_transfer, credit_card_payment,
 *   loan_repayment, loan_principal, mortgage_payment, investment,
 *   savings, pension, fee_refund (positive amount edge case)
 *
 * Excluded description keywords (regex, case-insensitive). These
 * catch txns that arrive uncategorised — Open Banking categories
 * lag the pull window, so we belt-and-braces by description.
 *
 * The helper is conservative: false positives (excluding real spend)
 * are worse than false negatives — we'd rather under-report by 5%
 * than tell users they spent 2x reality.
 */

export interface SpendingTxn {
  amount: number | string | null;
  description?: string | null;
  merchant_name?: string | null;
  category?: string | null;
  user_category?: string | null;
}

const EXCLUDED_CATEGORIES = new Set([
  'transfer',
  'transfers',
  'internal_transfer',
  'self_transfer',
  'credit_card_payment',
  'credit_card',
  'loan_repayment',
  'loan_principal',
  'mortgage_payment',
  'investment',
  'investments',
  'savings',
  'pension',
  'fee_refund',
]);

// Description-level fallback for txns that haven't been categorised
// yet. Each entry must match a real outgoing pattern unambiguously
// — we'd rather miss a transfer than misclassify a legitimate spend.
const EXCLUDED_DESCRIPTION_PATTERNS: RegExp[] = [
  /\bto a\/c\b/i,
  /\bvia mobile xfer\b/i,
  /\binternal transfer\b/i,
  /\btransfer to\b/i,
  /\bxfer to\b/i,
  /\bcredit card pmt\b/i,
  /\bcc payment\b/i,
  /\bloqbox\b/i,
  /\bvanguard\b.*\binvest/i,
  /\bnest pension\b/i,
];

export function isRealSpend(tx: SpendingTxn): boolean {
  const amount = typeof tx.amount === 'string' ? parseFloat(tx.amount) : tx.amount;
  if (amount == null || !Number.isFinite(amount) || amount >= 0) return false;

  const cat = (tx.user_category ?? tx.category ?? '').toLowerCase().trim();
  if (cat && EXCLUDED_CATEGORIES.has(cat)) return false;

  const desc = `${tx.description ?? ''} ${tx.merchant_name ?? ''}`;
  if (desc.trim()) {
    for (const re of EXCLUDED_DESCRIPTION_PATTERNS) {
      if (re.test(desc)) return false;
    }
  }
  return true;
}

export function sumRealSpend(rows: ReadonlyArray<SpendingTxn>): number {
  let total = 0;
  for (const tx of rows) {
    if (!isRealSpend(tx)) continue;
    const a = typeof tx.amount === 'string' ? parseFloat(tx.amount) : (tx.amount ?? 0);
    if (Number.isFinite(a)) total += Math.abs(a);
  }
  return total;
}

/**
 * Effective category to use when grouping. Falls back through:
 *   user_category → category → 'other'
 * (the digest cron previously read only `category`, which is null on
 * every row Yapily/TrueLayer ingest now writes — every txn ended up
 * in 'Other'.)
 */
export function effectiveCategory(tx: SpendingTxn): string {
  return (
    (tx.user_category ?? tx.category ?? '').toLowerCase().trim() || 'other'
  );
}

export function groupRealSpend(rows: ReadonlyArray<SpendingTxn>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of rows) {
    if (!isRealSpend(tx)) continue;
    const a = typeof tx.amount === 'string' ? parseFloat(tx.amount) : (tx.amount ?? 0);
    if (!Number.isFinite(a)) continue;
    const cat = effectiveCategory(tx);
    out[cat] = (out[cat] ?? 0) + Math.abs(a);
  }
  return out;
}

/**
 * Standard GBP formatter — en-GB locale, no fractional pence on
 * digest headlines (£20,733 not £20733.00). Use {fractionDigits: 2}
 * for itemised line totals.
 */
export function fmtGBP(amount: number, opts: { fractionDigits?: 0 | 2 } = {}): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: opts.fractionDigits ?? 0,
    maximumFractionDigits: opts.fractionDigits ?? 0,
  }).format(amount);
}
