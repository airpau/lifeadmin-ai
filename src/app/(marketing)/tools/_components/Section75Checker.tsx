'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';

/**
 * Section 75 Consumer Credit Act 1974 eligibility checker.
 *
 * The three statutory conditions in s.75 read with s.75(3):
 *   1. the agreement is a debtor-creditor-SUPPLIER agreement (the credit
 *      must fund the purchase and there must be an unbroken link between
 *      you, the lender and the supplier),
 *   2. the CASH PRICE of the single item or service is over £100 and no
 *      more than £30,000,
 *   3. there is a breach of contract or a misrepresentation by the
 *      supplier.
 *
 * The £100 test bites on the cash price of the thing bought, not on the
 * amount charged to the card. Paying £1 of a £4,000 sofa on a credit
 * card gives full cover for the whole £4,000. That is the single most
 * valuable and most misunderstood point, so the tool leads with it.
 */

type Method =
  | 'credit-primary'
  | 'credit-additional'
  | 'pos-finance'
  | 'intermediary'
  | 'debit'
  | 'other'
  | '';
type Problem = 'not-delivered' | 'faulty' | 'misrepresented' | 'trader-gone' | 'service-not-done' | '';
type Age = 'under5' | '5to6' | 'over6' | '';

const MIN_EXCLUSIVE = 100;
const MAX_INCLUSIVE = 30000;

