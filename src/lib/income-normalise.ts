const OTHER_INCOME_KEYS = new Set(['other', 'other_income', 'unknown', 'uncategorised', '']);
const RENTAL_INCOME_KEYS = new Set(['rental', 'rental_airbnb', 'rental_direct', 'rental_booking']);
// Both loan-shaped income types — 'credit_loan' (money FROM a lender, i.e.
// a drawdown) and 'loan_repayment' (money FROM a debtor paying you back) —
// collapse into a single display bucket so the user sees one "Loan Credit"
// row instead of two rows with near-identical labels. The raw type stays
// distinct in bank_transactions for future analytics; only the display
// aggregation is unified.
const LOAN_INCOME_KEYS = new Set(['credit_loan', 'loan_repayment', 'loan_credit', 'loan_drawdown']);
// Only internal transfers are excluded from the income breakdown — loan
// receipts (credit_loan) used to be excluded too, but that made the totals
// misleading: a £12k loan drawdown would vanish from the Income tile and
// leave the savings rate looking negative when the account balance had
// actually gone up. Loan receipts now surface as a "Loan Credit" row in
// the breakdown and count toward monthly income. See the label in
// OverviewPanel.tsx and the matching row in the pie/stats.
const EXCLUDED_INCOME_KEYS = new Set(['transfer']);

export function normalizeIncomeTypeKey(value: string | null | undefined): string {
  const key = (value || '').toLowerCase().trim();
  if (RENTAL_INCOME_KEYS.has(key)) return 'rental';
  if (LOAN_INCOME_KEYS.has(key)) return 'credit_loan';
  if (OTHER_INCOME_KEYS.has(key)) return 'other';
  return key || 'other';
}

export function isExcludedIncomeType(value: string | null | undefined): boolean {
  return EXCLUDED_INCOME_KEYS.has((value || '').toLowerCase().trim());
}

export function buildNormalizedIncomeBreakdown(
  rows: Array<{ key: string | null | undefined; amount: number }>
): Record<string, number> {
  const breakdown: Record<string, number> = {};

  for (const row of rows) {
    const normalizedKey = normalizeIncomeTypeKey(row.key);
    breakdown[normalizedKey] = (breakdown[normalizedKey] || 0) + row.amount;
  }

  return Object.fromEntries(
    Object.entries(breakdown).filter(([, amount]) => Number.isFinite(amount) && amount > 0)
  );
}

export function matchesIncomeTypeFilter(
  value: string | null | undefined,
  target: string | null | undefined
): boolean {
  return normalizeIncomeTypeKey(value) === normalizeIncomeTypeKey(target);
}
