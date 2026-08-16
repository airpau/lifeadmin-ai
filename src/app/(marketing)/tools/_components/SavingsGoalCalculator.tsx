'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';
import {
  formatGbp,
  formatMonths,
  formatPct,
  futureValue,
  parseNumber,
  parsePositive,
  realTerms,
  requiredAer,
  requiredMonthlyContribution,
  requiredMonths,
} from '../_lib/finance';
import {
  ISA_ALLOWANCE,
  PERSONAL_SAVINGS_ALLOWANCE,
  SAVINGS_BAND_LABEL,
  SAVINGS_TAX_RATE,
  TAX_VERIFIED_ON_HUMAN,
  TAX_YEAR_LABEL,
  type SavingsTaxBand,
} from '../_data/uk-tax';

/**
 * Compound interest and savings goal calculator that solves for
 * whichever variable the user does not know.
 *
 * Four modes:
 *   pot    — what will I end up with?
 *   monthly— what do I need to put in each month?
 *   time   — how long will it take?
 *   rate   — what return would I need?
 *
 * Every answer is also shown in real terms, because a £20,000 goal in
 * ten years is not a £20,000 goal. Inflation is a user input with a
 * clearly-labelled 2% default (the Bank of England's target, not a
 * forecast) rather than a number we quietly assume.
 *
 * The tax note is deliberately light. Most people saving a few hundred
 * a month are inside the ISA allowance and the Personal Savings
 * Allowance, so a full tax simulation would add complexity for an
 * answer of "no tax". Instead we show what tax WOULD apply outside an
 * ISA once the allowance runs out, and leave the arithmetic simple.
 */

type Mode = 'pot' | 'monthly' | 'time' | 'rate';

const MODE_LABEL: Record<Mode, string> = {
  pot: 'What will I end up with?',
  monthly: 'What do I need to save each month?',
  time: 'How long will it take?',
  rate: 'What return would I need?',
};

