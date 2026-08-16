'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';
import {
  BACK_BILLING_LIMIT_MONTHS,
  CURRENT_PRICE_CAP,
  ENERGY_OMBUDSMAN_WEEKS,
  PRICE_CAP_PERIODS,
  getPriceCapPeriod,
} from '../_data/energy-price-cap';

/**
 * Energy unit rate / standing charge comparison against the Ofgem cap,
 * plus a back-billing check.
 *
 * Deliberately conservative in two ways.
 *
 * 1. The cap figures in _data/energy-price-cap.ts are the GREAT BRITAIN
 *    AVERAGE for Direct Debit customers. Ofgem sets the cap regionally
 *    and by payment method, so a household sitting a few percent above
 *    the GB average is not necessarily being overcharged. The tool
 *    therefore reports "above the GB average" and never "your supplier
 *    has breached the cap".
 *
 * 2. It states plainly which cap period the answer is based on, because
 *    the cap changes every three months and comparing a January bill to
 *    the July cap produces nonsense.
 */

type Tariff = 'variable' | 'fixed' | 'unknown' | '';
type Payment = 'dd' | 'credit' | 'prepay' | '';
type YesNo = 'yes' | 'no' | '';

type Comparison = {
  label: string;
  yours: number;
  cap: number;
  unit: string;
  diffPct: number;
};

function compare(label: string, yours: number, cap: number, unit: string): Comparison {
  return { label, yours, cap, unit, diffPct: ((yours - cap) / cap) * 100 };
}

function describe(c: Comparison): string {
  const pct = Math.abs(c.diffPct).toFixed(1);
  if (c.diffPct <= -2) {
    return `${c.label}: you are paying ${c.yours}${c.unit} against a GB average cap of ${c.cap}${c.unit}. That is ${pct}% below the average, so nothing to query here.`;
  }
  if (c.diffPct < 2) {
    return `${c.label}: you are paying ${c.yours}${c.unit} against a GB average cap of ${c.cap}${c.unit}. That is in line with the cap.`;
  }
  if (c.diffPct < 10) {
    return `${c.label}: you are paying ${c.yours}${c.unit} against a GB average cap of ${c.cap}${c.unit}, which is ${pct}% above. Regional caps vary by roughly this much, particularly standing charges, so this is probably your region rather than an overcharge. Check your region's figure in the Ofgem table before you complain.`;
  }
  return `${c.label}: you are paying ${c.yours}${c.unit} against a GB average cap of ${c.cap}${c.unit}, which is ${pct}% above. That gap is larger than regional variation normally explains, so it is worth asking your supplier to justify it in writing.`;
}

