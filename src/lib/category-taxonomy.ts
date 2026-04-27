/**
 * Canonical category taxonomy — single source of truth for "what bucket
 * does a transaction belong to?". Every category produced anywhere in
 * Paybacker (bank-sync detectors, merchant_rules, learning engine, user
 * overrides, scanner output) must resolve to one of five buckets.
 *
 * The mirror SQL function `category_bucket()` MUST stay byte-identical to
 * the map below — `tests/category-taxonomy-parity.test.ts` enforces this.
 *
 *   internal_transfer  - own-account-to-own-account movements only.
 *                        Per-transaction, set by the pair-matching detector;
 *                        a category never lands here on its own.
 *   income             - inbound money (salary, rental, refund, etc.).
 *                        Excluded from spending totals (it's the other
 *                        side of the ledger).
 *   fixed_cost         - debt servicing + contractual obligations the user
 *                        can't easily change month-to-month. Mortgage,
 *                        loan, credit_card, council_tax, insurance,
 *                        utility, energy, water, broadband, mobile, fee,
 *                        parking, rent, debt_repayment.
 *   variable_cost      - recurring but naturally variable: groceries,
 *                        fuel, eating_out, food, transport, shopping,
 *                        gambling, cash.
 *   discretionary      - lifestyle / one-off / catch-all spending:
 *                        streaming, software, fitness, healthcare,
 *                        charity, education, pets, travel, music, gaming,
 *                        security, storage, motoring, property_management,
 *                        credit_monitoring, bills, professional, hobbies,
 *                        other.
 *
 * Spending totals = fixed_cost + variable_cost + discretionary.
 * Internal transfers and income are NEVER in the spending total.
 *
 * Aliases (plurals, hyphen vs underscore) collapse to canonical keys
 * before lookup. `bucketFor()` handles that automatically.
 */

export type CategoryBucket =
  | 'internal_transfer'
  | 'income'
  | 'fixed_cost'
  | 'variable_cost'
  | 'discretionary';

/** Plural / synonym → canonical key. Mirrors the CASE in `category_bucket()`. */
const CATEGORY_ALIASES: Record<string, string> = {
  // Plurals → singular canonicals
  mortgages: 'mortgage',
  loans: 'loan',
  'credit cards': 'credit_card',
  'credit-cards': 'credit_card',
  credit: 'credit_card',
  'car finance': 'car_finance',
  'car-finance': 'car_finance',
  fees: 'fee',
  utilities: 'utility',
  // Bank-rail synonyms
  bank_transfer: 'transfers',
  transfer: 'transfers',
  TRANSFER: 'transfers',
  // Bill-shape synonyms
  bill_payment: 'bills',
  billpayment: 'bills',
  'bill-payment': 'bills',
  // Food split synonyms
  dining: 'eating_out',
  restaurants: 'eating_out',
  supermarkets: 'groceries',
  supermarket: 'groceries',
};

/** Canonical category → bucket. Every CATEGORY_CONFIG key must be here. */
export const CATEGORY_BUCKET: Record<string, CategoryBucket> = {
  // ----- income -----
  income: 'income',
  salary: 'income',
  freelance: 'income',
  rental: 'income',
  benefits: 'income',
  pension: 'income',
  dividends: 'income',
  investment: 'income',
  refund: 'income',
  gift: 'income',
  loan_repayment: 'income', // inbound — money coming back to user

  // ----- internal transfer (category-level marker; pair-matching is the
  // primary mechanism — this catches rows already user-categorised as such)
  transfers: 'internal_transfer',
  internal_transfer: 'internal_transfer',

  // ----- fixed_cost: debt servicing + contractual obligations -----
  mortgage: 'fixed_cost',
  loan: 'fixed_cost',
  credit_card: 'fixed_cost',
  car_finance: 'fixed_cost',
  debt_repayment: 'fixed_cost',
  council_tax: 'fixed_cost',
  tax: 'fixed_cost',
  insurance: 'fixed_cost',
  utility: 'fixed_cost',
  energy: 'fixed_cost',
  water: 'fixed_cost',
  broadband: 'fixed_cost',
  mobile: 'fixed_cost',
  fee: 'fixed_cost',
  parking: 'fixed_cost',
  rent: 'fixed_cost',

  // ----- variable_cost: recurring but naturally variable -----
  groceries: 'variable_cost',
  fuel: 'variable_cost',
  eating_out: 'variable_cost',
  food: 'variable_cost',
  transport: 'variable_cost',
  shopping: 'variable_cost',
  gambling: 'variable_cost',
  cash: 'variable_cost',

  // ----- discretionary: lifestyle, one-offs, catch-all -----
  streaming: 'discretionary',
  software: 'discretionary',
  fitness: 'discretionary',
  healthcare: 'discretionary',
  charity: 'discretionary',
  education: 'discretionary',
  pets: 'discretionary',
  travel: 'discretionary',
  music: 'discretionary',
  gaming: 'discretionary',
  security: 'discretionary',
  storage: 'discretionary',
  motoring: 'discretionary',
  property_management: 'discretionary',
  credit_monitoring: 'discretionary',
  bills: 'discretionary',
  professional: 'discretionary',
  hobbies: 'discretionary',
  other: 'discretionary',
};

