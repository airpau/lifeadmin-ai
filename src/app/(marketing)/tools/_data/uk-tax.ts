/**
 * UK PERSONAL TAX CONSTANTS — SINGLE SOURCE OF TRUTH FOR /tools
 * =============================================================
 *
 * Every tax-year figure used by the personal-finance calculators at
 * /tools lives in this file and nowhere else. The take-home pay
 * calculator, the overpay-vs-save calculator and the savings goal
 * calculator all read from here. If a number appears on screen in one
 * of those tools, it came from this file.
 *
 * TAX YEAR: 2026/27 (6 April 2026 to 5 April 2027)
 * VERIFIED ON: 16 August 2026, against the GOV.UK pages listed against
 * each block below. Every figure was read off the live page on that
 * date, not recalled.
 *
 * ---------------------------------------------------------------------
 * HOW TO UPDATE (do this in the week after each Budget, and again in
 * the first week of April when the new tax year starts)
 *
 *   1. Open each `source` URL in the blocks below.
 *   2. Confirm the page says the tax year you are updating to. GOV.UK
 *      shows the CURRENT year on these URLs, so check the year on the
 *      page rather than assuming.
 *   3. Update the figures in place, then update TAX_YEAR_LABEL,
 *      TAX_YEAR_RANGE and TAX_VERIFIED_ON at the top.
 *   4. Do NOT change the shape of the band arrays. Every band bound is
 *      measured on TAXABLE income, meaning gross pay after the personal
 *      allowance has been taken off. That convention is what makes the
 *      £100k taper come out right, and changing it silently breaks
 *      every high-earner answer.
 *   5. Re-run the worked examples in the comment at the bottom of this
 *      file. If they no longer match, something is wrong.
 *   6. Every tool prints TAX_YEAR_LABEL on screen, so a stale file is
 *      visible to users rather than hidden. That is deliberate.
 *
 * ---------------------------------------------------------------------
 * WHAT THESE FIGURES ARE, AND WHAT THEY ARE NOT
 *
 * They cover an employee taxed under PAYE on National Insurance
 * category A, with a standard tax code and no taxable benefits in kind.
 * They do NOT cover: the self-employed (Class 2 and Class 4 National
 * Insurance work differently), company directors (annual earnings
 * period), people over State Pension age (no employee National
 * Insurance), the married couple's or blind person's allowances,
 * dividend income, the High Income Child Benefit Charge, or anyone with
 * a non-standard tax code.
 *
 * The tools must say so on screen rather than quietly producing a
 * number that is wrong for those people.
 */

export const TAX_YEAR_LABEL = '2026/27';
export const TAX_YEAR_RANGE = '6 April 2026 to 5 April 2027';
export const TAX_VERIFIED_ON = '2026-08-16';
export const TAX_VERIFIED_ON_HUMAN = '16 August 2026';

/**
 * A tax band.
 *
 * `from` and `to` are measured on TAXABLE income, i.e. gross pay less
 * the personal allowance actually due (after any £100k taper). This is
 * the same basis HMRC uses in the employer guidance, where the basic
 * rate is described as applying to the first £37,700 "above the PAYE
 * threshold".
 */
export type TaxBand = {
  name: string;
  /** 0.2 means 20%. */
  rate: number;
  from: number;
  to: number;
  /** Wording copied from GOV.UK, for the on-screen rates table. */
  displayRange: string;
};

// ---------------------------------------------------------------------------
// Income Tax — England, Wales and Northern Ireland
// Source: https://www.gov.uk/income-tax-rates
// Cross-checked: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
// Verified 2026-08-16.
// ---------------------------------------------------------------------------

export const PERSONAL_ALLOWANCE = 12570;

/** Adjusted net income above which the personal allowance starts to taper. */
export const PA_TAPER_THRESHOLD = 100000;

/** £1 of allowance lost for every £2 of income above the threshold. */
export const PA_TAPER_RATE = 0.5;

/** Adjusted net income at which the personal allowance reaches zero. */
export const PA_TAPER_ZERO_AT = 125140;

/**
 * Note on the top boundary, because it is the easiest thing in this
 * file to get wrong.
 *
 * The additional rate starts at £125,140 measured on TAXABLE income,
 * not at £112,570 (£125,140 less a full personal allowance). By the
 * time anyone reaches £125,140 the allowance has already tapered to
 * zero, so taxable income and total income are the same number there.
 * Using £112,570 would wrongly charge 45% on part of a £120,000 salary.
 *
 * Check after any edit: gross £125,140 with no pension should give
 * Income Tax of exactly £42,516.
 */