export default function Section75Checker() {
  const [price, setPrice] = useState('');
  const [method, setMethod] = useState<Method>('');
  const [problem, setProblem] = useState<Problem>('');
  const [age, setAge] = useState<Age>('');
  const [triedTrader, setTriedTrader] = useState<'yes' | 'no' | ''>('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const priceNum = Number(price.replace(/[^0-9.]/g, ''));
  const priceValid = price.trim() !== '' && Number.isFinite(priceNum) && priceNum > 0;
  const ready = priceValid && method !== '' && problem !== '' && age !== '' && triedTrader !== '';

  const PROBLEM_LINE: Record<Exclude<Problem, ''>, string> = {
    'not-delivered':
      'Goods that never arrived are a straightforward breach of contract by the supplier, which is exactly what section 75 makes the lender jointly liable for.',
    faulty:
      'Goods that are faulty or not as described breach the Consumer Rights Act 2015 terms implied into your contract with the supplier. That breach passes through to the lender under section 75.',
    misrepresented:
      'Section 75 covers misrepresentation as well as breach of contract, so a claim based on what you were told before you bought is squarely within it.',
    'trader-gone':
      'This is the classic section 75 case. The lender’s liability is joint and several, which means you can claim the whole amount from the lender even though the supplier no longer exists.',
    'service-not-done':
      'A service that was not performed, or not performed with reasonable care and skill under section 49 of the Consumer Rights Act 2015, is a breach of contract by the supplier.',
  };

  function evaluate(): Verdict {
    const caveats: string[] = [];
    const nextSteps: string[] = [];

    // 1. Payment method gate
    if (method === 'debit') {
      return {
        tone: 'no',
        tag: 'Section 75 does not apply',
        headline: 'Section 75 only applies to credit, not to debit cards',
        reasoning: [
          'Section 75 makes a CREDIT provider jointly liable. A debit card is not credit, so there is no lender to claim against.',
          'That does not leave you with nothing. Chargeback is a card scheme rule that lets your bank try to reverse the payment.',
        ],
        nextSteps: [
          'Ask your bank to raise a chargeback. Do it quickly: the usual window is 120 days from the transaction or from when you expected delivery.',
          'Keep pursuing the trader in parallel under the Consumer Rights Act 2015.',
          'If the bank refuses the chargeback unreasonably, you can complain to it and then to the Financial Ombudsman Service.',
        ],
        caveats: [
          'Chargeback is not a legal right, it is a scheme rule, so it is weaker than section 75 and the bank has more discretion.',
          'Chargeback usually recovers only what you paid, not consequential losses.',
        ],
      };
    }

    if (method === 'other') {
      return {
        tone: 'no',
        tag: 'Section 75 does not apply',
        headline: 'Cash and bank transfers are outside section 75',
        reasoning: [
          'Section 75 needs a credit agreement linked to the purchase. A bank transfer or cash payment creates no such agreement.',
        ],
        nextSteps: [
          'Pursue the trader directly under the Consumer Rights Act 2015.',
          'If the transfer was the result of a scam, raise it with your bank under the reimbursement rules for authorised push payment fraud.',
          'For a solvent trader that simply will not engage, the small claims track is the usual route.',
        ],
        caveats: [
          'If any part of the price went on a credit card, even a small deposit, come back and re-run this. That single fact can open a full section 75 claim.',
        ],
      };
    }

    // 2. Value gate
    if (priceNum <= MIN_EXCLUSIVE) {
      return {
        tone: 'no',
        tag: 'Below the threshold',
        headline: 'The cash price has to be more than £100',
        reasoning: [
          `You entered £${priceNum.toFixed(2)}. Section 75 applies where the cash price of the item or service is over £100 and no more than £30,000. £100 exactly is not enough, it has to be at least £100.01.`,
          'The test is the price of the single item or service, not the total value of the basket or the amount charged to the card.',
        ],
        nextSteps: [
          'Check whether the item you are complaining about was actually priced above £100 on its own.',
          'If it was not, ask your card provider for a chargeback instead.',
          'Pursue the trader under the Consumer Rights Act 2015 in either case.',
        ],
        caveats: [
          'If you bought several items in one transaction, look at each item’s own price. One qualifying item is enough for a claim about that item.',
        ],
      };
    }

    if (priceNum > MAX_INCLUSIVE) {
      return {
        tone: 'no',
        tag: 'Above the ceiling',
        headline: 'The cash price is above the £30,000 section 75 ceiling',
        reasoning: [
          `You entered £${priceNum.toFixed(2)}. Section 75 stops at a cash price of £30,000.`,
          'Above that, a separate provision, section 75A, can apply to linked credit agreements, but it has different and narrower conditions, including that you must have tried to get satisfaction from the supplier first.',
        ],
        nextSteps: [
          'Ask your lender specifically whether section 75A applies to your agreement.',
          'Pursue the supplier directly under the Consumer Rights Act 2015.',
          'For a claim of this size, take proper legal advice before you commit to a route.',
        ],
        caveats: [
          'Section 75A generally applies where the credit exceeds £30,000 and the agreement was made to finance that specific purchase. The conditions are more demanding than section 75.',
        ],
      };
    }

    // 3. Chain gate
    let tone: Verdict['tone'] = 'yes';
    let tag = 'Section 75 likely applies';
    let headline = 'Your card provider is jointly liable alongside the retailer';

    if (method === 'credit-additional') {
      tone = 'caution';
      tag = 'Commonly refused';
      headline = 'A purchase by an additional cardholder is where most section 75 claims fail';
      caveats.push(
        'Section 75 protects the debtor under the credit agreement, which is the primary cardholder buying for themselves. Where an additional cardholder made the purchase, lenders routinely refuse, and the Financial Ombudsman has upheld that reasoning in many cases. It is still worth claiming, but go in knowing this is the point they will take.',
      );
    }

    if (method === 'intermediary') {
      tone = 'caution';
      tag = 'The payment chain may be broken';
      headline = 'Paying through PayPal or a similar intermediary can break the section 75 link';
      caveats.push(
        'Section 75 needs an unbroken debtor-creditor-supplier chain. Where the money went from your card to an intermediary and then to the trader, lenders often argue the chain is broken and there is no direct link. Outcomes vary with how the intermediary was set up, so this is worth arguing rather than assuming, but expect resistance and be ready to escalate.',
      );
    }

    if (method === 'pos-finance') {
      caveats.push(
        'Point of sale credit and some catalogue accounts are within section 75 in the same way as a credit card, provided the credit was arranged to fund that specific purchase.',
      );
    }

    // 4. Limitation
    if (age === 'over6') {
      tone = 'caution';
      caveats.push(
        'You told us this was more than six years ago. In England and Wales the limitation period for a contract claim is six years under section 5 of the Limitation Act 1980, and five in Scotland. A lender can decline on that basis and the Ombudsman may not be able to help. Time normally runs from the breach, which for undelivered goods is the date delivery was due, so check that date before you conclude you are out of time.',
      );
    } else if (age === '5to6') {
      caveats.push(
        'You are close to the six-year limitation period in England and Wales, and past the five-year Scottish one. Put the claim in now rather than after another round with the trader.',
      );
    }

    // 5. Have they tried the trader
    if (triedTrader === 'no') {
      nextSteps.push(
        'Put your complaint to the trader in writing first, with a deadline. You do not legally have to exhaust the trader before claiming under section 75, but lenders ask, and having a written refusal or silence on file makes the claim much harder to bat away.',
      );
    }

    nextSteps.push(
      'Write to your card provider, not the retailer, and use the words "section 75 claim under the Consumer Credit Act 1974".',
      'Set out the cash price, the date, what you were promised, what actually happened, and the exact amount you want back.',
      'Attach the order confirmation, the card statement line, and any correspondence with the trader.',
      'Give the lender eight weeks. If it rejects the claim or goes quiet, take it to the Financial Ombudsman Service, which is free.',
    );

    return {
      tone,
      tag,
      headline,
      amount: `£${priceNum.toFixed(2)}`,
      amountNote:
        'The lender is liable for the full cash price, not just the part you put on the card. You can also claim consequential losses that flow from the breach.',
      reasoning: [
        `The cash price of £${priceNum.toFixed(2)} sits inside the section 75 range of over £100 and up to £30,000.`,
        PROBLEM_LINE[problem as Exclude<Problem, ''>],
        'Liability under section 75 is joint and several. That means you can claim the whole amount from the lender and it is then for the lender to chase the supplier, not for you to.',
      ],
      nextSteps,
      caveats: [
        'You cannot recover the same loss twice. If the trader refunds you, the section 75 claim falls away to that extent.',
        'The lender is entitled to see evidence of the breach or misrepresentation. A claim with no documents behind it will be refused.',
        ...caveats,
      ],
    };
  }

  return (
    <div className="tool-card">
      <h2>Check a section 75 claim</h2>
      <p className="tool-card-hint">
        Five questions. Everything runs in your browser, nothing is sent to us
        and nothing is stored.
      </p>

      <div className="tool-fields is-two">
        <Field
          label="Cash price of the item or service"
          htmlFor="s75-price"
          help="The price of the thing itself, not the amount you put on the card. This is the number the £100 test applies to."
        >
          <div className="tool-prefixed">
            <span>£</span>
            <input
              id="s75-price"
              type="text"
              inputMode="decimal"
              placeholder="450.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
        </Field>

        <Field label="How did you pay?" htmlFor="s75-method">
          <select id="s75-method" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            <option value="">Choose one</option>
            <option value="credit-primary">Credit card, and I am the main cardholder</option>
            <option value="credit-additional">Credit card, but I am an additional cardholder</option>
            <option value="pos-finance">Point of sale finance or a catalogue credit account</option>
            <option value="intermediary">Credit card, but through PayPal or a similar service</option>
            <option value="debit">Debit card</option>
            <option value="other">Cash, bank transfer or something else</option>
          </select>
        </Field>

        <Field label="What went wrong?" htmlFor="s75-problem">
          <select id="s75-problem" value={problem} onChange={(e) => setProblem(e.target.value as Problem)}>
            <option value="">Choose one</option>
            <option value="not-delivered">It never arrived</option>
            <option value="faulty">It arrived faulty or not as described</option>
            <option value="misrepresented">I was told something untrue before I bought</option>
            <option value="trader-gone">The trader has gone out of business</option>
            <option value="service-not-done">A service was not provided, or was done badly</option>
          </select>
        </Field>

        <Field label="When did you buy it?" htmlFor="s75-age">
          <select id="s75-age" value={age} onChange={(e) => setAge(e.target.value as Age)}>
            <option value="">Choose one</option>
            <option value="under5">Within the last 5 years</option>
            <option value="5to6">Between 5 and 6 years ago</option>
            <option value="over6">More than 6 years ago</option>
          </select>
        </Field>

        <Field
          label="Have you already complained to the trader?"
          htmlFor="s75-tried"
          full
          help="Not a legal requirement, but lenders ask and a paper trail makes the claim much stronger."
        >
          <select
            id="s75-tried"
            value={triedTrader}
            onChange={(e) => setTriedTrader(e.target.value as 'yes' | 'no' | '')}
          >
            <option value="">Choose one</option>
            <option value="yes">Yes, in writing</option>
            <option value="no">No, or only by phone</option>
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
          Check my claim
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setPrice('');
              setMethod('');
              setProblem('');
              setAge('');
              setTriedTrader('');
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
