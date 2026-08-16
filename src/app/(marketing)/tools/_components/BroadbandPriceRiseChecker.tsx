'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';

/**
 * Mid-contract price rise checker for broadband, mobile, landline and TV.
 *
 * The governing rules are the Ofcom General Conditions of Entitlement,
 * Condition C1:
 *
 *   C1.3   the price you will pay, including any scheduled increase,
 *          must be in the contract information given before you sign.
 *   C1.14  at least one month's notice of any contractual modification,
 *          unless it is exclusively to the customer's benefit, is purely
 *          administrative with no negative effect, or is imposed by law.
 *   C1.15  the right to terminate at no additional cost, exercisable
 *          within one month of that notification.
 *   C1.17  no Early Termination Charge is payable on a C1.15 exit.
 *
 * Numbering verified 16 August 2026 against the Ofcom General Conditions
 * of Entitlement, unofficial consolidated version with effect from
 * 8 April 2026 (the instrument currently in force). The older "material
 * detriment" test belonged to GC9.6 and was superseded when the EECC
 * provisions took effect in December 2021; the current C1.14 test is
 * "any contractual modification" subject to the three carve-outs above.
 *
 * From 17 January 2025 Ofcom additionally requires any in-contract rise
 * to be stated up front in pounds and pence. Contracts entered from
 * that date cannot use CPI or RPI plus a percentage.
 *
 * The honest answer that competitors get wrong: where a CPI+x term WAS
 * clearly disclosed and the contract predates 17 January 2025, there is
 * generally NO penalty-free exit right. This tool says so.
 */

type Service = 'broadband' | 'mobile' | 'tv' | 'landline' | '';
type Signed = 'before-2025' | 'after-2025' | 'not-sure' | '';
type Disclosure = 'pounds-pence' | 'inflation' | 'nothing' | 'not-sure' | '';
type Notice = 'yes' | 'no' | 'not-sure' | '';
type Term = 'in-term' | 'out-of-term' | '';

const SERVICE_LABEL: Record<Exclude<Service, ''>, string> = {
  broadband: 'broadband',
  mobile: 'mobile',
  tv: 'TV and broadband bundle',
  landline: 'landline',
};

const RULE_CHANGE = '17 January 2025';