export const INCOME_TAX_BANDS_RUK: ReadonlyArray<TaxBand> = [
  { name: 'Basic rate', rate: 0.2, from: 0, to: 37700, displayRange: '£12,571 to £50,270' },
  { name: 'Higher rate', rate: 0.4, from: 37700, to: 125140, displayRange: '£50,271 to £125,140' },
  { name: 'Additional rate', rate: 0.45, from: 125140, to: Infinity, displayRange: 'over £125,140' },
];

// ---------------------------------------------------------------------------
// Income Tax — Scotland
// Source: https://www.gov.uk/scottish-income-tax
// Cross-checked: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
// Verified 2026-08-16.
//
// Scottish rates apply to earned income only. Savings interest and
// dividends are taxed at the rest-of-UK rates even for a Scottish
// taxpayer, which is why the savings tools use the rUK bands.
// ---------------------------------------------------------------------------

export const INCOME_TAX_BANDS_SCOTLAND: ReadonlyArray<TaxBand> = [
  { name: 'Starter rate', rate: 0.19, from: 0, to: 3967, displayRange: '£12,571 to £16,537' },
  { name: 'Basic rate', rate: 0.2, from: 3967, to: 16956, displayRange: '£16,538 to £29,526' },
  { name: 'Intermediate rate', rate: 0.21, from: 16956, to: 31092, displayRange: '£29,527 to £43,662' },
  { name: 'Higher rate', rate: 0.42, from: 31092, to: 62430, displayRange: '£43,663 to £75,000' },
  { name: 'Advanced rate', rate: 0.45, from: 62430, to: 125140, displayRange: '£75,001 to £125,140' },
  { name: 'Top rate', rate: 0.48, from: 125140, to: Infinity, displayRange: 'over £125,140' },
];

export type TaxRegion = 'ruk' | 'scotland';

export function bandsFor(region: TaxRegion): ReadonlyArray<TaxBand> {
  return region === 'scotland' ? INCOME_TAX_BANDS_SCOTLAND : INCOME_TAX_BANDS_RUK;
}

export const REGION_LABEL: Record<TaxRegion, string> = {
  ruk: 'England, Wales or Northern Ireland',
  scotland: 'Scotland',
};

// ---------------------------------------------------------------------------
// Employee Class 1 National Insurance — category A
// Source: https://www.gov.uk/national-insurance-rates-letters
// Cross-checked: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
// Verified 2026-08-16.
//
// GOV.UK publishes these weekly and monthly as well as annually. The
// annual figures below are the ones in the HMRC employer guidance
// table. Real payroll is run on the weekly or monthly figure, so a
// payslip can differ by a few pounds from an annual calculation —
// the tool says so.
// ---------------------------------------------------------------------------

export const NI = {
  /** Below this you pay nothing but still build a qualifying year. */
  lowerEarningsLimit: 6708,
  /** Employee contributions start above this. £242 a week, £1,048 a month. */
  primaryThreshold: 12570,
  /** The rate drops above this. £967 a week, £4,189 a month. */
  upperEarningsLimit: 50270,
  /** Category A main rate between the primary threshold and the UEL. */
  mainRate: 0.08,
  /** Category A rate on everything above the UEL. */
  upperRate: 0.02,
} as const;

// ---------------------------------------------------------------------------
// Student loan repayment thresholds
// Source: https://www.gov.uk/repaying-your-student-loan/what-you-pay
// Cross-checked: https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
// Verified 2026-08-16.
//
// Interest rates are NOT stored here. They change more often than the
// thresholds and they do not affect what comes off a payslip, which is
// all the take-home calculator claims to work out.
// ---------------------------------------------------------------------------

export type StudentLoanPlan = {
  id: 'plan1' | 'plan2' | 'plan4' | 'plan5' | 'postgrad';
  label: string;
  /** Annual income threshold. */
  threshold: number;
  /** 0.09 means 9% of income above the threshold. */
  rate: number;
  /** Who is normally on it, in plain words. */
  who: string;
};

export const STUDENT_LOAN_PLANS: ReadonlyArray<StudentLoanPlan> = [
  {
    id: 'plan1',
    label: 'Plan 1',
    threshold: 26900,
    rate: 0.09,
    who: 'Started an undergraduate course in England or Wales before September 2012, or in Northern Ireland at any point.',
  },
  {
    id: 'plan2',
    label: 'Plan 2',
    threshold: 29385,
    rate: 0.09,
    who: 'Started an undergraduate course in England or Wales between September 2012 and July 2023.',
  },
  {
    id: 'plan4',
    label: 'Plan 4',
    threshold: 33795,
    rate: 0.09,
    who: 'Studied in Scotland and took the loan from the Student Awards Agency Scotland.',
  },
  {
    id: 'plan5',
    label: 'Plan 5',
    threshold: 25000,
    rate: 0.09,
    who: 'Started an undergraduate course in England from August 2023 onwards.',
  },
  {
    id: 'postgrad',
    label: 'Postgraduate Loan',
    threshold: 21000,
    rate: 0.06,
    who: "A master's or doctoral loan. Repaid alongside an undergraduate plan, not instead of it.",
  },
];

