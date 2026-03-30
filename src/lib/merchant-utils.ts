/**
 * Merchant name cleaning and classification utilities.
 *
 * Used by reports and the Quick Summary to show clean display names
 * instead of raw bank descriptions, and to filter loans/mortgages
 * from the "upcoming renewals" list.
 */

import { normaliseMerchantName, categoriseTransaction } from '@/lib/merchant-normalise';

/* ------------------------------------------------------------------ */
/*  Clean Merchant Name Resolution                                     */
/* ------------------------------------------------------------------ */

/**
 * Resolve a clean display name for a raw bank transaction description.
 *
 * Resolution order:
 *   1. subscriptionCompany — from subscriptions.company (user-facing)
 *   2. merchantRuleDisplayName — from merchant_rules.display_name
 *   3. normaliseMerchantName() — our shared normaliser
 */
export function cleanMerchantName(
  rawName: string,
  subscriptionCompany?: string | null,
  merchantRuleDisplayName?: string | null,
): string {
  if (subscriptionCompany && subscriptionCompany.trim()) {
    return subscriptionCompany.trim();
  }
  if (merchantRuleDisplayName && merchantRuleDisplayName.trim()) {
    return merchantRuleDisplayName.trim();
  }
  return normaliseMerchantName(rawName);
}

/* ------------------------------------------------------------------ */
/*  Loan / Mortgage Detection                                          */
/* ------------------------------------------------------------------ */

const LOAN_CATEGORIES = new Set([
  'loan', 'loans', 'mortgage', 'finance', 'credit', 'credit_card',
  'car_finance', 'bnpl', 'hire_purchase',
]);

const LOAN_KEYWORDS = [
  'loan', 'mortgage', 'finance', 'credit', 'bnpl', 'klarna',
  'clearpay', 'afterpay', 'laybuy', 'zilch', 'buy now pay later',
  'hire purchase', 'hp ', 'pcp ', 'novuna', 'ca auto', 'zopa',
  'funding circle', 'tesco bank', 'barclaycard', 'mbna',
  'lendinvest', 'skipton', 'nationwide b.s',
];

/**
 * Check if a subscription is a loan, mortgage, or fixed-term finance product
 * rather than a renewable subscription/contract.
 */
export function isLoanOrMortgage(
  category?: string | null,
  providerName?: string | null,
): boolean {
  if (category && LOAN_CATEGORIES.has(category.toLowerCase())) {
    return true;
  }
  if (providerName) {
    const lower = providerName.toLowerCase();
    return LOAN_KEYWORDS.some(kw => lower.includes(kw));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/*  Meaningful Category Mapping                                        */
/* ------------------------------------------------------------------ */

/**
 * Map raw bank category (TRANSFER, DIRECT_DEBIT, PURCHASE etc.) to a
 * meaningful spending category using description keyword matching.
 *
 * Falls back to the categoriseTransaction() from merchant-normalise.ts.
 */
export function mapToMeaningfulCategory(
  rawBankCategory: string,
  description: string,
): string {
  return categoriseTransaction(description, rawBankCategory);
}

/* ------------------------------------------------------------------ */
/*  Category Display Labels                                            */
/* ------------------------------------------------------------------ */

const REPORT_CATEGORY_LABELS: Record<string, string> = {
  mortgage: 'Housing & Mortgage',
  loans: 'Loans & Finance',
  credit: 'Credit Cards',
  council_tax: 'Council Tax',
  energy: 'Utilities (Energy)',
  water: 'Utilities (Water)',
  broadband: 'Broadband & TV',
  mobile: 'Mobile',
  streaming: 'Entertainment & Streaming',
  fitness: 'Fitness & Health',
  groceries: 'Food & Groceries',
  eating_out: 'Eating Out',
  fuel: 'Transport (Fuel)',
  transport: 'Transport',
  shopping: 'Shopping',
  insurance: 'Insurance',
  software: 'Software & Tech',
  tax: 'Tax (HMRC)',
  gambling: 'Gambling',
  childcare: 'Childcare',
  professional: 'Professional Services',
  fees: 'Bank Fees & Charges',
  bills: 'Bills',
  transfers: 'Transfers',
  cash: 'Cash',
  income: 'Income',
  other: 'Other / Uncategorised',
};

/**
 * Get a human-readable label for a spending category (for report display).
 */
export function getReportCategoryLabel(category: string): string {
  return REPORT_CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
}

/* ------------------------------------------------------------------ */
/*  Difficulty rating for switching actions                             */
/* ------------------------------------------------------------------ */

const EASY_SWITCH_CATEGORIES = new Set(['streaming', 'fitness', 'software', 'mobile', 'music', 'gaming', 'storage']);
const HARD_SWITCH_CATEGORIES = new Set(['mortgage', 'loans', 'credit', 'insurance']);

/**
 * Estimate the difficulty of switching for a given subscription category.
 */
export function getSwitchDifficulty(category?: string | null): 'easy' | 'medium' | 'hard' {
  if (!category) return 'medium';
  const cat = category.toLowerCase();
  if (EASY_SWITCH_CATEGORIES.has(cat)) return 'easy';
  if (HARD_SWITCH_CATEGORIES.has(cat)) return 'hard';
  return 'medium';
}
