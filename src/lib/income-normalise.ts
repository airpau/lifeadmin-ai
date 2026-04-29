const OTHER_INCOME_KEYS = new Set(['other', 'other_income', 'unknown', 'uncategorised', '']);
const RENTAL_INCOME_KEYS = new Set(['rental', 'rental_airbnb', 'rental_direct', 'rental_booking']);
const EXCLUDED_INCOME_KEYS = new Set(['transfer', 'credit_loan']);

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
