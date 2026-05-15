/**
 * Business-account-aware income classifier.
 *
 * Money Hub's default income classifier (in money-hub-classification.ts +
 * money-hub/sync/route.ts) was trained on consumer-account data. On a
 * business account (HSBC Business, Tide, Starling Business, Mettle,
 * Revolut Business) it over-fits to "salary" because the bank tags every
 * incoming credit as CREDIT and the description is usually a customer
 * name. This module returns a richer income_type so reports differentiate
 * client revenue from director's draw from tax refunds.
 *
 * Decision tree (richer to fall back through):
 *   1. HMRC credit → tax_refund (or 'tax_refund_vat' if VAT keyword)
 *   2. Bank interest credit → interest
 *   3. Transfer from same user's connected accounts → owner_draw
 *      (consumer-account transfer wording is already caught upstream)
 *   4. Recurring large credit from the same merchant → client_payment
 *   5. Invoice / Stripe / GoCardless / SumUp / Square / Worldpay /
 *      Takepayments → client_payment
 *   6. Small regular credits (sole-trader paying themselves) → salary
 *   7. Fallback: 'business_income' (rather than 'salary')
 *
 * All categories returned here are additive — the wider Money Hub income
 * aggregator (`buildNormalizedIncomeBreakdown`) collapses unknown keys
 * to 'other', so adding new types here is non-breaking.
 */

export interface BusinessIncomeInput {
  amount: number;
  description: string;
  merchantName?: string | null;
  bankCategory?: string | null;
  /** True when the connection the txn arrived on is a business account. */
  accountIsBusiness: boolean;
  /**
   * Optional list of recent transactions (last 6mo) on the SAME
   * merchant_name. Used to decide "regular client" vs "one-off".
   * Each entry: { amount, timestamp_ms }.
   */
  recentSameMerchant?: Array<{ amount: number; timestampMs: number }>;
}

export type BusinessIncomeType =
  | 'tax_refund'
  | 'tax_refund_vat'
  | 'interest'
  | 'owner_draw'
  | 'personal_transfer'
  | 'client_payment'
  | 'invoice_payment'
  | 'salary'
  | 'business_income'
  | null;

