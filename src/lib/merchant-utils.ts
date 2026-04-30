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

// Synchronous fallback map for immediate UI resolution matching the merchant_rules DB pattern
const HARDCODED_MERCHANT_RULES: Record<string, string> = {
  'PAYPAL *DISNEYPLUS': 'Disney+',
  'PAYPAL *WWW.PLEX.TV': 'Plex',
  'PAYPAL *LEBARA': 'Lebara',
  'EXPERIAN': 'Experian',
  'ENERGIE FI': 'énergie Fitness',
  'B/CARD PLAT': 'Barclaycard Platinum Visa',
  'LBH': 'London Borough of Hounslow',
  'TESTVALLEY': 'Test Valley Borough Council',
  'DVLA-A15EYP': 'DVLA Vehicle Tax',
  'COMMUNITYFIBRE': 'Community Fibre',
};

/**
 * TrueLayer (and occasionally Yapily) sometimes return junk in the
 * `merchant_name` field — 2-letter fragments like "ad", "tr", "d" that look
 * like first-few-chars of the raw description. These produce nonsense
 * "Ad", "Tr" rows in the top-merchants list. This helper detects those
 * garbage values and falls through to the description so we can derive a
 * sane name via normaliseMerchantName().
 *
 * A short-known-brand whitelist (BT, EE, O2, AXA, TfL, M&S) keeps legitimate
 * short merchant names working.
 */
const VALID_SHORT_MERCHANTS = new Set([
  'bt', 'ee', 'o2', 'axa', 'tfl', 'lbh', 'hmv', 'dhl', 'ups', 'ikea', 'asda',
  'aldi', 'lidl', 'b&q', 'bp', 'esso', 'bmw', 'aa', 'rac', 'nhs', 'hmrc',
  'dvla', 'bbc', 'itv', 'odeon', 'vue', 'cex', 'm&s', 'h&m', 'ba', 'npd',
]);

export function isGarbageMerchantName(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (VALID_SHORT_MERCHANTS.has(trimmed.toLowerCase())) return false;
  // Short + all-lowercase + no spaces = very likely a prefix fragment
  if (trimmed.length <= 3 && trimmed === trimmed.toLowerCase() && !/\s/.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Pick the best raw name to feed to cleanMerchantName / normaliseMerchantName.
 * Returns the description when the merchant_name field is clearly garbage.
 */
export function pickRawMerchantSource(
  merchantName: string | null | undefined,
  description: string | null | undefined,
): string {
  if (isGarbageMerchantName(merchantName)) return description || merchantName || '';
  return merchantName || description || '';
}

/**
 * Resolve a clean display name for a raw bank transaction description.
 *
 * Rules:
 *   1. Check static overrides for known dirty payloads (matches DB seeds)
 *   2. Use existing parsed subscriptionCompany or merchantRuleDisplayName if provided
 *   3. Strip PayPal prefixes
 *   4. Strip phone numbers
 *   5. Strip location suffixes
 *   6. Expand abbreviations and normalise case via normaliseMerchantName
 */
export function cleanMerchantName(
  rawName: string,
  subscriptionCompany?: string | null,
  merchantRuleDisplayName?: string | null,
): string {
  if (!rawName) return '';
  const upperRaw = rawName.trim().toUpperCase();

  // 1. Static synchronous overrides matching our DB inserts
  for (const [pattern, display] of Object.entries(HARDCODED_MERCHANT_RULES)) {
    if (upperRaw.startsWith(pattern) || (pattern === 'EXPERIAN' && upperRaw.includes('EXPERIAN'))) {
      return display;
    }
  }

  // 2. Existing mapped db overrides if passed
  if (subscriptionCompany && subscriptionCompany.trim()) {
    return subscriptionCompany.trim();
  }
  if (merchantRuleDisplayName && merchantRuleDisplayName.trim()) {
    return merchantRuleDisplayName.trim();
  }

  // 3. Deeper string cleaning logic (PayPal, phone numbers, locations) before using normaliseMerchantName
  let cleaned = rawName;
  
  // Strip PayPal
  cleaned = cleaned.replace(/^paypal\s*\*?\s*/i, '');
  
  // Strip phone numbers (10+ digits with optional spaces/hyphens)
  cleaned = cleaned.replace(/[\s-]*\+?\(?0\d{3}\)?[\s-]?\d{3}[\s-]?\d{3,4}[\s-]*$/, '');
  
  // Strip specific location suffixes seen in transactions
  cleaned = cleaned.replace(/\s+Gb$/, '');
  cleaned = cleaned.replace(/\s+[A-Z][a-z]+ Gb$/, '');
  
  return normaliseMerchantName(cleaned);
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
  business_rates: 'Business Rates',
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