export default function SavingsGoalCalculator() {
  const [mode, setMode] = useState<Mode>('pot');
  const [target, setTarget] = useState('');
  const [initial, setInitial] = useState('0');
  const [monthly, setMonthly] = useState('');
  const [rate, setRate] = useState('4');
  const [years, setYears] = useState('5');
  const [inflation, setInflation] = useState('2');
  const [band, setBand] = useState<SavingsTaxBand>('basic');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const t = parsePositive(target);
  const p0 = parseNumber(initial) ?? 0;
  const m = parseNumber(monthly);
  const r = parseNumber(rate);
  const y = parsePositive(years);

  const ready = (() => {
    if (mode === 'pot') return m !== null && r !== null && y !== null;
    if (mode === 'monthly') return t !== null && r !== null && y !== null;
    if (mode === 'time') return t !== null && m !== null && m > 0 && r !== null;
    return t !== null && m !== null && y !== null;
  })();

  function evaluate(): Verdict {
    const inflationPct = Math.max(0, parseNumber(inflation) ?? 0);
    const figures: NonNullable<Verdict['figures']> = [];
    const reasoning: string[] = [];
    const nextSteps: string[] = [];
    const caveats: string[] = [
      'This assumes a single constant rate for the whole period and contributions paid at the end of each month. Nothing in the real world behaves like that. Savings rates change, and an investment return is an average across good years and bad ones rather than the same number every year.',
      'It is an illustration, not a forecast and not advice. If the money is invested rather than saved, you can get back less than you put in, and the order in which good and bad years arrive matters as much as the average.',
      'It ignores charges. A platform or fund charge of even 1% a year takes a substantial bite out of a long-run figure like these.',
    ];

    let headlineAmount = '';
    let headlineNote = '';
    let headline = '';
    let tag = '';
    let tone: Verdict['tone'] = 'yes';

    if (mode === 'pot') {
      const months = Math.round((y ?? 0) * 12);
      const contribution = m ?? 0;
      const aer = r ?? 0;
      const pot = futureValue(p0, contribution, aer, months);
      const paidIn = p0 + contribution * months;
      const growth = pot - paidIn;
      const real = realTerms(pot, inflationPct, y ?? 0);

      figures.push(
        { label: 'Starting amount', value: formatGbp(p0) },
        { label: 'Paid in each month', value: formatGbp(contribution, 2) },
        { label: 'Over', value: formatMonths(months) },
        { label: 'At an assumed', value: `${formatPct(aer, 2)} a year` },
        { label: 'Total you pay in', value: formatGbp(paidIn), note: 'Your own money' },
        { label: 'Growth on top', value: formatGbp(growth), note: 'Interest or return, compounded monthly' },
        { label: 'Final pot', value: formatGbp(pot), emphasis: true },
        {
          label: `Worth in today's money at ${formatPct(inflationPct, 1)} inflation`,
          note: `${formatGbp(pot - real)} of the headline figure is eaten by rising prices`,
          value: formatGbp(real),
          emphasis: true,
        },
      );

      headlineAmount = formatGbp(pot);
      headlineNote = `after ${formatMonths(months)}, of which ${formatGbp(growth)} is growth`;
      headline = 'Here is what the pot gets to';
      tag = 'Projected pot';
      reasoning.push(
        `You put in ${formatGbp(paidIn)} and the pot reaches ${formatGbp(pot)}, so growth accounts for ${formatGbp(growth)}, which is ${formatPct(paidIn > 0 ? (growth / paidIn) * 100 : 0)} on top of what you contributed.`,
        `In today's money that ${formatGbp(pot)} is worth about ${formatGbp(real)} if prices rise ${formatPct(inflationPct, 1)} a year. That is the number to plan against, because the thing you are saving for will also have got more expensive.`,
      );
    }

    if (mode === 'monthly') {
      const months = Math.round((y ?? 0) * 12);
      const aer = r ?? 0;
      const needed = requiredMonthlyContribution(t ?? 0, p0, aer, months);
      const paidIn = p0 + Math.max(0, needed) * months;
      const growth = (t ?? 0) - paidIn;
      const realTarget = realTerms(t ?? 0, inflationPct, y ?? 0);

      if (needed <= 0) {
        tone = 'yes';
        headline = 'Your starting amount already gets you there';
        tag = 'No monthly saving needed';
        headlineAmount = formatGbp(0);
        headlineNote = `your ${formatGbp(p0)} reaches ${formatGbp(t ?? 0)} on its own at ${formatPct(aer, 2)}`;
        reasoning.push(
          `At ${formatPct(aer, 2)} your existing ${formatGbp(p0)} grows to more than ${formatGbp(t ?? 0)} within ${formatMonths(months)} without any further contributions.`,
        );
      } else {
        headlineAmount = formatGbp(needed, 2);
        headlineNote = `a month for ${formatMonths(months)} to reach ${formatGbp(t ?? 0)}`;
        headline = 'This is what you need to put away each month';
        tag = 'Monthly amount needed';
        reasoning.push(
          `To reach ${formatGbp(t ?? 0)} in ${formatMonths(months)} starting from ${formatGbp(p0)}, you need ${formatGbp(needed, 2)} a month at ${formatPct(aer, 2)}.`,
          `You would pay in ${formatGbp(paidIn)} of your own money and growth would supply the remaining ${formatGbp(Math.max(0, growth))}.`,
        );
      }

      figures.push(
        { label: 'Target', value: formatGbp(t ?? 0) },
        { label: 'Starting amount', value: formatGbp(p0) },
        { label: 'Time available', value: formatMonths(months) },
        { label: 'At an assumed', value: `${formatPct(aer, 2)} a year` },
        { label: 'Monthly amount needed', value: formatGbp(Math.max(0, needed), 2), emphasis: true },
        {
          label: `Your target in today's money`,
          note: `${formatGbp(t ?? 0)} in ${formatMonths(months)} buys what ${formatGbp(realTarget)} buys now, at ${formatPct(inflationPct, 1)} inflation`,
          value: formatGbp(realTarget),
          emphasis: true,
        },
      );

      reasoning.push(
        `If the thing you are saving for also rises with inflation, ${formatGbp(t ?? 0)} then is worth about ${formatGbp(realTarget)} now. If your target was set in today's prices, consider raising it.`,
      );
    }

    if (mode === 'time') {
      const aer = r ?? 0;
      const contribution = m ?? 0;
      const months = requiredMonths(t ?? 0, p0, contribution, aer);

      if (months === null) {
        tone = 'no';
        headline = 'You do not get there on these numbers';
        tag = 'Target not reachable';
        headlineAmount = '';
        reasoning.push(
          'With this combination of starting amount, monthly contribution and return, the target is either never reached or takes longer than a hundred years. Raise the monthly amount, lower the target, or check the rate you entered.',
        );
        figures.push(
          { label: 'Target', value: formatGbp(t ?? 0) },
          { label: 'Starting amount', value: formatGbp(p0) },
          { label: 'Paid in each month', value: formatGbp(contribution, 2) },
          { label: 'At an assumed', value: `${formatPct(aer, 2)} a year` },
        );
      } else {
        const yrs = months / 12;
        const paidIn = p0 + contribution * months;
        const realValue = realTerms(t ?? 0, inflationPct, yrs);
        headlineAmount = formatMonths(months);
        headlineNote = `to reach ${formatGbp(t ?? 0)} saving ${formatGbp(contribution, 2)} a month`;
        headline = 'Here is how long it takes';
        tag = 'Time to target';

        figures.push(
          { label: 'Target', value: formatGbp(t ?? 0) },
          { label: 'Starting amount', value: formatGbp(p0) },
          { label: 'Paid in each month', value: formatGbp(contribution, 2) },
          { label: 'At an assumed', value: `${formatPct(aer, 2)} a year` },
          { label: 'Time needed', value: formatMonths(months), emphasis: true },
          { label: 'Of the target, your own money', value: formatGbp(Math.min(paidIn, t ?? 0)) },
          { label: 'Of the target, growth', value: formatGbp(Math.max(0, (t ?? 0) - paidIn)) },
          {
            label: `What ${formatGbp(t ?? 0)} will be worth by then`,
            note: `In today's money, at ${formatPct(inflationPct, 1)} inflation`,
            value: formatGbp(realValue),
            emphasis: true,
          },
        );

        reasoning.push(
          `Saving ${formatGbp(contribution, 2)} a month from ${formatGbp(p0)} at ${formatPct(aer, 2)}, you reach ${formatGbp(t ?? 0)} in ${formatMonths(months)}.`,
          `Of that, ${formatGbp(Math.min(paidIn, t ?? 0))} is money you put in and ${formatGbp(Math.max(0, (t ?? 0) - paidIn))} is growth.`,
          `By the time you get there, ${formatGbp(t ?? 0)} will buy roughly what ${formatGbp(realValue)} buys today at ${formatPct(inflationPct, 1)} inflation.`,
        );
      }
    }

    if (mode === 'rate') {
      const months = Math.round((y ?? 0) * 12);
      const contribution = m ?? 0;
      const needed = requiredAer(t ?? 0, p0, contribution, months);
      const withoutGrowth = p0 + contribution * months;

      figures.push(
        { label: 'Target', value: formatGbp(t ?? 0) },
        { label: 'Starting amount', value: formatGbp(p0) },
        { label: 'Paid in each month', value: formatGbp(contribution, 2) },
        { label: 'Time available', value: formatMonths(months) },
        { label: 'Total you would pay in', value: formatGbp(withoutGrowth), note: 'Before any growth at all' },
      );

      if (needed === null) {
        tone = 'no';
        headline = 'No sensible return gets you there';
        tag = 'Target out of reach';
        reasoning.push(
          `Even at 60% a year, ${formatGbp(p0)} plus ${formatGbp(contribution, 2)} a month does not reach ${formatGbp(t ?? 0)} in ${formatMonths(months)}. The monthly amount or the timescale has to change.`,
        );
      } else if (needed === 0) {
        tone = 'yes';
        headline = 'You get there without any growth at all';
        tag = 'No return needed';
        headlineAmount = formatPct(0, 1);
        reasoning.push(
          `Your contributions alone come to ${formatGbp(withoutGrowth)}, which already exceeds the ${formatGbp(t ?? 0)} target. Any interest is a bonus, so you can prioritise safety and access over rate.`,
        );
        figures.push({ label: 'Return needed', value: formatPct(0, 1), emphasis: true });
      } else {
        headlineAmount = formatPct(needed, 2);
        headlineNote = `a year, to turn ${formatGbp(withoutGrowth)} of contributions into ${formatGbp(t ?? 0)}`;
        headline = 'This is the return you would need';
        tag = 'Required return';
        figures.push({ label: 'Return needed each year', value: formatPct(needed, 2), emphasis: true });
        reasoning.push(
          `You would need ${formatPct(needed, 2)} a year to get from ${formatGbp(p0)} plus ${formatGbp(contribution, 2)} a month to ${formatGbp(t ?? 0)} in ${formatMonths(months)}.`,
        );
        if (needed > 7) {
          tone = 'caution';
          reasoning.push(
            'That is well above what a cash savings account pays. A return at that level means taking investment risk, which means accepting that you can end up with less than you put in. Treat a required return above about 7% as a signal that the goal, the timescale or the monthly amount needs to move rather than that you need a better account.',
          );
        } else if (needed > 5) {
          tone = 'maybe';
          reasoning.push(
            'That is above typical cash savings rates, so it implies investing rather than saving, with the risk that comes with it.',
          );
        }
      }
    }

    // --- Tax note, common to every mode -----------------------------------
    const psa = PERSONAL_SAVINGS_ALLOWANCE[band];
    if (Number.isFinite(psa) && psa > 0) {
      const rateUsed = r ?? 0;
      const balanceAtAllowance = rateUsed > 0 ? (psa / (rateUsed / 100)) : Infinity;
      caveats.push(
        `Tax: as a ${SAVINGS_BAND_LABEL[band].toLowerCase()} taxpayer your Personal Savings Allowance is ${formatGbp(psa)} a year, so at ${formatPct(rateUsed, 2)} you can hold roughly ${Number.isFinite(balanceAtAllowance) ? formatGbp(balanceAtAllowance) : 'any amount'} outside an ISA before interest becomes taxable at ${formatPct(SAVINGS_TAX_RATE[band] * 100, 0)}. Inside an ISA there is no tax at all and the allowance is ${formatGbp(ISA_ALLOWANCE)} for ${TAX_YEAR_LABEL}. Figures read from GOV.UK on ${TAX_VERIFIED_ON_HUMAN}.`,
      );
    } else if (band === 'additional') {
      caveats.push(
        `Tax: an additional rate taxpayer has no Personal Savings Allowance, so every pound of interest outside an ISA is taxed at ${formatPct(SAVINGS_TAX_RATE.additional * 100, 0)}. Use the ${formatGbp(ISA_ALLOWANCE)} ISA allowance first. Figures read from GOV.UK on ${TAX_VERIFIED_ON_HUMAN}.`,
      );
    }

    caveats.push(
      'The projection is shown before tax. If the money sits outside an ISA and your interest exceeds the allowance above, your real return is lower than the rate you entered.',
    );

    nextSteps.push(
      `Use your ISA allowance before an ordinary account. Same money, same rate, no tax, and it keeps your Personal Savings Allowance free. The allowance is ${formatGbp(ISA_ALLOWANCE)} across all ISA types for ${TAX_YEAR_LABEL}.`,
      'Set the contribution up as a standing order for the day after payday. Saving what is left at the end of the month reliably produces a smaller number than saving first.',
      'Re-run this once a year. Rates move, your income moves, and a plan set once and never revisited quietly stops matching reality.',
      'If the goal is more than five years away, ask whether cash is the right home for it. If it is less than five years away, ask whether investing is.',
    );

    return {
      tone,
      tag,
      headline,
      amount: headlineAmount || undefined,
      amountNote: headlineNote || undefined,
      figures,
      figuresHeading: 'The working',
      reasoning,
      nextSteps,
      caveats,
    };
  }

  const showTarget = mode !== 'pot';
  const showMonthly = mode !== 'monthly';
  const showRate = mode !== 'rate';
  const showYears = mode !== 'time';

  return (
    <div className="tool-card">
      <h2>Work out the bit you do not know</h2>
      <p className="tool-card-hint">
        Choose what you are solving for and fill in the rest. Everything is
        worked out in your browser and nothing is sent to us.
      </p>

      <div className="tool-fields is-two">
        <Field
          label="What do you want to work out?"
          htmlFor="sg-mode"
          full
          help="The box for whatever you are solving for disappears, because that is the answer."
        >
          <select id="sg-mode" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {(Object.keys(MODE_LABEL) as Mode[]).map((k) => (
              <option key={k} value={k}>
                {MODE_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>

        {showTarget ? (
          <Field label="Target amount" htmlFor="sg-target" help="What you are trying to reach.">
            <div className="tool-prefixed">
              <span>£</span>
              <input
                id="sg-target"
                type="text"
                inputMode="decimal"
                placeholder="20,000"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
          </Field>
        ) : null}

        <Field label="Amount you already have" htmlFor="sg-initial" help="Enter 0 if you are starting from nothing.">
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="sg-initial"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={initial}
              onChange={(e) => setInitial(e.target.value)}
            />
          </div>
        </Field>

        {showMonthly ? (
          <Field label="Amount saved each month" htmlFor="sg-monthly" help="Paid in at the end of each month.">
            <div className="tool-prefixed">
              <span>£</span>
              <input
                id="sg-monthly"
                type="text"
                inputMode="decimal"
                placeholder="250"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
              />
            </div>
          </Field>
        ) : null}

        {showRate ? (
          <Field
            label="Annual return"
            htmlFor="sg-rate"
            help="The AER on a savings account, or an assumed average for an investment. Assumed constant."
          >
            <input
              id="sg-rate"
              type="text"
              inputMode="decimal"
              placeholder="4"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </Field>
        ) : null}

        {showYears ? (
          <Field label="Number of years" htmlFor="sg-years" help="How long you are saving for.">
            <input
              id="sg-years"
              type="text"
              inputMode="decimal"
              placeholder="5"
              value={years}
              onChange={(e) => setYears(e.target.value)}
            />
          </Field>
        ) : null}

        <Field
          label="Assumed inflation"
          htmlFor="sg-inflation"
          help="For the real-terms view. The default of 2% is the Bank of England's target, not a forecast."
        >
          <input
            id="sg-inflation"
            type="text"
            inputMode="decimal"
            placeholder="2"
            value={inflation}
            onChange={(e) => setInflation(e.target.value)}
          />
        </Field>

        <Field
          label="Your Income Tax band"
          htmlFor="sg-band"
          help="Only used for the note on when savings interest becomes taxable. Scottish taxpayers pay the rest-of-UK rates on savings interest."
        >
          <select id="sg-band" value={band} onChange={(e) => setBand(e.target.value as SavingsTaxBand)}>
            <option value="nonTaxpayer">{SAVINGS_BAND_LABEL.nonTaxpayer}</option>
            <option value="basic">{SAVINGS_BAND_LABEL.basic}</option>
            <option value="higher">{SAVINGS_BAND_LABEL.higher}</option>
            <option value="additional">{SAVINGS_BAND_LABEL.additional}</option>
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
          Work it out
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setTarget('');
              setInitial('0');
              setMonthly('');
              setRate('4');
              setYears('5');
              setInflation('2');
              setVerdict(null);
            }}
          >
            Start again
          </button>
        ) : null}
      </div>

      {verdict ? <ResultCard verdict={verdict} /> : null}

      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 18, lineHeight: 1.6 }}>
        Method: monthly compounding, with the annual rate you enter treated
        as an AER and converted to its exact monthly equivalent.
        Contributions are added at the end of each month. Real-terms figures
        discount by the inflation rate you set. ISA and Personal Savings
        Allowance figures are {TAX_YEAR_LABEL}, from GOV.UK, checked{' '}
        {TAX_VERIFIED_ON_HUMAN}.
      </p>
    </div>
  );
}
