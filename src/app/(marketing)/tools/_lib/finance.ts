/**
 * Pure money maths for the personal-finance calculators at /tools.
 *
 * Nothing in here reads a tax figure. Tax constants live in
 * ../_data/uk-tax.ts and are passed in. Nothing in here touches React,
 * so every function can be read, checked and reasoned about on its own.
 *
 * CONVENTIONS, because the choice matters and different calculators
 * make different ones:
 *
 *  - MORTGAGE interest uses a nominal monthly rate of annualRate / 12.
 *    That is how UK lenders quote and how a standard repayment schedule
 *    is built. It is not the same as compounding an AER.
 *
 *  - SAVINGS interest uses the AER converted to an equivalent monthly
 *    rate, (1 + AER) ^ (1/12) - 1, because AER is by definition an
 *    annual effective rate. Using AER / 12 would slightly overstate the
 *    return, and overstating the savings side is exactly the error that
 *    would push someone into the wrong decision on the overpay-versus-
 *    save question.
 *
 *  - Contributions are treated as paid at the END of each month.
 */

export function formatGbp(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPct(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

/** Parse a user-typed money or rate string. Returns null if unusable. */
export function parseNumber(input: string): number | null {
  const cleaned = input.replace(/[£,\s%]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse and require a value strictly greater than zero. */
export function parsePositive(input: string): number | null {
  const n = parseNumber(input);
  return n !== null && n > 0 ? n : null;
}

/** Months, expressed as "3 years 4 months". */
export function formatMonths(totalMonths: number): string {
  const m = Math.max(0, Math.round(totalMonths));
  const years = Math.floor(m / 12);
  const months = m % 12;
  const yPart = years === 1 ? '1 year' : `${years} years`;
  const mPart = months === 1 ? '1 month' : `${months} months`;
  if (years === 0) return mPart;
  if (months === 0) return yPart;
  return `${yPart} ${mPart}`;
}

// ---------------------------------------------------------------------------
// Mortgages
// ---------------------------------------------------------------------------

/**
 * Standard capital-and-interest monthly payment.
 *
 * M = P * i / (1 - (1 + i) ^ -n), with i = annual rate / 12.
 * Falls back to straight-line where the rate is zero.
 */
export function mortgageMonthlyPayment(
  principal: number,
  annualRatePct: number,
  termMonths: number,
): number {
  if (principal <= 0 || termMonths <= 0) return 0;
  const i = annualRatePct / 100 / 12;
  if (i === 0) return principal / termMonths;
  return (principal * i) / (1 - Math.pow(1 + i, -termMonths));
}

export type AmortisationResult = {
  /** Months actually taken to clear the balance. */
  months: number;
  totalInterest: number;
  totalPaid: number;
  /** Closing balance at the end of each month, index 0 = after month 1. */
  balances: number[];
  /** True where the payment never covers the interest, so it never clears. */
  neverClears: boolean;
};

/**
 * Run a mortgage forward month by month.
 *
 * `monthlyPayment` is the contractual payment. `overpayment` is added
 * on top every month. The final month is trimmed so the borrower never
 * overpays past zero.
 *
 * Hard-capped at 720 months (60 years) so a bad input cannot spin.
 */
export function amortise(
  principal: number,
  annualRatePct: number,
  monthlyPayment: number,
  overpayment = 0,
  capMonths = 720,
): AmortisationResult {
  const i = annualRatePct / 100 / 12;
  const pay = monthlyPayment + overpayment;
  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  const balances: number[] = [];

  if (pay <= 0) {
    return { months: 0, totalInterest: 0, totalPaid: 0, balances: [], neverClears: true };
  }

  // If the payment does not even cover the first month's interest the
  // balance grows for ever. Say so rather than returning a huge number.
  if (i > 0 && principal * i >= pay) {
    return { months: 0, totalInterest: 0, totalPaid: 0, balances: [], neverClears: true };
  }

  let months = 0;
  while (balance > 0 && months < capMonths) {
    const interest = balance * i;
    let payment = pay;
    if (balance + interest < pay) payment = balance + interest;
    balance = balance + interest - payment;
    if (balance < 0.005) balance = 0;
    totalInterest += interest;
    totalPaid += payment;
    balances.push(balance);
    months += 1;
  }

  return {
    months,
    totalInterest,
    totalPaid,
    balances,
    neverClears: balance > 0,
  };
}

/** Closing balance after `monthIndex` months (1-based). */
export function balanceAfter(result: AmortisationResult, monthIndex: number): number {
  if (result.balances.length === 0) return 0;
  if (monthIndex <= 0) return result.balances[0];
  if (monthIndex > result.balances.length) return 0;
  return result.balances[monthIndex - 1];
}

// ---------------------------------------------------------------------------
// Saving and compounding
// ---------------------------------------------------------------------------

/** AER to the equivalent monthly rate. */
export function monthlyRateFromAer(aerPct: number): number {
  return Math.pow(1 + aerPct / 100, 1 / 12) - 1;
}

/**
 * Future value of a lump sum plus a level monthly contribution paid at
 * the end of each month, compounded monthly from an AER.
 */
export function futureValue(
  initial: number,
  monthlyContribution: number,
  aerPct: number,
  months: number,
): number {
  const i = monthlyRateFromAer(aerPct);
  if (months <= 0) return initial;
  if (i === 0) return initial + monthlyContribution * months;
  const growth = Math.pow(1 + i, months);
  return initial * growth + monthlyContribution * ((growth - 1) / i);
}

/** Monthly contribution needed to reach `target`. Negative means already there. */
export function requiredMonthlyContribution(
  target: number,
  initial: number,
  aerPct: number,
  months: number,
): number {
  if (months <= 0) return Infinity;
  const i = monthlyRateFromAer(aerPct);
  if (i === 0) return (target - initial) / months;
  const growth = Math.pow(1 + i, months);
  return ((target - initial * growth) * i) / (growth - 1);
}

/**
 * Months needed to reach `target`. Returns null where it is never
 * reached, for example a zero contribution and a zero rate.
 */
export function requiredMonths(
  target: number,
  initial: number,
  monthlyContribution: number,
  aerPct: number,
  capMonths = 1200,
): number | null {
  if (initial >= target) return 0;
  const i = monthlyRateFromAer(aerPct);
  if (i === 0) {
    if (monthlyContribution <= 0) return null;
    const n = (target - initial) / monthlyContribution;
    return n > capMonths ? null : Math.ceil(n);
  }
  const numerator = target * i + monthlyContribution;
  const denominator = initial * i + monthlyContribution;
  if (numerator <= 0 || denominator <= 0) return null;
  const n = Math.log(numerator / denominator) / Math.log(1 + i);
  if (!Number.isFinite(n) || n < 0) return null;
  return n > capMonths ? null : Math.ceil(n);
}

/**
 * AER needed to reach `target`, by bisection. Returns null where no
 * rate between 0% and 60% gets there.
 */
export function requiredAer(
  target: number,
  initial: number,
  monthlyContribution: number,
  months: number,
): number | null {
  if (months <= 0) return null;
  const atZero = futureValue(initial, monthlyContribution, 0, months);
  if (atZero >= target) return 0;
  const atMax = futureValue(initial, monthlyContribution, 60, months);
  if (atMax < target) return null;

  let low = 0;
  let high = 60;
  for (let step = 0; step < 80; step += 1) {
    const mid = (low + high) / 2;
    if (futureValue(initial, monthlyContribution, mid, months) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** What a future nominal amount is worth in today's money. */
export function realTerms(nominal: number, inflationPct: number, years: number): number {
  if (inflationPct <= 0) return nominal;
  return nominal / Math.pow(1 + inflationPct / 100, years);
}

// ---------------------------------------------------------------------------
// Small helpers shared by more than one calculator
// ---------------------------------------------------------------------------

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'annually';

export const FREQUENCY_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'a week',
  monthly: 'a month',
  quarterly: 'a quarter',
  annually: 'a year',
};

export function toAnnual(amount: number, frequency: Frequency): number {
  return amount * FREQUENCY_PER_YEAR[frequency];
}
