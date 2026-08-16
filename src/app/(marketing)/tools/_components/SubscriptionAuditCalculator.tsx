'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';
import {
  FREQUENCY_LABEL,
  formatGbp,
  formatPct,
  futureValue,
  parseNumber,
  parsePositive,
  toAnnual,
  type Frequency,
} from '../_lib/finance';
import { ISA_ALLOWANCE, TAX_YEAR_LABEL } from '../_data/uk-tax';

/**
 * Subscription audit.
 *
 * The interesting output is not the total. Everyone can add up their
 * own direct debits, in principle. The interesting outputs are:
 *
 *   - cost per actual use, which is where a £12.99 subscription used
 *     twice a year turns into £78 a go, and
 *   - what the same money would have been worth if it had been saved,
 *     which is the number that makes people cancel things.
 *
 * The savings projection uses a rate the user sets, defaulting to a
 * plainly-labelled 4%. It is described as an illustration at a constant
 * rate, never as a forecast, and it is shown after nothing is deducted
 * for tax because the amounts involved sit inside an ISA for almost
 * everyone. That assumption is stated.
 */

type Row = {
  id: number;
  name: string;
  amount: string;
  frequency: Frequency;
  uses: string;
};

let nextId = 1;
function blankRow(): Row {
  nextId += 1;
  return { id: nextId, name: '', amount: '', frequency: 'monthly', uses: '' };
}

const DEFAULT_RATE = '4';
const DEFAULT_YEARS = '5';

