'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';
import {
  ISA_ALLOWANCE,
  NI,
  PA_TAPER_THRESHOLD,
  PA_TAPER_ZERO_AT,
  PERSONAL_ALLOWANCE,
  REGION_LABEL,
  STUDENT_LOAN_PLANS,
  TAX_VERIFIED_ON_HUMAN,
  TAX_YEAR_LABEL,
  TAX_YEAR_RANGE,
  bandsFor,
  type TaxRegion,
} from '../_data/uk-tax';
import { calculateTakeHome, type PensionMethod } from '../_lib/uk-tax-engine';
import { formatGbp, formatPct, parseNumber, parsePositive } from '../_lib/finance';

/**
 * Gross salary to net pay.
 *
 * The arithmetic lives in ../_lib/uk-tax-engine.ts. The tax-year
 * figures live in ../_data/uk-tax.ts. This file is inputs and wording
 * only, so the logic can be checked without reading JSX.
 *
 * Three things this tool does that most free salary calculators do not:
 *
 *  1. It tapers the personal allowance on income AFTER pension relief,
 *     so a £110,000 earner paying into a pension sees the allowance
 *     come back. That is the single most valuable output on the page.
 *  2. It separates salary sacrifice from a net pay arrangement, because
 *     only sacrifice reduces National Insurance and student loan.
 *  3. It shows the marginal rate, so the 62% band between £100,000 and
 *     £125,140 is visible rather than buried in a total.
 */

type PensionBasis = 'percent' | 'fixed';
type PlanChoice = 'none' | 'plan1' | 'plan2' | 'plan4' | 'plan5';

const UNDERGRAD_PLANS = STUDENT_LOAN_PLANS.filter((p) => p.id !== 'postgrad');
const POSTGRAD = STUDENT_LOAN_PLANS.find((p) => p.id === 'postgrad')!;

