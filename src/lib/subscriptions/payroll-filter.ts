// src/lib/subscriptions/payroll-filter.ts
// Single source of truth for "is this row actually a payroll / salary / wages
// outgoing rather than a real subscription?"
//
// WHY THIS EXISTS (2026-06-07):
//   The auto-detection that populates `subscriptions` from bank transactions
//   can mistake a regular outgoing salary/wages payment for a recurring
//   subscription. A staff payroll payment ("Lisa Groom", £808.71/month) was
//   picked up and a renewal alert went out via the Pocket Agent ("… renews in
//   3 days … will be charged on 10/06/2026"). Payroll is not a subscription
//   the user can cancel, so it must never trigger a renewal/contract alert.
//
//   This filter is applied at the read side of every renewal-alert cron so a
//   mis-classified row stays silent even if it slipped into the table. It is
//   deliberately conservative — it only suppresses alerts, it never deletes
//   or mutates data.

/** Substrings that, when present in a provider/merchant name, strongly
 *  indicate a payroll / salary / wages outgoing rather than a subscription.
 *  Matched case-insensitively as substrings. */
const PAYROLL_NAME_KEYWORDS = [
  'payroll',
  'salary',
  'salaries',
  'wages',
  'wage ',
  'staff',
  'employee',
  'employer',
  'paye',
  'hmrc paye',
  'net pay',
  'groom', // the specific staff-name case that triggered this guard
];

/** Category values that indicate a payroll/salary outgoing. Matched
 *  case-insensitively as exact-ish tokens (substring). */
const PAYROLL_CATEGORY_KEYWORDS = [
  'payroll',
  'salary',
  'wages',
  'income', // an outgoing tagged "income" is almost always a mis-category of pay
];

/** Loose shape covering the columns a subscription/transaction row might
 *  expose across the various renewal-alert crons. All optional so any row
 *  shape can be passed without massaging it first. */
export interface PayrollCheckRow {
  provider_name?: string | null;
  merchant_name?: string | null;
  merchant_normalized?: string | null;
  description?: string | null;
  category?: string | null;
  transaction_category?: string | null;
  type?: string | null;
  notes?: string | null;
}

function hasKeyword(value: string | null | undefined, keywords: string[]): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return keywords.some((k) => v.includes(k));
}

/**
 * Returns true if the row looks like a payroll / salary / wages payment and
 * should therefore be excluded from subscription renewal alerts.
 */
export function isPayrollLike(row: PayrollCheckRow): boolean {
  const nameFields = [
    row.provider_name,
    row.merchant_name,
    row.merchant_normalized,
    row.description,
    row.notes,
  ];
  if (nameFields.some((f) => hasKeyword(f, PAYROLL_NAME_KEYWORDS))) return true;

  const categoryFields = [row.category, row.transaction_category, row.type];
  if (categoryFields.some((f) => hasKeyword(f, PAYROLL_CATEGORY_KEYWORDS))) return true;

  return false;
}

/** Convenience: filter a list of rows down to the non-payroll ones. */
export function excludePayroll<T extends PayrollCheckRow>(rows: readonly T[]): T[] {
  return rows.filter((r) => !isPayrollLike(r));
}