export default function SubscriptionAuditCalculator() {
  const [rows, setRows] = useState<Row[]>(() => [blankRow(), blankRow(), blankRow()]);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [years, setYears] = useState(DEFAULT_YEARS);
  const [netMonthly, setNetMonthly] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const filled = rows.filter((r) => parsePositive(r.amount) !== null);
  const ready = filled.length > 0;

  function update(id: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function evaluate(): Verdict {
    const priced = filled.map((r) => {
      const amount = parsePositive(r.amount) ?? 0;
      const annual = toAnnual(amount, r.frequency);
      const usesPerMonth = parseNumber(r.uses);
      const usesPerYear = usesPerMonth !== null && usesPerMonth > 0 ? usesPerMonth * 12 : 0;
      return {
        name: r.name.trim() || 'Unnamed subscription',
        amount,
        frequency: r.frequency,
        annual,
        usesPerYear,
        costPerUse: usesPerYear > 0 ? annual / usesPerYear : null,
        anyUsesEntered: usesPerMonth !== null,
      };
    });

    const annualTotal = priced.reduce((s, r) => s + r.annual, 0);
    const monthlyTotal = annualTotal / 12;

    const byCost = [...priced].sort((a, b) => b.annual - a.annual);
    const withCostPerUse = priced.filter((r) => r.costPerUse !== null);
    const worstValue = [...withCostPerUse].sort((a, b) => (b.costPerUse ?? 0) - (a.costPerUse ?? 0));
    const unused = priced.filter((r) => r.anyUsesEntered && r.usesPerYear === 0);

    const figures: NonNullable<Verdict['figures']> = byCost.map((r) => ({
      label: r.name,
      note: `${formatGbp(r.amount, 2)} ${FREQUENCY_LABEL[r.frequency]}${
        r.costPerUse !== null
          ? ` · ${formatGbp(r.costPerUse, 2)} per use`
          : r.anyUsesEntered
            ? ' · never used'
            : ''
      }`,
      value: `${formatGbp(r.annual, 2)} a year`,
    }));

    figures.push(
      { label: 'Total a month', value: formatGbp(monthlyTotal, 2), emphasis: true },
      { label: 'Total a year', value: formatGbp(annualTotal, 2), emphasis: true },
    );

    const projRate = parseNumber(rate) ?? 4;
    const projYears = Math.max(1, Math.round(parsePositive(years) ?? 5));
    const pot = futureValue(0, monthlyTotal, projRate, projYears * 12);
    const contributed = monthlyTotal * projYears * 12;

    figures.push({
      label: `Saved instead for ${projYears} ${projYears === 1 ? 'year' : 'years'}`,
      note: `${formatGbp(contributed)} paid in, plus ${formatGbp(pot - contributed)} of growth at ${formatPct(projRate, 1)} a year`,
      value: formatGbp(pot),
      emphasis: true,
    });

    const reasoning: string[] = [
      `You listed ${priced.length} recurring ${priced.length === 1 ? 'payment' : 'payments'} costing ${formatGbp(monthlyTotal, 2)} a month, which is ${formatGbp(annualTotal, 2)} a year.`,
      `Your largest single item is ${byCost[0].name} at ${formatGbp(byCost[0].annual, 2)} a year.`,
    ];

    const net = parseNumber(netMonthly);
    if (net !== null && net > 0) {
      const share = (monthlyTotal / net) * 100;
      figures.push({
        label: 'Share of your take-home pay',
        value: formatPct(share),
      });
      reasoning.push(
        `That is ${formatPct(share)} of your monthly take-home pay, gone before you decide anything.`,
      );
    }

    if (worstValue.length > 0 && worstValue[0].costPerUse !== null) {
      const w = worstValue[0];
      reasoning.push(
        `On cost per use, the worst value is ${w.name} at ${formatGbp(w.costPerUse ?? 0, 2)} every time you use it. Monthly price is the wrong way to judge a subscription. What it costs you each time you actually get something out of it is the right way.`,
      );
    }

    if (unused.length > 0) {
      reasoning.push(
        `${unused.length === 1 ? 'One subscription' : `${unused.length} subscriptions`} you listed you never use, costing ${formatGbp(unused.reduce((s, r) => s + r.annual, 0), 2)} a year between them. That is the easiest money you will save this year.`,
      );
    }

    reasoning.push(
      `Redirected into savings, ${formatGbp(monthlyTotal, 2)} a month becomes ${formatGbp(pot)} over ${projYears} ${projYears === 1 ? 'year' : 'years'} at ${formatPct(projRate, 1)}. That is an illustration at a constant rate, not a forecast, and real rates move.`,
    );

    const nextSteps: string[] = [];

    if (unused.length > 0) {
      nextSteps.push(
        `Cancel the ${unused.length === 1 ? 'one you never use' : 'ones you never use'} first. Do it directly with the provider, in writing, and keep the confirmation.`,
      );
    }

    nextSteps.push(
      'Check every one against your bank statement rather than from memory. The ones people forget are almost always the ones still charging.',
      'For anything on an annual plan, note the renewal date now. Annual subscriptions renew silently and a refund after the event is much harder than a cancellation before it.',
      'Where you signed up online in the last 14 days, you may still have a statutory right to cancel under the Consumer Contracts Regulations 2013, even if the trader’s own terms say otherwise.',
      'If a provider makes cancelling harder than signing up, say in writing that you are cancelling, keep a dated copy, and cancel any continuous payment authority with your card provider as a backstop.',
      `If you free up ${formatGbp(monthlyTotal, 2)} a month, move it somewhere on the same day. Money that stays in the current account gets spent. Interest inside an ISA is tax free and the allowance is ${formatGbp(ISA_ALLOWANCE)} for ${TAX_YEAR_LABEL}.`,
    );

    const caveats: string[] = [
      'This works from what you typed in. If you are typing from memory rather than from a statement, the total is almost certainly too low, because the forgotten ones are the point.',
      'Cost per use is a blunt measure. Some things are worth keeping at a terrible cost per use, and some cheap things you use constantly are still not worth the money. It tells you where to look, not what to cancel.',
      'The savings projection assumes a constant rate, contributions at the end of each month, and no tax. It is an illustration of the scale of the money, not a prediction. Real savings rates change and investment returns are not guaranteed.',
      'We have assumed the savings would sit inside an ISA, so no tax is deducted. Outside an ISA, interest above your Personal Savings Allowance would be taxed and the figure would be lower.',
      'Cancelling mid-contract is not always free. A minimum term, for example on a gym membership or a mobile handset plan, can survive your wish to stop paying.',
    ];

    return {
      tone: annualTotal >= 1000 ? 'caution' : annualTotal >= 400 ? 'maybe' : 'yes',
      tag: 'Your recurring spend',
      headline:
        annualTotal >= 1000
          ? 'This is a large amount of money leaving on autopilot'
          : 'Here is what your subscriptions actually cost',
      amount: formatGbp(annualTotal),
      amountNote: `a year, or ${formatGbp(monthlyTotal, 2)} a month across ${priced.length} ${priced.length === 1 ? 'payment' : 'payments'}`,
      figures,
      figuresHeading: 'Every line, largest first',
      reasoning,
      nextSteps,
      caveats,
    };
  }

  return (
    <div className="tool-card">
      <h2>List what leaves your account every month</h2>
      <p className="tool-card-hint">
        Work from a bank statement rather than memory. The subscriptions
        people forget are the ones costing them the most. Add a rough number
        of uses a month and we will work out what each one costs you per
        actual use. Nothing is sent to us.
      </p>

      <div className="tool-rows">
        {rows.map((row, index) => (
          <div key={row.id} className="tool-row">
            <Field label={index === 0 ? 'What is it?' : ''} htmlFor={`sub-name-${row.id}`}>
              <input
                id={`sub-name-${row.id}`}
                type="text"
                placeholder="Streaming service"
                aria-label="Subscription name"
                value={row.name}
                onChange={(e) => update(row.id, { name: e.target.value })}
              />
            </Field>
            <Field label={index === 0 ? 'How much?' : ''} htmlFor={`sub-amt-${row.id}`}>
              <div className="tool-prefixed">
                <span>£</span>
                <input
                  id={`sub-amt-${row.id}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="10.99"
                  aria-label="Amount"
                  value={row.amount}
                  onChange={(e) => update(row.id, { amount: e.target.value })}
                />
              </div>
            </Field>
            <Field label={index === 0 ? 'How often?' : ''} htmlFor={`sub-freq-${row.id}`}>
              <select
                id={`sub-freq-${row.id}`}
                aria-label="Frequency"
                value={row.frequency}
                onChange={(e) => update(row.id, { frequency: e.target.value as Frequency })}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </Field>
            <Field
              label={index === 0 ? 'Uses a month' : ''}
              htmlFor={`sub-uses-${row.id}`}
              help={index === 0 ? 'Optional. Enter 0 if you never use it.' : undefined}
            >
              <input
                id={`sub-uses-${row.id}`}
                type="text"
                inputMode="decimal"
                placeholder="8"
                aria-label="Uses a month"
                value={row.uses}
                onChange={(e) => update(row.id, { uses: e.target.value })}
              />
            </Field>
            {rows.length > 1 ? (
              <button
                type="button"
                className="tool-row-remove"
                onClick={() => setRows((rs) => rs.filter((r) => r.id !== row.id))}
              >
                Remove this line
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <button type="button" className="tool-add-row" onClick={() => setRows((rs) => [...rs, blankRow()])}>
        + Add another subscription
      </button>

      <div className="tool-fields is-two" style={{ marginTop: 22 }}>
        <Field
          label="If you saved it instead, over how many years?"
          htmlFor="sub-years"
          help="For the comparison figure. An illustration, not a forecast."
        >
          <input
            id="sub-years"
            type="text"
            inputMode="decimal"
            placeholder="5"
            value={years}
            onChange={(e) => setYears(e.target.value)}
          />
        </Field>

        <Field label="At what annual return?" htmlFor="sub-rate" help="Assumed constant. Real rates move.">
          <input
            id="sub-rate"
            type="text"
            inputMode="decimal"
            placeholder="4"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>

        <Field
          label="Your monthly take-home pay (optional)"
          htmlFor="sub-net"
          full
          help="So we can show what share of your actual pay this is."
        >
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="sub-net"
              type="text"
              inputMode="decimal"
              placeholder="2,400"
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
          Add it all up
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setRows([blankRow(), blankRow(), blankRow()]);
              setRate(DEFAULT_RATE);
              setYears(DEFAULT_YEARS);
              setNetMonthly('');
              setVerdict(null);
            }}
          >
            Start again
          </button>
        ) : null}
      </div>

      {verdict ? <ResultCard verdict={verdict} /> : null}
    </div>
  );
}