export default function TakeHomePayCalculator() {
  const [salary, setSalary] = useState('');
  const [region, setRegion] = useState<TaxRegion>('ruk');
  const [pensionMethod, setPensionMethod] = useState<PensionMethod>('none');
  const [pensionBasis, setPensionBasis] = useState<PensionBasis>('percent');
  const [pensionAmount, setPensionAmount] = useState('5');
  const [plan, setPlan] = useState<PlanChoice>('none');
  const [postgrad, setPostgrad] = useState<'yes' | 'no'>('no');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const gross = parsePositive(salary);
  const ready = gross !== null;

  function evaluate(): Verdict {
    const grossAnnual = gross ?? 0;

    const rawPension = parseNumber(pensionAmount) ?? 0;
    const pensionAnnual =
      pensionMethod === 'none'
        ? 0
        : pensionBasis === 'percent'
          ? Math.max(0, Math.min(rawPension, 100)) * 0.01 * grossAnnual
          : Math.max(0, rawPension);

    const result = calculateTakeHome({
      grossAnnual,
      region,
      pensionAnnual,
      pensionMethod,
      undergraduatePlan: plan === 'none' ? null : plan,
      postgraduateLoan: postgrad === 'yes',
    });

    const figures: NonNullable<Verdict['figures']> = [
      { label: 'Gross salary', value: formatGbp(result.grossAnnual, 2) },
    ];

    if (result.pensionAnnual > 0) {
      figures.push({
        label: 'Less pension contribution',
        note:
          pensionMethod === 'sacrifice'
            ? 'Salary sacrifice, so it comes off before Income Tax and National Insurance'
            : 'Net pay arrangement, so it comes off before Income Tax but not before National Insurance',
        value: `− ${formatGbp(result.pensionAnnual, 2)}`,
      });
    }

    figures.push({
      label: 'Personal allowance',
      note:
        result.personalAllowanceLost > 0
          ? `Reduced by ${formatGbp(result.personalAllowanceLost, 2)}, because income above ${formatGbp(PA_TAPER_THRESHOLD)} cuts it by £1 for every £2`
          : 'The standard allowance, in full',
      value: formatGbp(result.personalAllowance, 2),
    });

    figures.push({
      label: 'Taxable income',
      note: 'What the bands below are applied to',
      value: formatGbp(result.taxableIncome, 2),
    });

    for (const band of result.bandCharges) {
      figures.push({
        label: `${band.name} at ${(band.rate * 100).toFixed(0)}%`,
        note: `on ${formatGbp(band.amountInBand, 2)}`,
        value: formatGbp(band.tax, 2),
      });
    }

    figures.push({
      label: 'Income Tax',
      value: formatGbp(result.incomeTax, 2),
    });

    if (result.niMain > 0) {
      figures.push({
        label: `National Insurance at ${(NI.mainRate * 100).toFixed(0)}%`,
        note: `on pay between ${formatGbp(NI.primaryThreshold)} and ${formatGbp(NI.upperEarningsLimit)}`,
        value: formatGbp(result.niMain, 2),
      });
    }
    if (result.niUpper > 0) {
      figures.push({
        label: `National Insurance at ${(NI.upperRate * 100).toFixed(0)}%`,
        note: `on pay above ${formatGbp(NI.upperEarningsLimit)}`,
        value: formatGbp(result.niUpper, 2),
      });
    }
    if (result.nationalInsurance === 0) {
      figures.push({
        label: 'National Insurance',
        note: `Nothing due below the ${formatGbp(NI.primaryThreshold)} primary threshold`,
        value: formatGbp(0, 2),
      });
    }

    for (const charge of result.studentLoanCharges) {
      figures.push({
        label: `${charge.plan.label} at ${(charge.plan.rate * 100).toFixed(0)}%`,
        note:
          charge.amountOverThreshold > 0
            ? `on ${formatGbp(charge.amountOverThreshold, 2)} above the ${formatGbp(charge.plan.threshold)} threshold`
            : `Nothing due below the ${formatGbp(charge.plan.threshold)} threshold`,
        value: formatGbp(charge.repayment, 2),
      });
    }

    figures.push({
      label: 'Take-home pay a year',
      value: formatGbp(result.takeHomeAnnual, 2),
      emphasis: true,
    });
    figures.push({
      label: 'Take-home pay a month',
      value: formatGbp(result.takeHomeMonthly, 2),
      emphasis: true,
    });

    const reasoning: string[] = [
      `Worked out on ${TAX_YEAR_LABEL} rates (${TAX_YEAR_RANGE}) for ${REGION_LABEL[region]}, last checked against GOV.UK on ${TAX_VERIFIED_ON_HUMAN}.`,
      `You keep ${formatPct(result.takeHomePct)} of your gross salary. Income Tax, National Insurance and student loan together take ${formatPct(result.effectiveDeductionPct)}.`,
      `Your marginal rate is ${formatPct(result.marginalRatePct, 0)}. That is what the next pound of salary is worth to you, and it is the number that matters for a pay rise, a bonus or overtime.`,
    ];

    if (result.pensionAnnual > 0 && pensionMethod === 'sacrifice') {
      reasoning.push(
        'Because you sacrifice salary rather than paying from net pay, the contribution comes off before National Insurance as well as before Income Tax. On the same contribution a net pay arrangement would leave you with less in your pocket.',
      );
    }
    if (result.pensionAnnual > 0 && pensionMethod === 'netpay') {
      reasoning.push(
        'A net pay arrangement gives Income Tax relief but not National Insurance relief. If your employer offers salary sacrifice instead, the same contribution would cost you less, and your employer usually saves too.',
      );
    }

    const caveats: string[] = [
      'This assumes an employee taxed under PAYE on National Insurance category A, with a standard tax code and no taxable benefits in kind.',
      'It does not cover the self-employed, company directors, anyone over State Pension age (who pays no employee National Insurance), the marriage or blind person’s allowances, dividend or savings income, or a non-standard tax code.',
      'Real payroll runs on a weekly or monthly cycle, not on an annual figure. Your payslip can differ from this by a few pounds a month, and by more in the first months of a tax year if your pay has changed.',
      `Student loan repayments here are calculated on your annual pay. In practice they are taken each pay period, so an irregular month such as a bonus can trigger a deduction even when your annual pay is below the threshold. You can reclaim that at the end of the tax year if your annual income was under the threshold for your plan.`,
    ];

    if (pensionMethod !== 'none' && pensionBasis === 'percent') {
      caveats.push(
        'You entered a percentage, and we applied it to your whole salary. Many auto-enrolment schemes calculate the contribution on qualifying earnings, a narrower band, which gives a smaller pounds figure. If you want this exact, take the cash amount off your payslip and enter that instead.',
      );
    }

    caveats.push(
      'Relief at source schemes, where the contribution comes out of pay after tax and the provider claims 20% back, are not modelled here. If you are a higher or additional rate taxpayer in a relief at source scheme, you claim the rest through Self Assessment, so your effective cost is lower than this shows.',
    );

    const nextSteps: string[] = [];

    if (result.inTaperBand) {
      nextSteps.push(
        `Between ${formatGbp(PA_TAPER_THRESHOLD)} and ${formatGbp(PA_TAPER_ZERO_AT)} your personal allowance is being withdrawn, which makes your true marginal rate ${formatPct(result.marginalRatePct, 0)} rather than the headline 40%. A pension contribution in this band is the one thing that reliably reverses it.`,
      );
      const toClear = Math.max(0, result.adjustedNetIncome - PA_TAPER_THRESHOLD);
      nextSteps.push(
        `Putting a further ${formatGbp(toClear)} into a pension this year would bring your adjusted net income back to ${formatGbp(PA_TAPER_THRESHOLD)} and restore the full ${formatGbp(PERSONAL_ALLOWANCE)} allowance. Check your annual allowance and your scheme rules before doing it.`,
      );
    }

    nextSteps.push(
      'Check the tax code on your payslip. A wrong code is the most common reason real take-home differs from a calculation like this, and HMRC will correct it if you tell them.',
      `If you have money left over each month, work out whether it does more good against a mortgage or in savings before it drifts. Interest inside an ISA is tax free, and the ISA allowance is ${formatGbp(ISA_ALLOWANCE)} for ${TAX_YEAR_LABEL}.`,
      'Check what is leaving your account on subscriptions you no longer use. That is usually a bigger number than people expect and it comes straight off the same net pay figure above.',
    );

    return {
      tone: result.inTaperBand ? 'maybe' : 'yes',
      tag: result.inTaperBand ? `${TAX_YEAR_LABEL} · allowance taper applies` : `${TAX_YEAR_LABEL} tax year`,
      headline: result.inTaperBand
        ? 'Here is your take-home pay, and you are inside the personal allowance taper'
        : 'Here is what actually reaches your account',
      amount: formatGbp(result.takeHomeMonthly, 0),
      amountNote: `a month, which is ${formatGbp(result.takeHomeAnnual, 0)} a year`,
      figures,
      figuresHeading: 'The working, line by line',
      reasoning,
      nextSteps,
      caveats,
    };
  }

  return (
    <div className="tool-card">
      <div className="tool-yearstamp">{TAX_YEAR_LABEL} tax year · {TAX_YEAR_RANGE}</div>
      <h2>Work out your take-home pay</h2>
      <p className="tool-card-hint">
        Enter your gross salary before any deductions. Everything is worked
        out in your browser and nothing is sent to us.
      </p>

      <div className="tool-fields is-two">
        <Field
          label="Gross annual salary"
          htmlFor="th-salary"
          help="Before tax, National Insurance, pension or anything else."
        >
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="th-salary"
              type="text"
              inputMode="decimal"
              placeholder="35,000"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
            />
          </div>
        </Field>

        <Field
          label="Where do you live?"
          htmlFor="th-region"
          help="Scotland sets its own Income Tax rates and bands. They differ materially, particularly between £43,663 and £50,270."
        >
          <select id="th-region" value={region} onChange={(e) => setRegion(e.target.value as TaxRegion)}>
            <option value="ruk">England, Wales or Northern Ireland</option>
            <option value="scotland">Scotland</option>
          </select>
        </Field>

        <Field
          label="Pension contribution"
          htmlFor="th-pmethod"
          help="Salary sacrifice also saves National Insurance. A net pay arrangement does not. Check your payslip or ask HR if you are unsure."
        >
          <select
            id="th-pmethod"
            value={pensionMethod}
            onChange={(e) => setPensionMethod(e.target.value as PensionMethod)}
          >
            <option value="none">None</option>
            <option value="sacrifice">Salary sacrifice</option>
            <option value="netpay">Net pay arrangement</option>
          </select>
        </Field>

        <Field
          label="How much do you pay in?"
          htmlFor="th-pamount"
          help={
            pensionMethod === 'none'
              ? 'Select a pension type first.'
              : pensionBasis === 'percent'
                ? 'A percentage of your full salary. Enter the cash amount from your payslip instead if you want this exact.'
                : 'The cash amount you pay in each year.'
          }
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              aria-label="Pension contribution basis"
              value={pensionBasis}
              onChange={(e) => setPensionBasis(e.target.value as PensionBasis)}
              disabled={pensionMethod === 'none'}
              style={{ flex: '0 0 auto', width: 118 }}
            >
              <option value="percent">Percent</option>
              <option value="fixed">£ a year</option>
            </select>
            <input
              id="th-pamount"
              type="text"
              inputMode="decimal"
              placeholder={pensionBasis === 'percent' ? '5' : '2,000'}
              value={pensionAmount}
              disabled={pensionMethod === 'none'}
              onChange={(e) => setPensionAmount(e.target.value)}
            />
          </div>
        </Field>

        <Field
          label="Student loan plan"
          htmlFor="th-plan"
          help="If you are not sure which plan you are on, it depends on where and when you started your course."
        >
          <select id="th-plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanChoice)}>
            <option value="none">None</option>
            {UNDERGRAD_PLANS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} — {formatGbp(p.threshold)} threshold
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Postgraduate loan as well?"
          htmlFor="th-pg"
          help={`Repaid at ${(POSTGRAD.rate * 100).toFixed(0)}% above ${formatGbp(POSTGRAD.threshold)}, on top of any undergraduate plan rather than instead of it.`}
        >
          <select id="th-pg" value={postgrad} onChange={(e) => setPostgrad(e.target.value as 'yes' | 'no')}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </Field>
      </div>

      <div className="tool-actions">
        <button
          type="button"
          className="btn btn-mint btn-lg"
          disabled={!ready}
          style={ready ? undefined : { opacity: 0.45, cursor: 'not-allowed', boxShadow: 'none' }}
          onClick={() => setVerdict(evaluate())}
        >
          Work out my take-home pay
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setSalary('');
              setRegion('ruk');
              setPensionMethod('none');
              setPensionBasis('percent');
              setPensionAmount('5');
              setPlan('none');
              setPostgrad('no');
              setVerdict(null);
            }}
          >
            Start again
          </button>
        ) : null}
      </div>

      {verdict ? <ResultCard verdict={verdict} /> : null}

      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 18, lineHeight: 1.6 }}>
        Figures used: {TAX_YEAR_LABEL} ({TAX_YEAR_RANGE}). Personal allowance{' '}
        {formatGbp(PERSONAL_ALLOWANCE)}, withdrawn by £1 for every £2 of income above{' '}
        {formatGbp(PA_TAPER_THRESHOLD)} and gone at {formatGbp(PA_TAPER_ZERO_AT)}.{' '}
        {region === 'scotland' ? 'Scottish' : 'England, Wales and Northern Ireland'} bands:{' '}
        {bandsFor(region)
          .map((b) => `${b.name} ${(b.rate * 100).toFixed(0)}% (${b.displayRange})`)
          .join(', ')}
        . National Insurance {(NI.mainRate * 100).toFixed(0)}% between{' '}
        {formatGbp(NI.primaryThreshold)} and {formatGbp(NI.upperEarningsLimit)}, then{' '}
        {(NI.upperRate * 100).toFixed(0)}%. All read from GOV.UK on {TAX_VERIFIED_ON_HUMAN}.
      </p>
    </div>
  );
}