export default function EnergyOverchargeChecker() {
  const [periodId, setPeriodId] = useState(CURRENT_PRICE_CAP.id);
  const [tariff, setTariff] = useState<Tariff>('');
  const [payment, setPayment] = useState<Payment>('');
  const [elecUnit, setElecUnit] = useState('');
  const [elecStanding, setElecStanding] = useState('');
  const [gasUnit, setGasUnit] = useState('');
  const [gasStanding, setGasStanding] = useState('');
  const [backBill, setBackBill] = useState<YesNo>('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const period = getPriceCapPeriod(periodId);
  const num = (s: string) => {
    const n = Number(s.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const ready =
    tariff !== '' && payment !== '' && backBill !== '' && (num(elecUnit) !== null || num(gasUnit) !== null);

  function evaluate(): Verdict {
    const reasoning: string[] = [];
    const caveats: string[] = [];
    const nextSteps: string[] = [];
    let worst = 0;

    reasoning.push(
      `This answer is based on the Ofgem price cap for ${period.shortLabel}. The cap changes every three months, so if your bill covers a different period, change the period above and run it again.`,
    );

    if (tariff === 'fixed') {
      reasoning.push(
        'You told us you are on a fixed tariff. The price cap does not apply to fixed tariffs at all. A fixed rate above the cap is not a breach of anything, it is the deal you agreed. The comparison below is context, not a complaint.',
      );
    } else if (tariff === 'unknown') {
      caveats.push(
        'You were not sure of your tariff type. Check your bill: the cap only protects standard variable, also called default, tariffs. If you are on a fixed deal the comparison is informational only.',
      );
    }

    const comparisons: Comparison[] = [];
    const eu = num(elecUnit);
    const es = num(elecStanding);
    const gu = num(gasUnit);
    const gs = num(gasStanding);

    if (eu !== null) comparisons.push(compare('Electricity unit rate', eu, period.electricityUnitRatePencePerKwh, 'p/kWh'));
    if (es !== null) comparisons.push(compare('Electricity standing charge', es, period.electricityStandingChargePencePerDay, 'p/day'));
    if (gu !== null) comparisons.push(compare('Gas unit rate', gu, period.gasUnitRatePencePerKwh, 'p/kWh'));
    if (gs !== null) comparisons.push(compare('Gas standing charge', gs, period.gasStandingChargePencePerDay, 'p/day'));

    for (const c of comparisons) {
      reasoning.push(describe(c));
      if (c.diffPct > worst) worst = c.diffPct;
    }

    if (payment !== 'dd') {
      caveats.push(
        payment === 'credit'
          ? 'You pay on receipt of your bill (standard credit). Ofgem sets a HIGHER cap for standard credit than for Direct Debit, because suppliers carry more cost. The figures above are the Direct Debit average, so being above them is expected on standard credit. Look up the standard credit row for your region before drawing conclusions.'
          : 'You are on a prepayment meter. Ofgem sets a separate cap for prepayment, which differs from the Direct Debit figures used above. Look up the prepayment row for your region in the Ofgem table.',
      );
    }

    caveats.push(
      'The figures we compare against are the Great Britain average for Direct Debit customers, including VAT. Ofgem sets the cap regionally, and standing charges in particular vary a lot between regions. Being above the average is not by itself evidence of a breach.',
      'The cap limits the rate, not your bill. A high bill on capped rates usually means high consumption, an estimated reading, or a direct debit set too high, and each of those has a different remedy.',
    );

    // Back-billing is the strongest and most actionable finding, so it
    // leads the verdict when present.
    if (backBill === 'yes') {
      nextSteps.push(
        `Write to your supplier and state that under the back-billing rule you are not liable for charges relating to energy used more than ${BACK_BILLING_LIMIT_MONTHS} months before the date of the bill.`,
        'Ask the supplier to reissue the bill limited to the last 12 months, and to confirm in writing that the earlier balance has been removed.',
        'Ask for a full breakdown of the readings used, and check whether any of them were estimates.',
        `If it is unresolved after ${ENERGY_OMBUDSMAN_WEEKS} weeks, or you get a deadlock letter sooner, take it to the Energy Ombudsman free of charge.`,
      );
      return {
        tone: 'yes',
        tag: 'Back-billing rule engaged',
        headline: `A bill reaching back more than ${BACK_BILLING_LIMIT_MONTHS} months should not have been issued`,
        reasoning: [
          `Ofgem's back-billing rule, in Standard Licence Condition 21BA, stops a supplier billing a domestic customer for energy used more than ${BACK_BILLING_LIMIT_MONTHS} months before the date of the bill.`,
          'This is the most valuable finding on this page, because it can remove a large balance outright rather than shaving pence off a rate.',
          ...reasoning,
        ],
        nextSteps,
        caveats: [
          'There is a narrow exception. The protection can be lost where the customer obstructed the supplier, for example by tampering with the meter or blocking access to it. Simply not sending readings does not count against you.',
          'The rule caps how far back they can bill. It does not wipe out genuine charges from the last 12 months.',
          ...caveats,
        ],
      };
    }

    nextSteps.push(
      'Look up your own region and payment method in the Ofgem unit rates table before you complain, so you are comparing against the right number.',
      'If your rate is materially above your regional cap, write to the supplier and ask it to justify the rate in writing by reference to the cap for your region.',
      'Ask for a full statement of account and check for estimated readings, which are the most common cause of a bill that looks wrong.',
      `If the supplier does not resolve it within ${ENERGY_OMBUDSMAN_WEEKS} weeks, or issues a deadlock letter, escalate to the Energy Ombudsman.`,
    );

    if (worst >= 10 && tariff !== 'fixed') {
      return {
        tone: 'maybe',
        tag: 'Worth querying',
        headline: 'At least one of your rates is materially above the GB average cap',
        reasoning,
        nextSteps,
        caveats,
      };
    }

    return {
      tone: worst >= 2 ? 'maybe' : 'no',
      tag: worst >= 2 ? 'Broadly in line' : 'In line with the cap',
      headline:
        worst >= 2
          ? 'Your rates are close to the cap, and the gap is within normal regional variation'
          : 'Your rates are at or below the GB average cap',
      reasoning,
      nextSteps: [
        'If your bill still feels wrong, the cause is more likely to be consumption, estimated readings or a direct debit set too high than the rate itself.',
        'Ask for a full statement of account and submit an actual meter reading.',
        'If you are on a standard variable tariff, check whether a fixed deal is currently cheaper than the cap.',
      ],
      caveats,
    };
  }

  return (
    <div className="tool-card">
      <h2>Compare your rates against the price cap</h2>
      <p className="tool-card-hint">
        Take the figures straight off your bill or your online account. Enter
        at least one of electricity or gas. Nothing is sent to us.
      </p>

      <div className="tool-fields is-two">
        <Field
          label="Which cap period does your bill cover?"
          htmlFor="en-period"
          full
          help="The cap changes on 1 January, 1 April, 1 July and 1 October. Your answer will say which period it used."
        >
          <select id="en-period" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
            {PRICE_CAP_PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="What kind of tariff are you on?" htmlFor="en-tariff">
          <select id="en-tariff" value={tariff} onChange={(e) => setTariff(e.target.value as Tariff)}>
            <option value="">Choose one</option>
            <option value="variable">Standard variable (the capped default tariff)</option>
            <option value="fixed">A fixed deal</option>
            <option value="unknown">I am not sure</option>
          </select>
        </Field>

        <Field label="How do you pay?" htmlFor="en-payment">
          <select id="en-payment" value={payment} onChange={(e) => setPayment(e.target.value as Payment)}>
            <option value="">Choose one</option>
            <option value="dd">Direct Debit</option>
            <option value="credit">On receipt of the bill (standard credit)</option>
            <option value="prepay">Prepayment meter</option>
          </select>
        </Field>

        <Field label="Electricity unit rate" htmlFor="en-eu" help="Pence per kWh, including VAT.">
          <input
            id="en-eu"
            type="text"
            inputMode="decimal"
            placeholder={String(period.electricityUnitRatePencePerKwh)}
            value={elecUnit}
            onChange={(e) => setElecUnit(e.target.value)}
          />
        </Field>

        <Field label="Electricity standing charge" htmlFor="en-es" help="Pence per day, including VAT.">
          <input
            id="en-es"
            type="text"
            inputMode="decimal"
            placeholder={String(period.electricityStandingChargePencePerDay)}
            value={elecStanding}
            onChange={(e) => setElecStanding(e.target.value)}
          />
        </Field>

        <Field label="Gas unit rate" htmlFor="en-gu" help="Pence per kWh. Leave blank if you have no gas.">
          <input
            id="en-gu"
            type="text"
            inputMode="decimal"
            placeholder={String(period.gasUnitRatePencePerKwh)}
            value={gasUnit}
            onChange={(e) => setGasUnit(e.target.value)}
          />
        </Field>

        <Field label="Gas standing charge" htmlFor="en-gs" help="Pence per day. Leave blank if you have no gas.">
          <input
            id="en-gs"
            type="text"
            inputMode="decimal"
            placeholder={String(period.gasStandingChargePencePerDay)}
            value={gasStanding}
            onChange={(e) => setGasStanding(e.target.value)}
          />
        </Field>

        <Field
          label="Has your supplier billed you for energy used more than 12 months ago?"
          htmlFor="en-back"
          full
          help="Compare the date on the bill with the oldest period it charges you for. This is often worth far more than the rate comparison."
        >
          <select id="en-back" value={backBill} onChange={(e) => setBackBill(e.target.value as YesNo)}>
            <option value="">Choose one</option>
            <option value="yes">Yes, it reaches back more than 12 months</option>
            <option value="no">No, or I am not sure</option>
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
          Check my bill
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setTariff('');
              setPayment('');
              setElecUnit('');
              setElecStanding('');
              setGasUnit('');
              setGasStanding('');
              setBackBill('');
              setVerdict(null);
            }}
          >
            Start again
          </button>
        ) : null}
      </div>

      {verdict ? <ResultCard verdict={verdict} /> : null}

      <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginTop: 18, lineHeight: 1.6 }}>
        Cap figures used: {period.shortLabel}. Electricity{' '}
        {period.electricityUnitRatePencePerKwh}p/kWh and{' '}
        {period.electricityStandingChargePencePerDay}p/day. Gas{' '}
        {period.gasUnitRatePencePerKwh}p/kWh and {period.gasStandingChargePencePerDay}p/day. Great
        Britain average for Direct Debit, including VAT, taken from the Ofgem
        table and last checked on {period.verifiedOn}.
      </p>
    </div>
  );
}
