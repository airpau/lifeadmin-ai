/**
 * Detects whether a subscription/provider is a credit product and returns
 * an appropriate warning about the impact of cancellation on credit scores.
 */

interface CreditProductResult {
  isCreditProduct: boolean;
  productType: string;
  warningContent: string;
}

const CREDIT_CARD_KEYWORDS = [
  'barclaycard',
  'amex',
  'american express',
  'capital one',
  'hsbc credit',
  'virgin money credit',
  'vanquis',
  'aqua',
  'ocean',
  'marbles',
  'mbna',
  'store card',
];

const BNPL_KEYWORDS = [
  'klarna',
  'clearpay',
  'afterpay',
  'laybuy',
  'zilch',
];

const LOAN_KEYWORDS = [
  'natwest loan',
  'santander loan',
  'novuna',
  'zopa',
  'funding circle',
];

const CREDIT_CARD_WARNING =
  'Closing a credit card can affect your credit score by reducing your available credit and shortening your credit history. If the card has no annual fee, consider keeping it open with no balance.';

const LOAN_WARNING =
  'Repaying a loan early may incur early repayment charges. Check your loan agreement for the early settlement figure, which may be different from the outstanding balance.';

const BNPL_WARNING =
  'Cancelling a BNPL agreement could affect your credit file if you have outstanding balances. Ensure all payments are settled first.';

export function isCreditProduct(
  providerName: string,
  category?: string
): CreditProductResult {
  const lower = providerName.toLowerCase();
  const catLower = (category || '').toLowerCase();

  // Check credit cards
  if (CREDIT_CARD_KEYWORDS.some((kw) => lower.includes(kw)) || catLower === 'credit_card') {
    return {
      isCreditProduct: true,
      productType: 'Credit Card',
      warningContent: CREDIT_CARD_WARNING,
    };
  }

  // Check BNPL
  if (BNPL_KEYWORDS.some((kw) => lower.includes(kw))) {
    return {
      isCreditProduct: true,
      productType: 'Buy Now Pay Later',
      warningContent: BNPL_WARNING,
    };
  }

  // Check loans
  if (LOAN_KEYWORDS.some((kw) => lower.includes(kw)) || catLower === 'loan') {
    return {
      isCreditProduct: true,
      productType: 'Loan',
      warningContent: LOAN_WARNING,
    };
  }

  return {
    isCreditProduct: false,
    productType: '',
    warningContent: '',
  };
}
