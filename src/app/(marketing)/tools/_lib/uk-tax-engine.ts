/**
 * PAYE take-home calculation for the /tools salary calculator.
 *
 * Pure. Every figure comes from ../_data/uk-tax.ts, which states the
 * tax year and the GOV.UK page each number was read from.
 *
 * THE THREE THINGS MOST SALARY CALCULATORS GET WRONG, AND WHAT WE DO
 *
 * 1. The £100k personal allowance taper. The allowance drops by £1 for
 *    every £2 of ADJUSTED NET INCOME above £100,000. Adjusted net
 *    income is after pension contributions that get relief, so a
 *    pension contribution can claw the allowance back. We taper on
 *    income after the pension, not on headline salary, which is why a
 *    £110k earner paying £10k into a pension gets the full allowance
 *    here. That is correct and it is the single most valuable thing
 *    this calculator tells anyone.
 *
 * 2. Salary sacrifice versus a net pay arrangement. Both reduce
 *    taxable income. Only salary sacrifice reduces National Insurance,
 *    because under sacrifice the contractual salary itself is lower.
 *    Only salary sacrifice reduces student loan repayments, for the
 *    same reason. Treating them as the same thing overstates take-home
 *    for anyone in a net pay scheme.
 *
 * 3. Student loans. The deduction is a percentage of income over a
 *    threshold, not of taxable income, and the personal allowance is
 *    irrelevant to it. A postgraduate loan is repaid ON TOP of an
 *    undergraduate plan, not instead of it.
 *
 * WHAT THIS DOES NOT MODEL
 *
 * Self-employment, company directors (annual earnings period for NI),
 * State Pension age (no employee NI), non-standard tax codes, benefits
 * in kind, the marriage allowance, the blind person's allowance,
 * dividend or savings income, and the High Income Child Benefit Charge.
 * The tool says all of this on screen.
 */

import {
  NI,
  PA_TAPER_RATE,
  PA_TAPER_THRESHOLD,
  PERSONAL_ALLOWANCE,
  STUDENT_LOAN_PLANS,
  bandsFor,
  type StudentLoanPlan,
  type TaxRegion,
} from '../_data/uk-tax';

export type PensionMethod = 'none' | 'sacrifice' | 'netpay';

export type TakeHomeInput = {
  grossAnnual: number;
  region: TaxRegion;
  /** The employee contribution in pounds a year. Zero where none. */
  pensionAnnual: number;
  pensionMethod: PensionMethod;
  /** Undergraduate plan id, or null. */
  undergraduatePlan: StudentLoanPlan['id'] | null;
  /** Whether a postgraduate loan is also being repaid. */
  postgraduateLoan: boolean;
};

export type BandCharge = {
  name: string;
  rate: number;
  amountInBand: number;
  tax: number;
};

export type StudentLoanCharge = {
  plan: StudentLoanPlan;
  amountOverThreshold: number;
  repayment: number;
};

export type TakeHomeResult = {
  grossAnnual: number;
  pensionAnnual: number;
  /** Income the personal allowance taper is measured against. */
  adjustedNetIncome: number;
  personalAllowance: number;
  personalAllowanceLost: number;
  taxableIncome: number;
  bandCharges: BandCharge[];
  incomeTax: number;
  /** Pay National Insurance is charged on. */
  niablePay: number;
  niMain: number;
  niUpper: number;
  nationalInsurance: number;
  studentLoanCharges: StudentLoanCharge[];
  studentLoan: number;
  totalDeductions: number;
  takeHomeAnnual: number;
  takeHomeMonthly: number;
  /** Take-home as a share of gross. */
  takeHomePct: number;
  /** Tax plus NI plus student loan, as a share of gross. */
  effectiveDeductionPct: number;
  /** What the next £100 of salary would actually be worth. */
  marginalRatePct: number;
  /** True inside the £100,000 to £125,140 allowance-taper band. */
  inTaperBand: boolean;
};

function taperedPersonalAllowance(adjustedNetIncome: number): number {
  if (adjustedNetIncome <= PA_TAPER_THRESHOLD) return PERSONAL_ALLOWANCE;
  const lost = (adjustedNetIncome - PA_TAPER_THRESHOLD) * PA_TAPER_RATE;
  return Math.max(0, PERSONAL_ALLOWANCE - lost);
}

function chargeBands(taxableIncome: number, region: TaxRegion): BandCharge[] {
  const out: BandCharge[] = [];
  for (const band of bandsFor(region)) {
    const amountInBand = Math.max(0, Math.min(taxableIncome, band.to) - band.from);
    if (amountInBand <= 0) continue;
    out.push({
      name: band.name,
      rate: band.rate,
      amountInBand,
      tax: amountInBand * band.rate,
    });
  }
  return out;
}

