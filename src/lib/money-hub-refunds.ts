// src/lib/money-hub-refunds.ts
//
// Refund netting for Money Hub. Leaf module (no imports) so it runs under
// node:test.
//
// Run tests: node --test --experimental-strip-types src/lib/money-hub-refunds.test.ts
//
// The problem it fixes: a credit from a merchant the user normally SPENDS
// with (Tesco, Deliveroo, Admiral, Uber...) is a refund. Money Hub had no
// refund path. Every such credit either arrived pre-tagged 'income' (the
// SQL auto_categorise income pass tags every CREDIT row) or fell through to
// the "unclaimed credit = income" default, so refunds inflated income while
// the spend they reversed stayed counted in full. On 2026-10-14 the last
// 180 days held GBP 1,500+ of these across Tesco, Raylo, Admiral, Deliveroo,
// Klarna, Google and Uber.

/** Minimal shapes, structurally compatible with money-hub-classification. */
export interface RefundTxnLike {
  merchant_name?: string | null;
  income_type?: string | null;
}

export interface RefundResolution {
  amount: number;
  kind: 'income' | 'spending' | 'transfer' | 'other';
  spendingCategory: string | null;
  incomeType: string | null;
}

/**
 * Spending categories where money coming back from the same merchant is a
 * refund, not earnings. Deliberately excludes debt, tax, wages, transfers,
 * property, professional services and 'other': a credit from a lender,
 * HMRC, a person or a catch-all merchant is far more likely to be real
 * money in.
 */
export const REFUNDABLE_CATEGORIES: ReadonlySet<string> = new Set([
  'groceries', 'eating_out', 'food', 'shopping', 'transport', 'travel', 'fuel',
  'parking', 'streaming', 'software', 'storage', 'music', 'gaming', 'news',
  'entertainment', 'insurance', 'mobile', 'broadband', 'energy', 'water',
  'utility', 'fitness', 'health', 'healthcare', 'personal_care', 'pets',
  'education', 'motoring',
]);

export type RefundMerchantIndex = Map<string, { category: string; maxDebit: number }>;

/** Merchant key used to pair a credit with debits. Empty when unusable. */
export function refundMerchantKey(txn: RefundTxnLike): string {
  const key = String(txn.merchant_name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return key.length >= 3 ? key : '';
}

/**
 * Index the user's debits by merchant: the category they were spent under
 * (most frequent) and the largest single debit. Rows must already be
 * resolved (user overrides applied, category keys normalised).
 */
export function buildRefundMerchantIndex(
  rows: Array<{ txn: RefundTxnLike; resolved: RefundResolution }>,
): RefundMerchantIndex {
  const tallies = new Map<string, { counts: Map<string, number>; maxDebit: number }>();
  for (const { txn, resolved } of rows) {
    if (resolved.kind !== 'spending' || !resolved.spendingCategory || resolved.amount >= 0) continue;
    const key = refundMerchantKey(txn);
    if (!key) continue;
    const entry = tallies.get(key) ?? { counts: new Map<string, number>(), maxDebit: 0 };
    const cat = resolved.spendingCategory.toLowerCase().trim();
    entry.counts.set(cat, (entry.counts.get(cat) ?? 0) + 1);
    entry.maxDebit = Math.max(entry.maxDebit, Math.abs(resolved.amount));
    tallies.set(key, entry);
  }
  const index: RefundMerchantIndex = new Map();
  for (const [key, { counts, maxDebit }] of tallies) {
    let best = '';
    let bestN = 0;
    for (const [cat, n] of counts) {
      if (n > bestN) { best = cat; bestN = n; }
    }
    if (best && REFUNDABLE_CATEGORIES.has(best)) index.set(key, { category: best, maxDebit });
  }
  return index;
}

/**
 * Turn a generic-income credit into a refund of the merchant's spending
 * category. The result keeps the POSITIVE amount, so a summariser that
 * computes spend as -amount nets it off the category total. Only fires when:
 *   - the row resolved to generic income (incomeType 'other') and carries
 *     no stored income_type, so the user never chose an income type for it,
 *   - the user has no category override for it,
 *   - the same merchant has debits in a refundable consumer category,
 *   - the credit is no bigger than the largest debit to that merchant.
 */
export function reclassifyAsRefund<T extends RefundResolution>(
  txn: RefundTxnLike,
  resolved: T,
  index: RefundMerchantIndex,
  hasUserOverride: boolean,
): T {
  if (hasUserOverride) return resolved;
  if (resolved.kind !== 'income' || resolved.amount <= 0) return resolved;
  if (resolved.incomeType !== 'other') return resolved;
  if (txn.income_type) return resolved;
  const key = refundMerchantKey(txn);
  const hit = key ? index.get(key) : undefined;
  if (!hit) return resolved;
  if (resolved.amount > hit.maxDebit + 0.005) return resolved;
  return { ...resolved, kind: 'spending', spendingCategory: hit.category, incomeType: null };
}
