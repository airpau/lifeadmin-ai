'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';
import {
  FREQUENCY_LABEL,
  formatGbp,
  formatPct,
  parsePositive,
  toAnnual,
  type Frequency,
} from '../_lib/finance';

/**
 * Adds up a year of price rises across the household bills, then tells
 * the reader which of those rises they can actually do something about.
 *
 * The division of labour matters. This tool QUANTIFIES. The consumer
 * rights checkers elsewhere in /tools ADJUDICATE. So the rights section
 * here is short and links out rather than trying to re-run the Ofcom
 * material detriment test in a second place, where it would drift out
 * of step with the checker that owns it.
 *
 * The honest part is that most of these rises carry no right to exit at
 * all. Energy inside the cap is lawful. A council tax rise is set by
 * the council and cannot be appealed. Water has no switching. Saying so
 * is more useful than implying every increase is a dispute.
 */

type CategoryId = 'energy' | 'broadband' | 'mobile' | 'insurance' | 'councilTax' | 'water' | 'other';

type Category = {
  id: CategoryId;
  label: string;
  defaultFrequency: Frequency;
  /** One line on what, if anything, you can do about a rise. */
  right: string;
  /** Where to go next, when there is somewhere to go. */
  link?: { href: string; label: string };
};

const CATEGORIES: ReadonlyArray<Category> = [
  {
    id: 'energy',
    label: 'Energy (gas and electricity)',
    defaultFrequency: 'monthly',
    right:
      'A rise on a standard variable tariff inside the Ofgem cap is lawful, and there is no exit fee on a default tariff, so you can leave whenever you like. What is worth checking is whether your unit rate and standing charge match the cap for your region, and whether any catch-up bill reaches back more than 12 months, which the back-billing rule does not allow.',
    link: { href: '/tools/energy-bill-overcharge-checker', label: 'Energy bill overcharge checker' },
  },
  {
    id: 'broadband',
    label: 'Broadband',
    defaultFrequency: 'monthly',
    right:
      'If the rise landed during a fixed term and the exact amount was not set out in pounds and pence before you signed, the Ofcom General Conditions require at least one month’s notice and give you a right to leave without an exit charge.',
    link: { href: '/tools/broadband-price-rise-checker', label: 'Broadband and mobile price rise checker' },
  },
  {
    id: 'mobile',
    label: 'Mobile phone',
    defaultFrequency: 'monthly',
    right:
      'The same Ofcom rules apply as to broadband. A mid-contract rise that was not stated in pounds and pence up front normally comes with a penalty-free right to exit, though a handset plan can complicate what you still owe.',
    link: { href: '/tools/broadband-price-rise-checker', label: 'Broadband and mobile price rise checker' },
  },
  {
    id: 'insurance',
    label: 'Insurance (home, motor, other)',
    defaultFrequency: 'annually',
    right:
      'There is no right to exit mid-term without a cancellation fee, but a renewal is a new contract that you are free to refuse. FCA rules require the insurer to show last year’s premium next to this year’s and ban it from quoting a renewing customer more than an equivalent new customer would pay. Get a new quote from the same insurer and ask it to explain the gap.',
  },
  {
    id: 'councilTax',
    label: 'Council tax',
    defaultFrequency: 'monthly',
    right:
      'The annual rise is set by your council and there is no appeal against the level of it. What you can challenge is the band your property sits in, and separately any discount, exemption or reduction that has been wrongly refused.',
    link: { href: '/tools/council-tax-band-challenge-checker', label: 'Council tax band challenge checker' },
  },
  {
    id: 'water',
    label: 'Water',
    defaultFrequency: 'monthly',
    right:
      'Water is a regional monopoly, so there is no switching and no right to exit. The two things that do change the bill are a water meter, which usually helps a household with fewer bedrooms than people, and your supplier’s social tariff if your income qualifies.',
  },
  {
    id: 'other',
    label: 'Something else',
    defaultFrequency: 'monthly',
    right:
      'Whether you can challenge this depends entirely on the contract. Start by asking the provider, in writing, to point to the term it relies on for the increase.',
  },
];

type RowState = { old: string; next: string; frequency: Frequency };

function initialRows(): Record<CategoryId, RowState> {
  const out = {} as Record<CategoryId, RowState>;
  for (const c of CATEGORIES) out[c.id] = { old: '', next: '', frequency: c.defaultFrequency };
  return out;
}

type Computed = {
  category: Category;
  /** As typed, at the frequency the user was billed. */
  oldAmount: number;
  newAmount: number;
  oldAnnual: number;
  newAnnual: number;
  increase: number;
  pct: number;
  frequency: Frequency;
};