function employeeNi(niablePay: number): { main: number; upper: number; total: number } {
  const main =
    Math.max(0, Math.min(niablePay, NI.upperEarningsLimit) - NI.primaryThreshold) * NI.mainRate;
  const upper = Math.max(0, niablePay - NI.upperEarningsLimit) * NI.upperRate;
  return { main, upper, total: main + upper };
}

function studentLoans(
  basePay: number,
  undergraduatePlan: StudentLoanPlan['id'] | null,
  postgraduateLoan: boolean,
): StudentLoanCharge[] {
  const charges: StudentLoanCharge[] = [];
  const add = (id: StudentLoanPlan['id']) => {
    const plan = STUDENT_LOAN_PLANS.find((p) => p.id === id);
    if (!plan) return;
    const over = Math.max(0, basePay - plan.threshold);
    charges.push({ plan, amountOverThreshold: over, repayment: over * plan.rate });
  };
  if (undergraduatePlan && undergraduatePlan !== 'postgrad') add(undergraduatePlan);
  if (postgraduateLoan) add('postgrad');
  return charges;
}

/** One pass of the calculation, used both for the answer and for the marginal rate. */
function computeCore(input: TakeHomeInput) {
  const gross = Math.max(0, input.grossAnnual);
  const pension = input.pensionMethod === 'none' ? 0 : Math.min(Math.max(0, input.pensionAnnual), gross);

  // Both salary sacrifice and a net pay arrangement come off taxable
  // income, and so off adjusted net income for the taper.
  const adjustedNetIncome = gross - pension;

  // Only salary sacrifice reduces the pay National Insurance and
  // student loan repayments are charged on.
  const niablePay = input.pensionMethod === 'sacrifice' ? gross - pension : gross;

  const personalAllowance = taperedPersonalAllowance(adjustedNetIncome);
  const taxableIncome = Math.max(0, adjustedNetIncome - personalAllowance);
  const bandCharges = chargeBands(taxableIncome, input.region);
  const incomeTax = bandCharges.reduce((sum, b) => sum + b.tax, 0);

  const ni = employeeNi(niablePay);
  const slCharges = studentLoans(niablePay, input.undergraduatePlan, input.postgraduateLoan);
  const studentLoan = slCharges.reduce((sum, c) => sum + c.repayment, 0);

  const takeHomeAnnual = gross - pension - incomeTax - ni.total - studentLoan;

  return {
    gross,
    pension,
    adjustedNetIncome,
    personalAllowance,
    taxableIncome,
    bandCharges,
    incomeTax,
    niablePay,
    ni,
    slCharges,
    studentLoan,
    takeHomeAnnual,
  };
}

export function calculateTakeHome(input: TakeHomeInput): TakeHomeResult {
  const core = computeCore(input);

  // Marginal rate: what does one more £100 of salary actually deliver?
  // Worked by re-running the whole calculation £100 higher, which
  // automatically captures the allowance taper, the NI band change and
  // any student loan step. Pension is held at the same cash amount so
  // we are measuring the salary change alone.
  const STEP = 100;
  const bumped = computeCore({ ...input, grossAnnual: core.gross + STEP });
  const keptFromStep = bumped.takeHomeAnnual - core.takeHomeAnnual;
  const marginalRatePct = ((STEP - keptFromStep) / STEP) * 100;

  const totalDeductions = core.incomeTax + core.ni.total + core.studentLoan;

  return {
    grossAnnual: core.gross,
    pensionAnnual: core.pension,
    adjustedNetIncome: core.adjustedNetIncome,
    personalAllowance: core.personalAllowance,
    personalAllowanceLost: PERSONAL_ALLOWANCE - core.personalAllowance,
    taxableIncome: core.taxableIncome,
    bandCharges: core.bandCharges,
    incomeTax: core.incomeTax,
    niablePay: core.niablePay,
    niMain: core.ni.main,
    niUpper: core.ni.upper,
    nationalInsurance: core.ni.total,
    studentLoanCharges: core.slCharges,
    studentLoan: core.studentLoan,
    totalDeductions,
    takeHomeAnnual: core.takeHomeAnnual,
    takeHomeMonthly: core.takeHomeAnnual / 12,
    takeHomePct: core.gross > 0 ? (core.takeHomeAnnual / core.gross) * 100 : 0,
    effectiveDeductionPct: core.gross > 0 ? (totalDeductions / core.gross) * 100 : 0,
    marginalRatePct,
    inTaperBand:
      core.adjustedNetIncome > PA_TAPER_THRESHOLD &&
      core.personalAllowance > 0,
  };
}
