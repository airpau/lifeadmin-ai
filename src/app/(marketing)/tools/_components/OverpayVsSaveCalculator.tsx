'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';
import {
  ISA_ALLOWANCE,
  PERSONAL_SAVINGS_ALLOWANCE,
  SAVINGS_BAND_LABEL,
  SAVINGS_TAX_RATE,
  STARTING_RATE_FOR_SAVINGS,
  STARTING_RATE_INCOME_CEILING,
  TAX_VERIFIED_ON_HUMAN,
  TAX_YEAR_LABEL,
  TAX_YEAR_RANGE,
  type SavingsTaxBand,
} from '../_data/uk-tax';
import {
  amortise,
  balanceAfter,
  formatGbp,
  formatMonths,
  formatPct,
  monthlyRateFromAer,
  mortgageMonthlyPayment,
  parseNumber,
  parsePositive,
} from '../_lib/finance';

/**
 * Should spare money go against the mortgage or into savings?
 *
 * The comparison is deliberately like for like. Both routes are
 * measured as the improvement in net worth at the end of the chosen
 * horizon, against doing neither:
 *
 *   Overpay  = how much lower the mortgage balance is than it would
 *              have been.
 *   Save     = the size of the savings pot, after tax.
 *
 * That works because in the savings route you still make the normal
 * mortgage payment, so the baseline balance is the same in both.
 *
 * Savings interest is taxed year by year against the Personal Savings
 * Allowance, which is the bit most comparisons skip. A higher rate
 * taxpayer with £500 of allowance and a decent pot hits the tax charge
 * quickly, and once they do the after-tax return drops by 40%.
 *
 * WHAT THIS CANNOT SEE, and says so on screen: early repayment
 * charges, whether you have an emergency fund, job security, other
 * debt at a higher rate, an offset facility, or whether the money
 * would do more good in a pension. Those decide the answer as often as
 * the arithmetic does.
 */

const DEFAULT_HORIZON_YEARS = 5;