const PAYMENT_PROCESSOR_RE = /\b(stripe|gocardless|sumup|square|worldpay|takepayments|paypal|elavon|barclaycard payment|worldnet)\b/i;
const INVOICE_RE = /\b(invoice|inv |inv#|inv-|invoicing|inv no|inv\.no|inv:|invc)\b/i;
const HMRC_VAT_RE = /\b(hmrc.*vat|vat.*refund|vat.*hmrc)\b/i;
const HMRC_TAX_RE = /\b(hmrc|hm revenue|hm-revenue|tax refund|tax repayment|hmrc.*refund)\b/i;
const INTEREST_RE = /\b(interest earned|interest paid|gross interest|net interest|credit interest|interest on (?:current|savings|business))\b/i;
const OWN_TRANSFER_RE = /\b(from (current|savings|business|personal) account|own account|between accounts|account transfer|personal transfer|director loan|director draw|drawings)\b/i;
const CONSUMER_TRANSFER_PREFIX_RE = /^(tfr |trf |fps )/i;

/**
 * Classify a positive-amount credit on a business account into a
 * richer income type. Returns null when no business-specific rule
 * applies — callers should then fall back to the existing
 * consumer-account classifier.
 */
export function classifyBusinessIncome(input: BusinessIncomeInput): BusinessIncomeType {
  if (!input.accountIsBusiness) return null;
  if (input.amount <= 0) return null;

  const desc = `${input.merchantName ?? ''} ${input.description ?? ''}`.toLowerCase();
  const bankCat = (input.bankCategory ?? '').toUpperCase();

  // 1. HMRC credits → tax_refund (VAT or generic)
  if (HMRC_VAT_RE.test(desc)) return 'tax_refund_vat';
  if (HMRC_TAX_RE.test(desc)) return 'tax_refund';

  // 2. Bank interest
  if (INTEREST_RE.test(desc) || bankCat === 'INTEREST') return 'interest';

  // 3. Transfer-from-own-account → owner_draw on a business account
  //    (on a personal account it would be a generic transfer, but here
  //    a business account receiving an own-account credit is most often
  //    the director topping up the company or vice versa)
  if (OWN_TRANSFER_RE.test(desc) || CONSUMER_TRANSFER_PREFIX_RE.test(desc.trim())) {
    return 'owner_draw';
  }

  // 4. Payment processor → client_payment
  if (PAYMENT_PROCESSOR_RE.test(desc)) return 'client_payment';

  // 5. Invoice keyword → invoice_payment (distinct from client_payment so
  //    the user can tell processor-led from manually-invoiced revenue)
  if (INVOICE_RE.test(desc)) return 'invoice_payment';

  // 6. Recurring same-merchant credits — regular cadence = client
  if (input.recentSameMerchant && input.recentSameMerchant.length >= 2) {
    const allSimilarAmount = input.recentSameMerchant.every(
      (r) => Math.abs(r.amount - input.amount) / Math.max(input.amount, 1) < 0.25,
    );
    if (allSimilarAmount && input.recentSameMerchant.length >= 2) {
      return 'client_payment';
    }
  }

  // 7. Small regular credits with director / sole-trader keywords → salary
  //    (sole traders paying themselves from the business)
  if (/\b(director|salary|payroll|net pay|wages|drawings)\b/i.test(desc)) {
    return 'salary';
  }

  // 8. Fallback: business_income rather than 'salary' so reports don't
  //    over-attribute everything to "salary".
  return 'business_income';
}

/**
 * Convenience helper: refine a previously-detected income_type using
 * business-account context. Used by the bank sync route after the
 * consumer-side detector has run.
 *
 * - If the consumer detector returned a confident non-default label
 *   (e.g. 'rental', 'dividend', 'transfer'), pass it through unchanged.
 * - If it returned 'salary' or null on a business account, run the
 *   business classifier to see if there's a better label.
 * - On non-business accounts, always return the consumer label.
 */
export function refineIncomeTypeWithBusinessContext(
  consumerIncomeType: string | null,
  input: BusinessIncomeInput,
): string | null {
  if (!input.accountIsBusiness) return consumerIncomeType;

  // 'transfer' and 'credit_loan' are structural labels — leave them.
  if (consumerIncomeType === 'transfer' || consumerIncomeType === 'credit_loan') {
    return consumerIncomeType;
  }

  // Genuinely informative consumer labels — don't override.
  const STRONG_CONSUMER_LABELS = new Set([
    'rental', 'rental_airbnb', 'rental_direct', 'investment', 'dividend',
    'benefits', 'gift', 'loan_repayment', 'refund', 'cashback',
  ]);
  if (consumerIncomeType && STRONG_CONSUMER_LABELS.has(consumerIncomeType)) {
    return consumerIncomeType;
  }

  // Now we're in 'salary' / null / 'freelance' territory — let business
  // classifier have a go.
  const businessLabel = classifyBusinessIncome(input);
  if (businessLabel) return businessLabel;

  return consumerIncomeType;
}

/**
 * Bank-name heuristic: is this connection a business account? Used as
 * a fallback when `bank_connections.is_business` is not yet populated
 * (the column was added in migration 20260515160000).
 */
export function looksLikeBusinessBankName(bankName: string | null | undefined): boolean {
  if (!bankName) return false;
  const n = bankName.toLowerCase();
  // Bank names that we know to be business products. Other bank names
  // can still be flagged via is_business=true on the connection.
  if (/business/.test(n)) return true;
  if (/tide|mettle|anna money|countingup|coconut/.test(n)) return true;
  if (/starling business|monzo business|revolut business/.test(n)) return true;
  return false;
}
