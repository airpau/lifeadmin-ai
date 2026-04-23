const OTHER_INCOME_KEYS = new Set(['other', 'other_income', 'unknown', 'uncategorised', '']);
const RENTAL_INCOME_KEYS = new Set(['rental', 'rental_airbnb', 'rental_direct', 'rental_booking']);
// Only internal transfers are excluded from the income breakdown — loan
// receipts (credit_loan) used to be excluded too, but that made the totals
// misleading: a £12k loan drawdown would vanish from the Income tile and
// leave the savings rate looking negative when the account balance had
// actually gone up. Loan receipts now surface as a "Credit / Loan" row in
// the breakdown and count toward monthly income. See the label in
// OverviewPanel.tsx and the matching row in the pie/stats.
const EXCLUDED_INCOME_KEYS = new Set(['transfer']);

export function normalizeIncomeTypeKey(value: string | null | undefined): string {
  const key = (value || '').toLowerCase().trim();
  if (RENTAL_INCOME_KEYS.has(key)) return 'rental';
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