export default function OverpayVsSaveCalculator() {
  const [balance, setBalance] = useState('');
  const [mortgageRate, setMortgageRate] = useState('');
  const [termYears, setTermYears] = useState('20');
  const [spare, setSpare] = useState('');
  const [savingsRate, setSavingsRate] = useState('');
  const [band, setBand] = useState<SavingsTaxBand>('basic');
  const [wrapper, setWrapper] = useState<'isa' | 'taxable'>('taxable');
  const [otherInterest, setOtherInterest] = useState('');
  const [horizon, setHorizon] = useState(String(DEFAULT_HORIZON_YEARS));
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const bal = parsePositive(balance);
  const mRate = parseNumber(mortgageRate);
  const term = parsePositive(termYears);
  const spend = parsePositive(spare);
  const sRate = parseNumber(savingsRate);
  const years = parsePositive(horizon);

  const ready =
    bal !== null && mRate !== null && mRate >= 0 && term !== null && spend !== null && sRate !== null && sRate >= 0 && years !== null;

  function evaluate(): Verdict {
    const p = bal ?? 0;
    const mr = mRate ?? 0;
    const termMonths = Math.round((term ?? 20) * 12);
    const monthlySpare = spend ?? 0;
    const aer = sRate ?? 0;
    const horizonYears = Math.max(1, Math.round(years ?? DEFAULT_HORIZON_YEARS));
    const horizonMonths = horizonYears * 12;

    // --- Mortgage side -------------------------------------------------
    const contractual = mortgageMonthlyPayment(p, mr, termMonths);
    const baseline = amortise(p, mr, contractual, 0);
    const overpaid = amortise(p, mr, contractual, monthlySpare);

    const baselineBalance = balanceAfter(baseline, horizonMonths);
    const overpaidBalance = balanceAfter(overpaid, horizonMonths);
    const overpayGain = baselineBalance - overpaidBalance;
    const contributed = monthlySpare * Math.min(horizonMonths, overpaid.months);
    const interestAvoided = overpayGain - contributed;

    // --- Savings side --------------------------------------------------
    const isTaxed = wrapper === 'taxable' && band !== 'nonTaxpayer';
    const psa = PERSONAL_SAVINGS_ALLOWANCE[band];
    const alreadyUsed = Math.max(0, parseNumber(otherInterest) ?? 0);
    const psaHeadroom = Number.isFinite(psa) ? Math.max(0, psa - alreadyUsed) : Infinity;
    const savingsTaxRate = SAVINGS_TAX_RATE[band];

    const i = monthlyRateFromAer(aer);
    let pot = 0;
    let interestThisYear = 0;
    let grossInterest = 0;
    let taxPaid = 0;
    for (let m = 1; m <= horizonMonths; m += 1) {
      const interest = pot * i;
      pot += interest + monthlySpare;
      interestThisYear += interest;
      grossInterest += interest;
      if (m % 12 === 0) {
        if (isTaxed) {
          const taxable = Math.max(0, interestThisYear - psaHeadroom);
          const tax = taxable * savingsTaxRate;
          pot -= tax;
          taxPaid += tax;
        }
        interestThisYear = 0;
      }
    }
    const saveGain = pot;

    // --- Headline rate comparison ---------------------------------------
    const netSavingsRateOnMargin = isTaxed ? aer * (1 - savingsTaxRate) : aer;
    const difference = overpayGain - saveGain;
    const overpayWins = difference > 0;

    const figures: NonNullable<Verdict['figures']> = [
      { label: 'Mortgage rate', value: formatPct(mr, 2) },
      {
        label: 'Savings rate',
        note: isTaxed
          ? `${formatPct(aer, 2)} gross, worth ${formatPct(netSavingsRateOnMargin, 2)} once your Personal Savings Allowance is used up`
          : wrapper === 'isa'
            ? 'Inside an ISA, so no tax on the interest'
            : 'You told us you do not pay Income Tax',
        value: formatPct(aer, 2),
      },
      {
        label: `Spare money over ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}`,
        note: `${formatGbp(monthlySpare)} a month`,
        value: formatGbp(monthlySpare * horizonMonths),
      },
      {
        label: 'If you overpay the mortgage',
        note: `Balance ${formatGbp(overpaidBalance)} instead of ${formatGbp(baselineBalance)}`,
        value: formatGbp(overpayGain),
        emphasis: true,
      },
      {
        label: '— of which interest you never pay',
        note: 'The rest is simply your own money, moved from cash into equity',
        value: formatGbp(Math.max(0, interestAvoided)),
      },
      {
        label: 'If you save it instead',
        note: isTaxed
          ? `${formatGbp(grossInterest)} of interest earned, less ${formatGbp(taxPaid)} of tax`
          : `${formatGbp(grossInterest)} of interest earned, tax free`,
        value: formatGbp(saveGain),
        emphasis: true,
      },
      {
        label: overpayWins ? 'Overpaying is ahead by' : 'Saving is ahead by',
        note: `After ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}, on these figures alone`,
        value: formatGbp(Math.abs(difference)),
        emphasis: true,
      },
    ];

    const reasoning: string[] = [
      `The rule underneath this is simple: overpaying is worth your mortgage rate, guaranteed and tax free, because interest you never pay is not income. Saving is worth your savings rate after tax. Compare ${formatPct(mr, 2)} against ${formatPct(netSavingsRateOnMargin, 2)} and you have most of the answer.`,
      overpayWins
        ? `Over ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}, overpaying leaves you ${formatGbp(Math.abs(difference))} better off than saving the same money.`
        : `Over ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}, saving leaves you ${formatGbp(Math.abs(difference))} better off than overpaying the same money.`,
      `Both routes are measured the same way: how much better off you are at the end than if you had done neither. For the overpayment that is the smaller mortgage balance; for saving it is the pot, after any tax.`,
    ];

    if (isTaxed) {
      reasoning.push(
        `You told us you are a ${SAVINGS_BAND_LABEL[band].toLowerCase()} taxpayer holding this outside an ISA, so your Personal Savings Allowance is ${formatGbp(Number.isFinite(psa) ? psa : 0)} a year${alreadyUsed > 0 ? `, of which you have already used ${formatGbp(alreadyUsed)}` : ''}. Interest above that is taxed at ${formatPct(savingsTaxRate * 100, 0)}. Over the period that came to ${formatGbp(taxPaid)} of tax.`,
      );
      if (taxPaid === 0) {
        reasoning.push(
          'On these figures your interest stayed inside the allowance for every year, so no tax was due. That changes as the pot grows, or if savings rates rise, so it is worth rechecking rather than assuming.',
        );
      }
    } else if (wrapper === 'isa') {
      reasoning.push(
        `Inside an ISA the interest is tax free and does not touch your Personal Savings Allowance. The ISA allowance is ${formatGbp(ISA_ALLOWANCE)} across all ISA types for ${TAX_YEAR_LABEL}, so at ${formatGbp(monthlySpare)} a month you would use ${formatGbp(Math.min(monthlySpare * 12, ISA_ALLOWANCE))} of it a year.`,
      );
    }

    if (overpaid.months < baseline.months) {
      reasoning.push(
        `On the overpayment route the mortgage clears in ${formatMonths(overpaid.months)} rather than ${formatMonths(baseline.months)}, which is ${formatMonths(baseline.months - overpaid.months)} earlier. That saving keeps growing after the horizon you chose, which is why a longer horizon usually favours overpaying.`,
      );
    }

    const nextSteps: string[] = [
      'Before anything else, check your mortgage offer for the annual penalty-free overpayment allowance. It is commonly around 10% of the balance a year on a fixed deal, and an early repayment charge above that can be several per cent of the amount repaid.',
      'Make sure you have an accessible emergency fund first. Money put into a mortgage is very hard to get back out, and needing it back at the wrong moment is expensive in a way this calculator cannot price.',
      'If you have any debt at a higher rate than your mortgage, such as a credit card, an overdraft or car finance, clear that before you do either of these.',
    ];

    if (wrapper === 'taxable' && band !== 'nonTaxpayer') {
      nextSteps.push(
        `If you are going to save, use a cash ISA first. Same money, same rate, no tax, and it leaves your Personal Savings Allowance free for interest elsewhere. The allowance is ${formatGbp(ISA_ALLOWANCE)} for ${TAX_YEAR_LABEL}.`,
      );
    }

    nextSteps.push(
      'Ask whether a pension contribution beats both. For a higher rate taxpayer the relief alone is worth more than most mortgage rates, though the money is locked away until at least age 55.',
      'If your lender offers an offset mortgage, it can give you the mortgage-rate return of an overpayment while keeping the money accessible. It is worth asking about.',
    );

    const caveats: string[] = [
      'This ignores early repayment charges entirely, because we cannot see your mortgage. That is the single most likely thing to change the answer.',
      'It ignores your emergency fund, your job security, your other debts and everything else about your circumstances. It is arithmetic, not advice, and the arithmetic is only one input into the decision.',
      'It assumes both rates hold for the whole period. Savings rates move constantly and your mortgage rate changes at the end of your fixed deal. If you are two years from a remortgage, the comparison beyond that point is speculation.',
      'Overpaying gives a guaranteed, risk-free, tax-free return equal to your mortgage rate. A savings return is neither guaranteed for the period nor necessarily tax free. Comparing them purely on the headline number understates the case for overpaying.',
      'Overpaying is not reversible. Most lenders will not hand the money back, and a payment holiday or further advance is at their discretion and may be refused.',
      'Money in savings is protected by the Financial Services Compensation Scheme up to a limit per person per banking licence. Check the current limit with the FSCS if you would be holding a large balance at one institution.',
      `Savings tax figures are ${TAX_YEAR_LABEL} (${TAX_YEAR_RANGE}), read from GOV.UK on ${TAX_VERIFIED_ON_HUMAN}.`,
    ];

    if (band === 'nonTaxpayer') {
      caveats.push(
        `You told us you do not pay Income Tax, so we have assumed no tax on the interest. That is right for most people on a low income, because the personal allowance and the starting rate for savings of up to ${formatGbp(STARTING_RATE_FOR_SAVINGS)} usually cover it. The starting rate is withdrawn pound for pound by other income above the personal allowance and is nil once other income reaches ${formatGbp(STARTING_RATE_INCOME_CEILING)}.`,
      );
    }

    return {
      tone: Math.abs(difference) < Math.max(50, monthlySpare) ? 'maybe' : 'yes',
      tag: overpayWins ? 'Overpaying wins on the numbers' : 'Saving wins on the numbers',
      headline: overpayWins
        ? `Overpaying leaves you ${formatGbp(Math.abs(difference))} better off after ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}`
        : `Saving leaves you ${formatGbp(Math.abs(difference))} better off after ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}`,
      amount: formatGbp(Math.abs(difference)),
      amountNote: `the gap between the two routes over ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}, before any early repayment charge`,
      figures,
      figuresHeading: 'The working',
      reasoning,
      nextSteps,
      caveats,
    };
  }

  return (
    <div className="tool-card">
      <div className="tool-yearstamp">{TAX_YEAR_LABEL} tax year · savings tax figures</div>
      <h2>Overpay the mortgage or put it in savings?</h2>
      <p className="tool-card-hint">
        Enter the same spare monthly amount for both routes and we will run
        each one forward and compare them. Nothing is sent to us.
      </p>

      <div className="tool-fields is-two">
        <Field label="Mortgage balance" htmlFor="ov-balance" help="What you owe now.">
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="ov-balance"
              type="text"
              inputMode="decimal"
              placeholder="180,000"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>
        </Field>

        <Field label="Mortgage rate" htmlFor="ov-mrate" help="The annual rate you pay now, as a percentage.">
          <input
            id="ov-mrate"
            type="text"
            inputMode="decimal"
            placeholder="4.5"
            value={mortgageRate}
            onChange={(e) => setMortgageRate(e.target.value)}
          />
        </Field>

        <Field label="Years left on the mortgage" htmlFor="ov-term" help="Remaining term, not the original one.">
          <input
            id="ov-term"
            type="text"
            inputMode="decimal"
            placeholder="20"
            value={termYears}
            onChange={(e) => setTermYears(e.target.value)}
          />
        </Field>

        <Field label="Spare money each month" htmlFor="ov-spare" help="The amount you are deciding what to do with.">
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="ov-spare"
              type="text"
              inputMode="decimal"
              placeholder="250"
              value={spare}
              onChange={(e) => setSpare(e.target.value)}
            />
          </div>
        </Field>

        <Field label="Savings rate (AER)" htmlFor="ov-srate" help="The annual equivalent rate the account pays.">
          <input
            id="ov-srate"
            type="text"
            inputMode="decimal"
            placeholder="4.2"
            value={savingsRate}
            onChange={(e) => setSavingsRate(e.target.value)}
          />
        </Field>

        <Field label="Where would the savings sit?" htmlFor="ov-wrapper" help="Interest inside an ISA is not taxed at all.">
          <select id="ov-wrapper" value={wrapper} onChange={(e) => setWrapper(e.target.value as 'isa' | 'taxable')}>
            <option value="taxable">An ordinary savings account</option>
            <option value="isa">A cash ISA</option>
          </select>
        </Field>

        <Field
          label="Your Income Tax band"
          htmlFor="ov-band"
          help="Decides your Personal Savings Allowance and the rate any interest above it is taxed at. Scottish taxpayers pay the rest-of-UK rates on savings interest."
        >
          <select id="ov-band" value={band} onChange={(e) => setBand(e.target.value as SavingsTaxBand)}>
            <option value="nonTaxpayer">{SAVINGS_BAND_LABEL.nonTaxpayer}</option>
            <option value="basic">{SAVINGS_BAND_LABEL.basic}</option>
            <option value="higher">{SAVINGS_BAND_LABEL.higher}</option>
            <option value="additional">{SAVINGS_BAND_LABEL.additional}</option>
          </select>
        </Field>

        <Field
          label="Interest already earned this tax year (optional)"
          htmlFor="ov-other"
          help="From other savings outside an ISA. It uses up your Personal Savings Allowance before this money does."
        >
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="ov-other"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={otherInterest}
              onChange={(e) => setOtherInterest(e.target.value)}
            />
          </div>
        </Field>

        <Field
          label="Compare over how many years?"
          htmlFor="ov-horizon"
          full
          help="A longer horizon usually favours overpaying, because the interest saved compounds for the rest of the term."
        >
          <select id="ov-horizon" value={horizon} onChange={(e) => setHorizon(e.target.value)}>
            {[1, 2, 3, 5, 10, 15, 20].map((y) => (
              <option key={y} value={String(y)}>
                {y} {y === 1 ? 'year' : 'years'}
              </option>
            ))}
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
          Compare the two
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setBalance('');
              setMortgageRate('');
              setTermYears('20');
              setSpare('');
              setSavingsRate('');
              setBand('basic');
              setWrapper('taxable');
              setOtherInterest('');
              setHorizon(String(DEFAULT_HORIZON_YEARS));
              setVerdict(null);
            }}
          >
            Start again
          </button>
        ) : null}
      </div>

      {verdict ? <ResultCard verdict={verdict} /> : null}

      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 18, lineHeight: 1.6 }}>
        Method: the mortgage runs on a standard monthly amortisation.
        Savings compound monthly from the AER you enter, with interest above
        your Personal Savings Allowance taxed at the end of each year.
        Personal Savings Allowance {formatGbp(1000)} at basic rate,{' '}
        {formatGbp(500)} at higher rate and nil at additional rate for{' '}
        {TAX_YEAR_LABEL}, from GOV.UK, checked {TAX_VERIFIED_ON_HUMAN}. Early
        repayment charges are not included because we cannot see them.
      </p>
    </div>
  );
}