export function getStudentLoanPlan(id: string): StudentLoanPlan | undefined {
  return STUDENT_LOAN_PLANS.find((p) => p.id === id);
}

// ---------------------------------------------------------------------------
// Savings and investments
// Sources:
//   https://www.gov.uk/apply-tax-free-interest-on-savings  (PSA, starting rate)
//   https://www.gov.uk/individual-savings-accounts          (ISA allowance)
// Verified 2026-08-16.
// ---------------------------------------------------------------------------

export type SavingsTaxBand = 'nonTaxpayer' | 'basic' | 'higher' | 'additional';

export const PERSONAL_SAVINGS_ALLOWANCE: Record<SavingsTaxBand, number> = {
  // A non-taxpayer pays no tax on interest anyway, via the personal
  // allowance and the starting rate for savings. Treated as unlimited
  // headroom for the purpose of these tools, with a caveat on screen.
  nonTaxpayer: Infinity,
  basic: 1000,
  higher: 500,
  additional: 0,
};

/** The rate interest is taxed at once the allowance is used up. */
export const SAVINGS_TAX_RATE: Record<SavingsTaxBand, number> = {
  nonTaxpayer: 0,
  basic: 0.2,
  higher: 0.4,
  additional: 0.45,
};

export const SAVINGS_BAND_LABEL: Record<SavingsTaxBand, string> = {
  nonTaxpayer: 'I do not pay Income Tax',
  basic: 'Basic rate (20%)',
  higher: 'Higher rate (40%)',
  additional: 'Additional rate (45%)',
};

/** Maximum starting rate for savings, tapered away by other income. */
export const STARTING_RATE_FOR_SAVINGS = 5000;

/** Other income at or above which the starting rate for savings is nil. */
export const STARTING_RATE_INCOME_CEILING = 17570;

/** Total that can go into ISAs across all types in the tax year. */
export const ISA_ALLOWANCE = 20000;

// ---------------------------------------------------------------------------
// Source links, for the "the law this tool relies on" block.
// ---------------------------------------------------------------------------

export const TAX_SOURCE_URLS = {
  incomeTax: 'https://www.gov.uk/income-tax-rates',
  scottishIncomeTax: 'https://www.gov.uk/scottish-income-tax',
  nationalInsurance: 'https://www.gov.uk/national-insurance-rates-letters',
  employerRates: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027',
  studentLoans: 'https://www.gov.uk/repaying-your-student-loan/what-you-pay',
  savingsInterest: 'https://www.gov.uk/apply-tax-free-interest-on-savings',
  isas: 'https://www.gov.uk/individual-savings-accounts',
  adjustedNetIncome: 'https://www.gov.uk/guidance/adjusted-net-income',
  incomeOver100k: 'https://www.gov.uk/income-tax-rates/income-over-100000',
} as const;

// ---------------------------------------------------------------------------
// WORKED EXAMPLES — re-run these by hand after any update to this file.
//
// 2026/27, England, no pension, no student loan, category A:
//
//   Gross £30,000
//     Personal allowance £12,570, taxable £17,430
//     Income Tax  £17,430 x 20%                        = £3,486.00
//     NI          (£30,000 - £12,570) x 8%             = £1,394.40
//     Take home                                        = £25,119.60
//
//   Gross £60,000
//     Personal allowance £12,570, taxable £47,430
//     Income Tax  £37,700 x 20% + £9,730 x 40%         = £11,432.00
//     NI          £37,700 x 8% + £9,730 x 2%           = £3,210.60
//     Take home                                        = £45,357.40
//
//   Gross £120,000
//     Allowance tapered: £12,570 - (£20,000 / 2) = £2,570
//     Taxable £117,430
//     Income Tax  £37,700 x 20% + £79,730 x 40%        = £39,432.00
//     NI          £37,700 x 8% + £69,730 x 2%          = £4,410.60
//     Take home                                        = £76,157.40
//
//   Gross £50,000, Scotland
//     Personal allowance £12,570, taxable £37,430
//     Income Tax  £3,967 x 19% + £12,989 x 20%
//                 + £14,136 x 21% + £6,338 x 42%       = £8,982.05
//     NI          (£50,000 - £12,570) x 8%             = £2,994.40
//     Take home                                        = £38,023.55
// ---------------------------------------------------------------------------