export default function BillIncreaseCalculator() {
  const [rows, setRows] = useState<Record<CategoryId, RowState>>(initialRows);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [risen, setRisen] = useState<Category[]>([]);

  function update(id: CategoryId, patch: Partial<RowState>) {
    setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  }

  const anyComplete = CATEGORIES.some(
    (c) => parsePositive(rows[c.id].old) !== null && parsePositive(rows[c.id].next) !== null,
  );

  function evaluate(): Verdict {
    const computed: Computed[] = [];
    for (const c of CATEGORIES) {
      const oldAmount = parsePositive(rows[c.id].old);
      const newAmount = parsePositive(rows[c.id].next);
      if (oldAmount === null || newAmount === null) continue;
      const freq = rows[c.id].frequency;
      const oldAnnual = toAnnual(oldAmount, freq);
      const newAnnual = toAnnual(newAmount, freq);
      computed.push({
        category: c,
        oldAmount,
        newAmount,
        oldAnnual,
        newAnnual,
        increase: newAnnual - oldAnnual,
        pct: ((newAnnual - oldAnnual) / oldAnnual) * 100,
        frequency: freq,
      });
    }

    const totalIncrease = computed.reduce((s, r) => s + r.increase, 0);
    const totalOld = computed.reduce((s, r) => s + r.oldAnnual, 0);
    const totalNew = computed.reduce((s, r) => s + r.newAnnual, 0);
    const overallPct = totalOld > 0 ? ((totalNew - totalOld) / totalOld) * 100 : 0;

    const increases = [...computed].filter((r) => r.increase > 0).sort((a, b) => b.increase - a.increase);
    const falls = computed.filter((r) => r.increase < 0);
    setRisen(increases.map((r) => r.category));

    const figures: NonNullable<Verdict['figures']> = computed
      .slice()
      .sort((a, b) => b.increase - a.increase)
      .map((r) => ({
        label: r.category.label,
        note: `${formatGbp(r.oldAmount, 2)} to ${formatGbp(r.newAmount, 2)} ${FREQUENCY_LABEL[r.frequency]}, a change of ${formatPct(r.pct)}`,
        value: `${r.increase >= 0 ? '+' : '−'}${formatGbp(Math.abs(r.increase))} a year`,
      }));

    figures.push(
      { label: 'What these bills cost you before', value: `${formatGbp(totalOld)} a year` },
      { label: 'What they cost you now', value: `${formatGbp(totalNew)} a year` },
      {
        label: 'Combined change',
        note: `${formatPct(overallPct)} across everything you entered, or ${formatGbp(totalIncrease / 12, 2)} a month`,
        value: `${totalIncrease >= 0 ? '+' : '−'}${formatGbp(Math.abs(totalIncrease))} a year`,
        emphasis: true,
      },
    );

    const reasoning: string[] = [
      totalIncrease > 0
        ? `Across the bills you entered, you are paying ${formatGbp(totalIncrease)} a year more than you were. That is ${formatGbp(totalIncrease / 12, 2)} a month, and it has to come out of pay that probably did not rise by the same amount.`
        : `Across the bills you entered you are paying ${formatGbp(Math.abs(totalIncrease))} a year less than you were.`,
    ];

    if (increases.length > 0) {
      reasoning.push(
        `The biggest single rise is ${increases[0].category.label.toLowerCase()}, up ${formatGbp(increases[0].increase)} a year, which is ${formatPct(increases[0].pct)}.`,
      );
    }
    if (falls.length > 0) {
      reasoning.push(
        `${falls.length === 1 ? 'One bill' : `${falls.length} bills`} went down, offsetting ${formatGbp(Math.abs(falls.reduce((s, r) => s + r.increase, 0)))} a year of the total.`,
      );
    }

    reasoning.push(
      'Rises get treated as inevitable because they arrive one at a time, each too small to be worth an argument. Added up they rarely are. The list below shows which of these you can actually push back on, and which you cannot.',
    );

    const nextSteps: string[] = [
      'Deal with them one at a time, largest first. The biggest number is almost always where the effort belongs.',
      'Put every challenge in writing, by email or through the provider’s complaints form, and keep the date. A phone call you cannot evidence is worth very little if it reaches an ombudsman.',
      'For anything with a renewal date, diarise it six weeks ahead. Almost every one of these gets more expensive by default and cheaper only if you intervene.',
    ];

    const caveats: string[] = [
      'This adds up what you entered. It does not check whether any particular rise was lawful, because that turns on your contract, when you signed it and what you were told at the time. The linked checkers do that job properly.',
      'A rise is not the same as an overcharge. Energy inside the Ofgem cap, a council tax rise voted through by your council and an insurance renewal priced in line with the rest of the market are all lawful, however unwelcome.',
      'Comparing a monthly direct debit with a monthly direct debit can mislead on energy, because suppliers adjust the direct debit rather than the price. What matters is the unit rate and the standing charge, not the payment.',
    ];

    return {
      tone: totalIncrease >= 500 ? 'caution' : totalIncrease > 0 ? 'maybe' : 'yes',
      tag: 'Your year of price rises',
      headline:
        totalIncrease > 0
          ? 'This is what the increases add up to over a year'
          : 'Your bills are down on the year',
      amount: `${totalIncrease >= 0 ? '+' : '−'}${formatGbp(Math.abs(totalIncrease))}`,
      amountNote: `a year across ${computed.length} ${computed.length === 1 ? 'bill' : 'bills'}, which is ${formatGbp(Math.abs(totalIncrease) / 12, 2)} a month`,
      figures,
      figuresHeading: 'Each bill, biggest rise first',
      reasoning,
      nextSteps,
      caveats,
    };
  }

  return (
    <div className="tool-card">
      <h2>Add up this year’s price rises</h2>
      <p className="tool-card-hint">
        Fill in only the ones that changed. Enter the old and the new amount
        at whatever frequency you are billed, and we will convert everything
        to a yearly figure. Nothing is sent to us.
      </p>

      <div className="tool-rows">
        {CATEGORIES.map((c, index) => (
          <div key={c.id} className="tool-row is-three">
            <Field label={index === 0 ? 'Bill' : ''} htmlFor={`bi-label-${c.id}`}>
              <input
                id={`bi-label-${c.id}`}
                type="text"
                value={c.label}
                readOnly
                aria-label="Bill type"
                style={{ background: 'rgba(11, 18, 32, 0.03)', color: 'var(--text-secondary)' }}
              />
            </Field>
            <Field label={index === 0 ? 'Was' : ''} htmlFor={`bi-old-${c.id}`}>
              <div className="tool-prefixed">
                <span>£</span>
                <input
                  id={`bi-old-${c.id}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={`${c.label} before`}
                  value={rows[c.id].old}
                  onChange={(e) => update(c.id, { old: e.target.value })}
                />
              </div>
            </Field>
            <Field label={index === 0 ? 'Now' : ''} htmlFor={`bi-new-${c.id}`}>
              <div className="tool-prefixed">
                <span>£</span>
                <input
                  id={`bi-new-${c.id}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={`${c.label} now`}
                  value={rows[c.id].next}
                  onChange={(e) => update(c.id, { next: e.target.value })}
                />
              </div>
            </Field>
            <Field label={index === 0 ? 'How often' : ''} htmlFor={`bi-freq-${c.id}`}>
              <select
                id={`bi-freq-${c.id}`}
                aria-label={`${c.label} frequency`}
                value={rows[c.id].frequency}
                onChange={(e) => update(c.id, { frequency: e.target.value as Frequency })}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
                <option value="weekly">Weekly</option>
              </select>
            </Field>
          </div>
        ))}
      </div>

      <div className="tool-actions">
        <button
          type="button"
          className="btn btn-mint btn-lg"
          disabled={!anyComplete}
          style={anyComplete ? undefined : { opacity: 0.45, cursor: 'not-allowed', boxShadow: 'none' }}
          onClick={() => setVerdict(evaluate())}
        >
          Work out the damage
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setRows(initialRows());
              setRisen([]);
              setVerdict(null);
            }}
          >
            Start again
          </button>
        ) : null}
      </div>

      {verdict ? <ResultCard verdict={verdict} /> : null}

      {verdict && risen.length > 0 ? (
        <div style={{ marginTop: 26 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px', letterSpacing: 'var(--track-tight)' }}>
            Which of these you can push back on
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)', margin: '0 0 16px', lineHeight: 1.55 }}>
            Only the bills that went up are listed. Some of these carry a real
            right to challenge or to leave. Some carry none at all, and we say
            so rather than sending you into an argument you cannot win.
          </p>
          <div className="tool-filing">
            {risen.map((c) => (
              <div key={c.id} className="tool-filing-row">
                {c.link ? (
                  <Link href={c.link.href}>{c.label} — open the {c.link.label.toLowerCase()}</Link>
                ) : (
                  <strong style={{ fontSize: 15, color: 'var(--text-primary)' }}>{c.label}</strong>
                )}
                <span>{c.right}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