/**
 * Resolve a category-shaped string to its bucket. Handles the alias map,
 * lower-cases the input, trims whitespace. Returns 'discretionary' as the
 * safe default for unknown categories — same behaviour as the SQL fn.
 *
 * NOTE: callers that want internal_transfer detection must look at the
 * transaction's `user_category` set by the pair-matching detector; this
 * function only returns 'internal_transfer' for rows where the category
 * itself is 'transfers'/'internal_transfer'.
 */
export function bucketFor(rawCategory: string | null | undefined): CategoryBucket {
  if (!rawCategory) return 'discretionary';
  const lower = String(rawCategory).toLowerCase().trim();
  if (!lower) return 'discretionary';
  const canonical = CATEGORY_ALIASES[lower] ?? lower;
  return CATEGORY_BUCKET[canonical] ?? 'discretionary';
}

/**
 * True iff the bucket counts toward "money I spent". Internal transfers
 * and income are excluded.
 */
export function isSpendingBucket(bucket: CategoryBucket): boolean {
  return bucket === 'fixed_cost'
    || bucket === 'variable_cost'
    || bucket === 'discretionary';
}

/**
 * True iff the category should NEVER appear in deal/switch comparisons.
 * Replaces EXCLUDED_COMPARISON_CATEGORIES + EXCLUDED_PROVIDER_TYPES +
 * the not-switchable subset of EXCLUDED_SAVINGS_CATEGORIES.
 *
 * Rule: a category is non-switchable if it represents a debt instrument
 * (you can't "switch" your existing mortgage balance — refinancing is a
 * different product) or a tax/government fee.
 */
const NON_SWITCHABLE: ReadonlySet<string> = new Set([
  'mortgage', 'loan', 'credit_card', 'car_finance', 'debt_repayment',
  'council_tax', 'tax', 'fee', 'parking',
]);

export function isSwitchable(rawCategory: string | null | undefined): boolean {
  if (!rawCategory) return false;
  const lower = String(rawCategory).toLowerCase().trim();
  const canonical = CATEGORY_ALIASES[lower] ?? lower;
  if (NON_SWITCHABLE.has(canonical)) return false;
  // Internal transfers / income are never switchable
  const bucket = CATEGORY_BUCKET[canonical];
  if (bucket === 'internal_transfer' || bucket === 'income') return false;
  return true;
}

/**
 * True iff a price-increase signal on this category is meaningful.
 * Excludes (a) variable-by-design buckets where amounts move every month
 * and (b) instruments where the headline "amount" is balance-driven, not
 * price-driven (mortgages, credit cards).
 */
const NO_PRICE_SIGNAL: ReadonlySet<string> = new Set([
  'mortgage', 'loan', 'credit_card', 'car_finance', 'debt_repayment',
  'council_tax', 'fee', 'parking',
]);

export function hasMeaningfulPriceSignal(rawCategory: string | null | undefined): boolean {
  if (!rawCategory) return false;
  const lower = String(rawCategory).toLowerCase().trim();
  const canonical = CATEGORY_ALIASES[lower] ?? lower;
  const bucket = CATEGORY_BUCKET[canonical];
  if (bucket === 'internal_transfer' || bucket === 'income' || bucket === 'variable_cost') {
    return false;
  }
  return !NO_PRICE_SIGNAL.has(canonical);
}

/** All canonical category keys, sorted. Useful for migrations + tests. */
export const ALL_CANONICAL_CATEGORIES: readonly string[] = Object.freeze(
  Object.keys(CATEGORY_BUCKET).sort(),
);

