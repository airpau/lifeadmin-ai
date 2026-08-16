'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';
import {
  amortise,
  formatGbp,
  formatMonths,
  formatPct,
  mortgageMonthlyPayment,
  parseNumber,
  parsePositive,
} from '../_lib/finance';

/**
 * Repayment mortgage calculator with an overpayment scenario and a
 * rate stress test.
 *
 * All maths in ../_lib/finance.ts. Interest is a nominal monthly rate
 * of annual / 12, which is the standard repayment-schedule convention
 * UK lenders use.
 *
 * Two deliberate honesty choices:
 *
 *  1. The stress test is described as what a LENDER typically does, not
 *     as a rule you must pass. The Bank of England withdrew its
 *     mandatory affordability stress test in 2022. Lenders still stress
 *     under FCA MCOB 11.6, but the exact margin is theirs to set.
 *  2. The overpayment scenario says plainly that we cannot see your
 *     early repayment charge. Most fixed deals cap penalty-free
 *     overpayments at around 10% of the balance a year, and going over
 *     it can wipe out the saving the tool has just shown you.
 */

const DEFAULT_STRESS_MARGIN = 3;

export default function MortgageRepaymentCalculator() {
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [years, setYears] = useState('25');
  const [overpay, setOverpay] = useState('');
  const [stress, setStress] = useState('');
  const [netMonthly, setNetMonthly] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const principal = parsePositive(amount);
  const annualRate = parseNumber(rate);
  const termYears = parsePositive(years);
  const ready = principal !== null && annualRate !== null && annualRate >= 0 && termYears !== null;

  function evaluate(): Verdict {
    const p = principal ?? 0;
    const r = annualRate ?? 0;
    const termMonths = Math.round((termYears ?? 25) * 12);

    const monthly = mortgageMonthlyPayment(p, r, termMonths);
    const base = amortise(p, r, monthly, 0);

    const figures: NonNullable<Verdict['figures']> = [
      { label: 'Amount borrowed', value: formatGbp(p) },
      { label: 'Interest rate', value: formatPct(r, 2), note: 'Annual, applied monthly' },
      { label: 'Term', value: formatMonths(termMonths) },
      { label: 'Monthly payment', value: formatGbp(monthly, 2), emphasis: true },
      {
        label: 'Total interest over the full term',
        note: `${formatGbp(base.totalInterest)} of interest on ${formatGbp(p)} borrowed`,
        value: formatGbp(base.totalInterest),
      },
      {
        label: 'Total repaid',
        note: 'Capital plus interest, if the rate never changed',
        value: formatGbp(base.totalPaid),
        emphasis: true,
      },
    ];

    const reasoning: string[] = [
      `On ${formatGbp(p)} at ${formatPct(r, 2)} over ${formatMonths(termMonths)}, the capital and interest payment is ${formatGbp(monthly, 2)} a month.`,
      `Across the full term you would pay ${formatGbp(base.totalInterest)} in interest, so every ${formatGbp(100)} borrowed costs you ${formatGbp((base.totalInterest / p) * 100)} in interest on top.`,
    ];

    const nextSteps: string[] = [];
    const caveats: string[] = [
      'This assumes a repayment mortgage on a single rate for the whole term. Almost nobody has that. Most UK mortgages are a fixed deal of two to five years followed by whatever you can get next, so treat the total interest figure as a comparison tool rather than a forecast.',
      'It ignores arrangement fees, valuation fees, broker fees, and any fee you add to the loan. A low headline rate with a large fee can cost more than a higher rate without one.',
      'It ignores buildings insurance, ground rent, service charges and any mortgage protection cover, none of which are optional in practice.',
    ];

    // Overpayment scenario ------------------------------------------------
    const op = parseNumber(overpay);
    if (op !== null && op > 0) {
      const opRun = amortise(p, r, monthly, op);
      const interestSaved = base.totalInterest - opRun.totalInterest;
      const monthsSaved = base.months - opRun.months;

      figures.push(
        {
          label: `Adding ${formatGbp(op)} a month`,
          note: `New monthly payment ${formatGbp(monthly + op, 2)}`,
          value: formatMonths(opRun.months),
        },
        {
          label: 'Interest saved by overpaying',
          value: formatGbp(interestSaved),
          emphasis: true,
        },
        {
          label: 'Time saved',
          note: `Cleared in ${formatMonths(opRun.months)} instead of ${formatMonths(base.months)}`,
          value: formatMonths(monthsSaved),
          emphasis: true,
        },
      );

      reasoning.push(
        `Paying an extra ${formatGbp(op)} a month clears the mortgage ${formatMonths(monthsSaved)} early and saves ${formatGbp(interestSaved)} in interest. You would put in ${formatGbp(op * opRun.months)} of overpayments to save that, so the net gain is ${formatGbp(interestSaved)} of interest you never pay.`,
      );

      caveats.push(
        'We cannot see your mortgage offer, so we cannot see your early repayment charge. Most fixed deals allow overpayments of around 10% of the balance a year without penalty and charge for anything above that. Check your annual allowance before you set up an overpayment, because a charge can cancel out the saving above.',
        'Ask your lender to apply overpayments to reduce the TERM rather than the monthly payment. If they reduce the payment instead, the interest saving is far smaller than shown here.',
      );

      nextSteps.push(
        'Check your annual penalty-free overpayment allowance in your mortgage offer or annual statement before setting anything up.',
        'When you make the overpayment, tell the lender in writing to keep the term the same and reduce the balance, not to recalculate the payment down.',
      );
    } else {
      nextSteps.push(
        'Try an overpayment figure in the box above. Even a small regular amount early in the term takes a disproportionate bite out of the total interest, because the interest is front-loaded.',
      );
    }

    // Stress test ---------------------------------------------------------
    const stressRate = parseNumber(stress) ?? r + DEFAULT_STRESS_MARGIN;
    if (stressRate > r) {
      const stressedPayment = mortgageMonthlyPayment(p, stressRate, termMonths);
      const extra = stressedPayment - monthly;
      figures.push({
        label: `If the rate were ${formatPct(stressRate, 2)}`,
        note: `${formatGbp(extra, 2)} a month more than you pay now, which is ${formatGbp(extra * 12)} a year`,
        value: formatGbp(stressedPayment, 2),
      });
      reasoning.push(
        `If you remortgaged onto ${formatPct(stressRate, 2)} on the same balance and term, the payment would be ${formatGbp(stressedPayment, 2)}, an increase of ${formatGbp(extra, 2)} a month. That is the question worth answering before you fix, not what the payment is today.`,
      );
      caveats.push(
        'The stress figure is what a lender typically does when it checks affordability under FCA rules, not a rule you have to pass and not a prediction. The Bank of England withdrew its mandatory affordability stress test in 2022, so the margin each lender uses is its own choice.',
      );
    }

    // Affordability -------------------------------------------------------
    const net = parseNumber(netMonthly);
    let tone: Verdict['tone'] = 'yes';
    if (net !== null && net > 0) {
      const share = (monthly / net) * 100;
      figures.push({
        label: 'Payment as a share of your take-home pay',
        note: 'Rule of thumb only, and it says nothing about your other commitments',
        value: formatPct(share),
      });
      if (share > 45) {
        tone = 'caution';
        reasoning.push(
          `The payment is ${formatPct(share)} of your take-home pay. That is high by any common measure, and it leaves very little room if the rate rises. The stress figure above is the one to look at hardest.`,
        );
      } else if (share > 35) {
        tone = 'maybe';
        reasoning.push(
          `The payment is ${formatPct(share)} of your take-home pay. Lenders and household budgeting guidance commonly treat somewhere around a third as the point where things get tight, so this is worth stress-testing rather than waving through.`,
        );
      } else {
        reasoning.push(
          `The payment is ${formatPct(share)} of your take-home pay, which is within the range most lenders and budgeting rules of thumb treat as comfortable. That is a crude measure, and it takes no account of childcare, other debt, or how secure your income is.`,
        );
      }
      caveats.push(
        'The share of income figure is a rule of thumb, not a test. Lenders assess affordability against your full committed expenditure, dependants and credit commitments, and they will reach a different number from this one.',
      );
    } else {
      nextSteps.push(
        'Work out your monthly take-home pay and put it in the box above, so you can see the payment as a share of what you actually receive rather than of your gross salary.',
      );
    }

    nextSteps.push(
      'Compare deals on the total cost over the fixed period, fee included, rather than on the headline rate.',
      'Diarise the end of your fixed rate for six months beforehand. Rolling onto a lender’s standard variable rate is one of the most expensive things that happens to UK borrowers by accident.',
    );

    return {
      tone,
      tag: 'Repayment mortgage',
      headline: 'Your monthly payment and what the mortgage costs in total',
      amount: formatGbp(monthly, 0),
      amountNote: `a month on ${formatGbp(p)} at ${formatPct(r, 2)} over ${formatMonths(Math.round((termYears ?? 25) * 12))}`,
      figures,
      figuresHeading: 'The working',
      reasoning,
      nextSteps,
      caveats,
    };
  }

  return (
    <div className="tool-card">
      <h2>Work out your mortgage payment</h2>
      <p className="tool-card-hint">
        For a capital and interest repayment mortgage. Leave the optional
        boxes blank if you only want the payment. Nothing is sent to us.
      </p>

      <div className="tool-fields is-two">
        <Field label="Amount borrowed" htmlFor="mg-amount" help="The loan, not the property price.">
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="mg-amount"
              type="text"
              inputMode="decimal"
              placeholder="220,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        </Field>

        <Field label="Interest rate" htmlFor="mg-rate" help="The annual rate, as a percentage.">
          <input
            id="mg-rate"
            type="text"
            inputMode="decimal"
            placeholder="4.5"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>

        <Field label="Term, in years" htmlFor="mg-years" help="How long the mortgage runs for in total.">
          <input
            id="mg-years"
            type="text"
            inputMode="decimal"
            placeholder="25"
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </Field>

        <Field
          label="Monthly overpayment (optional)"
          htmlFor="mg-overpay"
          help="Extra on top of the contractual payment. Check your penalty-free allowance first."
        >
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="mg-overpay"
              type="text"
              inputMode="decimal"
              placeholder="150"
              value={overpay}
              onChange={(e) => setOverpay(e.target.value)}
            />
          </div>
        </Field>

        <Field
          label="Stress-test rate (optional)"
          htmlFor="mg-stress"
          help={`Leave blank and we use your rate plus ${DEFAULT_STRESS_MARGIN} percentage points, which is a typical lender margin.`}
        >
          <input
            id="mg-stress"
            type="text"
            inputMode="decimal"
            placeholder={annualRate !== null ? String(annualRate + DEFAULT_STRESS_MARGIN) : '7.5'}
            value={stress}
            onChange={(e) => setStress(e.target.value)}
          />
        </Field>

        <Field
          label="Monthly take-home pay (optional)"
          htmlFor="mg-net"
          help="For the affordability note. Household take-home if you are buying jointly."
        >
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="mg-net"
              type="text"
              inputMode="decimal"
              placeholder="2,800"
              value={netMonthly}
              onChange={(e) => setNetMonthly(e.target.value)}
            />
          </div>
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
          Work out the payment
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setAmount('');
              setRate('');
              setYears('25');
              setOverpay('');
              setStress('');
              setNetMonthly('');
              setVerdict(null);
            }}
          >
            Start again
          </button>
        ) : null}
      </div>

      {verdict ? <ResultCard verdict={verdict} /> : null}

      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 18, lineHeight: 1.6 }}>
        Method: standard capital and interest amortisation, with a monthly
        interest rate of the annual rate divided by twelve. Overpayments are
        applied at the end of each month and reduce the term rather than the
        payment. No fees, insurance or product charges are included.
      </p>
    </div>
  );
}