export default function BroadbandPriceRiseChecker() {
  const [service, setService] = useState<Service>('');
  const [signed, setSigned] = useState<Signed>('');
  const [disclosure, setDisclosure] = useState<Disclosure>('');
  const [notice, setNotice] = useState<Notice>('');
  const [term, setTerm] = useState<Term>('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const ready = service !== '' && signed !== '' && disclosure !== '' && notice !== '' && term !== '';

  const escalation = [
    'Put the complaint to your provider in writing and ask it to confirm, in writing, which contract term it says permits the increase and where that term was disclosed to you before you signed.',
    'If it refuses, ask for a deadlock letter.',
    'After six weeks, or on a deadlock letter, take it free of charge to whichever approved ADR scheme your provider belongs to: the Communications Ombudsman or CISAS.',
  ];

  function evaluate(): Verdict {
    const label = SERVICE_LABEL[service as Exclude<Service, ''>];
    const caveats: string[] = [
      'A right to exit is not a right to a refund. It lets you leave without an early termination charge. You still pay for service already used.',
      'Exercise it promptly. The right is normally tied to the notice period, so leaving it for three months and then complaining usually loses it.',
      'If you take the exit, you have to arrange a new provider yourself. Nobody does it for you and there is no automatic continuity of service.',
    ];

    // Out of minimum term: nothing to exit from.
    if (term === 'out-of-term') {
      return {
        tone: 'yes',
        tag: 'You can leave anyway',
        headline: 'You are out of your minimum term, so no exit fee applies at all',
        reasoning: [
          `Your minimum term has ended, so you can leave your ${label} contract at any time on the standard notice, normally 30 days, with no early termination charge.`,
          'The right-to-exit question only matters inside a minimum term. Outside it, the exit right is not the issue, the price is.',
          'Out-of-contract customers are routinely on the highest prices a provider charges. Your provider is required to tell you annually about its best available deals.',
        ],
        nextSteps: [
          'Check what a new customer pays for the same package. That is your negotiating number.',
          'Ring the retentions team, or use the provider’s app chat, and ask them to match it.',
          'If they will not, get your switching code and move. Broadband and mobile switching is now largely handled by the gaining provider.',
        ],
        caveats: [
          'Check whether any equipment, such as a router or a handset on an instalment plan, has a separate balance that survives the contract ending.',
        ],
      };
    }

    // No notice given: breach regardless of what the contract said.
    if (notice === 'no') {
      return {
        tone: 'yes',
        tag: 'Strong ground',
        headline: 'A price rise imposed without proper notice is a separate breach in itself',
        reasoning: [
          'Under Ofcom General Condition C1, a provider making a contract modification likely to be of material detriment must give you at least one month’s notice before it takes effect.',
          'Ofcom treats an increase in the core subscription price during a fixed term as likely to be of material detriment.',
          'If no notice was given, the notice obligation was not met, and the right to exit without penalty is engaged whatever the contract said about pricing.',
        ],
        nextSteps: [
          'Check every channel before you rely on this: the notice can arrive by email, text, in-app message, or as a line on the bill itself. Providers do count all of those.',
          'If you genuinely received nothing, write to the provider stating that no notice of the modification was given as required by General Condition C1, and that you are exercising the right to exit without penalty.',
          ...escalation,
        ],
        caveats: [
          'Providers commonly point to a message you did not notice. Ask them to produce the date and the channel of the notice, in writing.',
          ...caveats,
        ],
      };
    }

    // The exact case: inflation-linked rise.
    if (disclosure === 'inflation') {
      if (signed === 'after-2025') {
        return {
          tone: 'yes',
          tag: 'Strong ground',
          headline: `An inflation-linked rise is not permitted in a contract taken out after ${RULE_CHANGE}`,
          reasoning: [
            `Ofcom’s rules from ${RULE_CHANGE} require any in-contract price rise to be set out up front in pounds and pence. Rises expressed as CPI or RPI plus a percentage are no longer permitted in contracts entered from that date.`,
            `You told us you took out this ${label} contract on or after that date and that the rise is inflation-linked, which puts it squarely outside the rules.`,
            'A rise the provider was not entitled to impose is a modification, and Condition C1 gives you at least one month’s notice and a right to exit without penalty.',
          ],
          nextSteps: [
            'Find the contract information document or the order confirmation from when you signed up, and check what it says about future prices.',
            `Write to the provider stating that the increase is inflation-linked and the contract was entered on or after ${RULE_CHANGE}, so it does not comply with Ofcom’s pricing transparency requirement, and that you are exercising the right to exit without penalty.`,
            ...escalation,
          ],
          caveats: [
            'Check the date you signed carefully. Re-contracting, upgrading or renewing usually creates a new contract, and it is the date of the current contract that counts, not when you first joined the provider.',
            ...caveats,
          ],
        };
      }

      if (signed === 'before-2025') {
        return {
          tone: 'no',
          tag: 'Probably no exit right',
          headline: 'If a CPI or RPI clause was clearly disclosed and you signed before the rule change, the rise is contractual',
          reasoning: [
            `This is the answer people do not want, and it is the honest one. Ofcom’s ban on inflation-linked rises applies to contracts entered from ${RULE_CHANGE}. It is not retrospective.`,
            'For an earlier contract, if the CPI or RPI plus a percentage term was properly set out in the contract information before you signed, then the increase is something you agreed to. A rise disclosed up front under Condition C1.3 is not a contractual modification for the purposes of Condition C1.14, so no penalty-free exit right arises when it takes effect.',
            'The provider still has to apply the term correctly and give you notice.',
          ],
          nextSteps: [
            'Go and read the contract information document you were given before you signed. If the rise was NOT actually set out there, come back and re-run this with "nothing was said", because that changes the answer completely.',
            'Check the arithmetic. Providers do get the index or the reference month wrong, and a rise calculated incorrectly is a rise you did not agree to.',
            'Check whether your minimum term is nearly up. If it is, the practical answer is to wait it out and then move.',
            'Ask the retentions team to hold your price. There is no legal right to that, but there is often commercial room.',
          ],
          caveats: [
            'If the term was buried, or was only in terms and conditions you were never shown before signing, that is a genuinely different argument about whether it formed part of the contract at all. Say so specifically rather than in general terms.',
            ...caveats,
          ],
        };
      }

      return {
        tone: 'maybe',
        tag: 'Depends on one date',
        headline: 'The whole answer turns on when you signed this contract',
        reasoning: [
          `Ofcom banned inflation-linked in-contract rises for contracts entered from ${RULE_CHANGE}. Before that date, a clearly disclosed CPI or RPI term was permitted.`,
          'So the same price rise gives you a strong ground or none at all, depending purely on that date.',
        ],
        nextSteps: [
          'Find the order confirmation email or the contract information document. The date on it is the date that matters.',
          'Remember that upgrading, renewing or re-contracting normally starts a new contract on a new date.',
          'Once you have the date, re-run this tool.',
        ],
        caveats: caveats,
      };
    }

    // Rise was disclosed in pounds and pence.
    if (disclosure === 'pounds-pence') {
      return {
        tone: 'no',
        tag: 'Probably no exit right',
        headline: 'A rise stated in pounds and pence before you signed is one you agreed to',
        reasoning: [
          'Under Ofcom General Condition C1.3, the price you will pay, including any scheduled increase, has to be in the contract information given to you before you sign.',
          'Where a provider did exactly that, and stated the new amount in pounds and pence with the date it takes effect, the increase is a term of the contract rather than a modification of it.',
          'On that basis there is generally no right to exit without penalty when the rise takes effect. This is the rule working as intended, not a loophole.',
        ],
        nextSteps: [
          'Check the amount actually charged against the amount you were told. If it is even slightly higher, that difference is a modification you did not agree to, and that does engage the exit right.',
          'Check the date it was applied against the date you were given.',
          'If both match, your options are commercial rather than legal: negotiate, downgrade the package, or plan to move when the term ends.',
        ],
        caveats: [
          'A rise to something other than the core subscription price, for example out-of-bundle call charges, may be treated differently. If that is what changed, it is worth asking about specifically.',
          ...caveats,
        ],
      };
    }

    // Nothing was said, or the customer does not know.
    if (disclosure === 'nothing') {
      return {
        tone: 'yes',
        tag: 'Strong ground',
        headline: 'A rise that was never disclosed is a contract modification, and that triggers the exit right',
        reasoning: [
          `You told us nothing was said about future price rises when you took out this ${label} contract.`,
          'That makes the increase a modification of the contract rather than a term of it. Ofcom General Condition C1 requires at least one month’s notice of a modification likely to be of material detriment, and a right to exit without penalty.',
          'Ofcom expressly treats an increase in the core subscription price during a fixed term as likely to be of material detriment, so this is not a marginal argument.',
        ],
        nextSteps: [
          'Dig out the contract information document or order confirmation from when you signed. Confirm that it really is silent on future prices.',
          'Write to the provider stating that the increase is a modification under General Condition C1, that no price rise was disclosed in the contract information, and that you are exercising your right to exit without penalty.',
          'Do it inside the notice period. The right is tied to the notice, not open-ended.',
          ...escalation,
        ],
        caveats: [
          'Providers often say the term was in the general terms and conditions rather than the contract summary. Ask them to point to exactly where it was disclosed to you before you signed, and to send you that document.',
          ...caveats,
        ],
      };
    }

    // not-sure about disclosure
    return {
      tone: 'maybe',
      tag: 'One document decides this',
      headline: 'Find the contract information document you were given before you signed',
      reasoning: [
        'The answer depends entirely on whether a price rise was set out in the contract information before you signed, and if so in what form.',
        'If it was stated in pounds and pence, the rise is contractual and there is generally no exit right.',
        `If it was inflation-linked, the answer turns on whether you signed before or after ${RULE_CHANGE}.`,
        'If nothing was said at all, the rise is a modification and Condition C1 gives you notice plus a right to exit without penalty.',
      ],
      nextSteps: [
        'Search your email for the order confirmation or the contract information document from when you signed or last re-contracted.',
        'If you cannot find it, ask the provider to send you a copy. It has to keep it and it should provide it.',
        'Then re-run this tool with the real answer.',
      ],
      caveats: caveats,
    };
  }

  return (
    <div className="tool-card">
      <h2>Check your right to exit</h2>
      <p className="tool-card-hint">
        Five questions about what you were told before you signed. That, not
        the size of the rise, is what decides it.
      </p>

      <div className="tool-fields is-two">
        <Field label="Which service went up?" htmlFor="bb-service">
          <select id="bb-service" value={service} onChange={(e) => setService(e.target.value as Service)}>
            <option value="">Choose one</option>
            <option value="broadband">Broadband</option>
            <option value="mobile">Mobile</option>
            <option value="tv">TV and broadband bundle</option>
            <option value="landline">Landline</option>
          </select>
        </Field>

        <Field label="Are you still in your minimum term?" htmlFor="bb-term">
          <select id="bb-term" value={term} onChange={(e) => setTerm(e.target.value as Term)}>
            <option value="">Choose one</option>
            <option value="in-term">Yes, still in the minimum term</option>
            <option value="out-of-term">No, the minimum term has ended</option>
          </select>
        </Field>

        <Field
          label="When did you sign or last re-contract?"
          htmlFor="bb-signed"
          help={`Upgrading or renewing normally starts a new contract. Ofcom's rules changed on ${RULE_CHANGE}.`}
        >
          <select id="bb-signed" value={signed} onChange={(e) => setSigned(e.target.value as Signed)}>
            <option value="">Choose one</option>
            <option value="before-2025">Before {RULE_CHANGE}</option>
            <option value="after-2025">On or after {RULE_CHANGE}</option>
            <option value="not-sure">I am not sure</option>
          </select>
        </Field>

        <Field
          label="What were you told about future price rises?"
          htmlFor="bb-disclosure"
          help="Check the contract information document or order confirmation, not the marketing page."
        >
          <select
            id="bb-disclosure"
            value={disclosure}
            onChange={(e) => setDisclosure(e.target.value as Disclosure)}
          >
            <option value="">Choose one</option>
            <option value="pounds-pence">The exact new price, in pounds and pence, with a date</option>
            <option value="inflation">It said CPI or RPI plus a percentage</option>
            <option value="nothing">Nothing was said about price rises</option>
            <option value="not-sure">I am not sure</option>
          </select>
        </Field>

        <Field
          label="Did they give you at least one month’s notice of the rise?"
          htmlFor="bb-notice"
          full
          help="Notice can arrive by email, text, in-app message or on the bill. Check all of them before answering no."
        >
          <select id="bb-notice" value={notice} onChange={(e) => setNotice(e.target.value as Notice)}>
            <option value="">Choose one</option>
            <option value="yes">Yes, I was notified in advance</option>
            <option value="no">No, the first I knew was the higher bill</option>
            <option value="not-sure">I am not sure</option>
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
          Check my rights
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setService('');
              setSigned('');
              setDisclosure('');
              setNotice('');
              setTerm('');
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