// ─── Dispute classification ──────────────────────────────────────────────
//
// For the Action Centre redesign: not every price rise is "winnable" via a
// dispute. Council tax rises annually by law; HMRC payments follow your
// notice; mortgage rates change within terms; loans amortise. Telling the
// user to "Start dispute" on these sets them up for failure.
//
// A category is `disputable` when there's a UK consumer-rights or regulator
// hook the user can credibly invoke (Consumer Rights Act, Ofcom General
// Conditions, Ofgem standard licence conditions, FCA conduct rules, etc.):
//
//   - Mid-contract or out-of-contract telecoms / broadband price rise
//     → Ofcom CGA 2.4 (right to exit penalty-free with material change)
//   - Energy supplier rate change without proper notice
//     → Ofgem SLC 23 (advance notice + right to switch)
//   - Insurance auto-renewal at higher rate without competitive quote
//     → FCA Pricing Practices (general insurance auto-renewal rules)
//   - Subscription auto-renewal price hike with insufficient notice
//     → Consumer Contracts Regulations 2013
//   - Gym/membership mid-contract rises
//     → CMA undertaking on gym contracts
//
// `track_only` covers: statutory bills (council tax, HMRC), debt
// instruments (mortgage, loan, credit_card, car_finance) where rate
// changes follow contractual terms, fees/parking, and rent (which has
// its own narrow dispute regime via housing law, not handled here).
//
// `unknown` is the fallback when we can't classify confidently —
// shown to the user as "Worth a look" with no winnability promise.

export type DisputeClassification = 'disputable' | 'track_only' | 'unknown';

const DISPUTABLE_CATEGORIES: ReadonlySet<string> = new Set([
  'energy', 'water', 'broadband', 'mobile', 'utility',
  'insurance',
  'streaming', 'software', 'fitness',
  'gaming', 'music', 'storage',
  'pets',         // pet insurance auto-renewal hikes are disputable
  'security',     // alarm subscriptions, identity-protect, etc.
  'credit_monitoring',
]);

const TRACK_ONLY_CATEGORIES: ReadonlySet<string> = new Set([
  'mortgage', 'loan', 'credit_card', 'car_finance', 'debt_repayment',
  'council_tax', 'tax', 'fee', 'parking',
  'rent',  // narrow dispute regime via housing law — not auto-actionable
]);

export function classifyDispute(
  rawCategory: string | null | undefined,
): DisputeClassification {
  if (!rawCategory) return 'unknown';
  const lower = String(rawCategory).toLowerCase().trim();
  const canonical = CATEGORY_ALIASES[lower] ?? lower;

  // Internal transfers and income are never disputable — and shouldn't
  // be flagged as price rises in the first place.
  const bucket = CATEGORY_BUCKET[canonical];
  if (bucket === 'internal_transfer' || bucket === 'income') return 'track_only';
  if (bucket === 'variable_cost') return 'unknown';

  if (DISPUTABLE_CATEGORIES.has(canonical)) return 'disputable';
  if (TRACK_ONLY_CATEGORIES.has(canonical)) return 'track_only';
  return 'unknown';
}

/**
 * One-line "why this is winnable" microcopy for the Action Centre. Keyed
 * on canonical category. Used for the disputable cards. Returned `null`
 * for non-disputable categories (no copy needed there).
 *
 * The copy is intentionally short and references the specific UK
 * regulatory hook so the user trusts the advice. Letter content gets
 * the full citation; the Action Centre teaser only needs the headline.
 */
export function disputeWinnabilityHook(
  rawCategory: string | null | undefined,
): string | null {
  if (classifyDispute(rawCategory) !== 'disputable') return null;
  const lower = String(rawCategory ?? '').toLowerCase().trim();
  const canonical = CATEGORY_ALIASES[lower] ?? lower;
  switch (canonical) {
    case 'broadband':
    case 'mobile':
      return 'Ofcom CGA 2.4 — mid-contract price rise lets you exit penalty-free.';
    case 'energy':
    case 'water':
    case 'utility':
      return 'Ofgem SLC 23 — supplier owes you advance notice + a switch window.';
    case 'insurance':
      return 'FCA Pricing Practices — auto-renewal can\'t be priced higher than a new-customer quote.';
    case 'streaming':
    case 'software':
    case 'gaming':
    case 'music':
    case 'storage':
    case 'security':
    case 'credit_monitoring':
      return 'Consumer Contracts Regs 2013 — subscription price hikes need clear advance notice.';
    case 'fitness':
      return 'CMA undertaking on gym contracts — mid-contract rises are challengeable.';
    case 'pets':
      return 'FCA Pricing Practices — pet insurance renewals follow the same fairness rules.';
    default:
      return 'Consumer Rights Act 2015 — material price changes can be challenged.';
  }
}
