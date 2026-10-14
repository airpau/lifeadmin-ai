// src/lib/money-hub-category-keys.ts
//
// Leaf module (no imports) so it can be shared by the server classifier
// (money-hub-classification.ts), the client-side category renderer
// (category-config.ts) and node:test, without dragging the Supabase client
// into client bundles. Before this file existed the alias map was copied
// into both places by hand and the copies had to be kept "in lockstep".

/**
 * Aliases normalise synonyms to the canonical keys defined in
 * src/lib/category-config.ts. Every VALUE in this map MUST be a key in
 * CATEGORY_CONFIG, otherwise one drift bug is aliased into another.
 */
export const SPENDING_CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  // Plural to singular for keys that exist as both forms in upstream data.
  fees: 'fee',
  loans: 'loan',
  utilities: 'utility',
  // Bank-provided "BILL_PAYMENT" raw category collapses into 'bills'.
  bill_payment: 'bills',
  billpayment: 'bills',
  'bill-payment': 'bills',
  // Narrower food split: honour the canonical values the detector returns.
  dining: 'eating_out',
  restaurants: 'eating_out',
  supermarkets: 'groceries',
  supermarket: 'groceries',
  // Transfer synonyms. Real writers persist all of these: older sync code
  // wrote 'transfer', the pair matcher's bucket is 'internal_transfer' and
  // the Money Hub picker offers 'inter_account_transfer'. Only the exact
  // key 'transfers' was excluded from spending, so rows under the other
  // spellings were counted as money spent (26 debits / GBP 4,729 of
  // 'transfer' alone in the 180 days to 2026-10-14). spending.ts and the
  // Telegram summaries already treat all of these as transfers.
  transfer: 'transfers',
  internal_transfer: 'transfers',
  self_transfer: 'transfers',
  inter_account_transfer: 'transfers',
};

export function normalizeSpendingCategoryKey(value: unknown): string {
  const key = String(value ?? '').toLowerCase().trim();
  if (!key) return '';
  return SPENDING_CATEGORY_ALIASES[key] || key;
}
