'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';

/**
 * Private and council parking appeal router.
 *
 * The important design decision here is that this tool is allowed to
 * tell the user NOT to appeal yet. POPLA has said publicly that generic
 * template appeals are typically rejected while specific, evidenced
 * grounds succeed, so a tool that hands out a one-click generic appeal
 * is doing the motorist harm. Where the user has no specific factual
 * ground, the verdict is "stop and go and collect evidence", not "here
 * is a letter".
 *
 * We also refuse to treat "the charge is too much" as a viable ground.
 * In ParkingEye v Beavis [2015] UKSC 67 the Supreme Court held that an
 * £85 charge was not an unenforceable penalty. Building an appeal on
 * the amount alone loses.
 */

type Issuer = 'private' | 'council' | 'council-london' | 'police' | '';
type Body = 'bpa' | 'ipc' | 'unknown' | '';
type Stage = 'not-appealed' | 'rejected' | '';
type Ground =
  | 'signage'
  | 'payment-made'
  | 'permit'
  | 'not-driver'
  | 'breakdown'
  | 'overstay-minutes'
  | 'contravention-wrong'
  | 'amount'
  | 'none'
  | '';

type GroundAssessment = {
  strength: 'strong' | 'moderate' | 'weak';
  line: string;
  evidence: string;
};

const GROUNDS: Record<Exclude<Ground, '' | 'none'>, GroundAssessment> = {
  signage: {
    strength: 'strong',
    line:
      'Inadequate signage goes to whether a contract was formed at all. If the terms were not brought to your attention clearly enough before you parked, there is nothing to breach.',
    evidence:
      'Dated photographs taken from the driver’s eye position at the exact spot you parked, plus a wide shot showing how far the nearest sign was and whether it was lit. An assertion that the signs were poor, with no images, is routinely rejected.',
  },
  'payment-made': {
    strength: 'strong',
    line:
      'You paid for the session but the registration was keyed wrongly. The operator has suffered no loss and the charge is being levied on a typing error.',
    evidence:
      'The payment receipt or app history showing the date, time, amount and location, plus your V5C or insurance document showing the correct registration. This is documentary, which is why it is one of the more reliably successful appeals.',
  },
  permit: {
    strength: 'strong',
    line:
      'You were entitled to be there. The charge is based on a mistake of fact by the operator or its camera system.',
    evidence:
      'A photograph of the permit or ticket in place, the permit reference, and where relevant a letter from the landlord, employer or managing agent confirming your entitlement on that date.',
  },
  'not-driver': {
    strength: 'strong',
    line:
      'A private operator can only pursue the registered keeper for another person’s charge by complying with Schedule 4 of the Protection of Freedoms Act 2012. That means serving a notice to keeper inside the prescribed window and including the prescribed wording. If it got the timing or the wording wrong, keeper liability simply does not arise. This is a legal point rather than a plea for leniency, which is why it carries weight.',
    evidence:
      'The notice itself, and the dates on it. Check the date of the alleged event against the date the notice to keeper was served, and check that the notice actually invites the keeper to identify the driver and warns of keeper liability. You do not have to name the driver.',
  },
  breakdown: {
    strength: 'moderate',
    line:
      'A vehicle that could not be moved, or a genuine emergency, can mean the parking was not a voluntary breach of the terms.',
    evidence:
      'Recovery company invoice or call log, garage receipt, or for a medical emergency the hospital or GP record. Without a document this is just an assertion.',
  },
  'overstay-minutes': {
    strength: 'moderate',
    line:
      'The trade body codes require a grace period at the end of a paid session, commonly ten minutes, and a separate consideration period on arrival. A short overstay may fall inside it.',
    evidence:
      'The exact entry and exit times from the notice, your payment record showing the session you bought, and the relevant paragraph of the operator’s trade body code of practice.',
  },
  'contravention-wrong': {
    strength: 'strong',
    line:
      'The contravention alleged did not happen, or the restriction was not properly signed or marked. For a council PCN this goes to whether the penalty was lawfully issued.',
    evidence:
      'Photographs of the bay markings, the signs and any suspension notice, plus the times. Ask the council for its own photographs and the traffic order that creates the restriction.',
  },
  amount: {
    strength: 'weak',
    line:
      'This is the weakest common ground and it is worth being blunt about why. In ParkingEye v Beavis the Supreme Court held that an £85 private parking charge was not an unenforceable penalty, because the operator had a legitimate interest in managing the car park. An appeal built on the charge being too much will almost certainly fail.',
    evidence:
      'None that helps. If this is your only ground, look instead at signage, the payment record, or whether the notice complied with Schedule 4. Those are the arguments that decide cases.',
  },
};

function daysBetween(fromISO: string): number | null {
  if (!fromISO) return null;
  const [y, m, d] = fromISO.split('-').map(Number);
  if (!y || !m || !d) return null;
  const issued = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - issued) / 86400000);
}

export default function ParkingAppealChecker() {
  const [issuer, setIssuer] = useState<Issuer>('');
  const [body, setBody] = useState<Body>('');
  const [stage, setStage] = useState<Stage>('');
  const [issuedOn, setIssuedOn] = useState('');
  const [ground, setGround] = useState<Ground>('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const isPrivate = issuer === 'private';
  const ready = issuer !== '' && stage !== '' && issuedOn !== '' && ground !== '' && (!isPrivate || body !== '');

  function evaluate(): Verdict {
    const days = daysBetween(issuedOn);
    const dayText = days === null ? 'an unknown number of days' : `${days} day${days === 1 ? '' : 's'}`;

    if (issuer === 'police') {
      return {
        tone: 'caution',
        tag: 'Different system',
        headline: 'A police or DVLA fixed penalty is not a parking charge and does not go to these schemes',
        reasoning: [
          'A fixed penalty notice issued by the police, or a DVLA penalty, is a criminal or statutory matter, not a civil parking charge or a council PCN.',
          'Neither POPLA, the IAS nor the Traffic Penalty Tribunal has jurisdiction over it.',
        ],
        nextSteps: [
          'Read the notice for the specific challenge route it names, which is usually the issuing force or agency.',
          'If you reject the fixed penalty you are normally electing to have the matter heard in the magistrates’ court, which carries costs risk. Take advice before you do that.',
        ],
        caveats: [
          'Deadlines on fixed penalty notices are short and missing one can escalate the amount or the consequences. Do not let it run.',
        ],
      };
    }

    // ---- No specific ground: refuse to help them send a generic appeal.
    if (ground === 'none') {
      return {
        tone: 'caution',
        tag: 'Do not appeal yet',
        headline: 'Stop. A generic appeal is worse than no appeal',
        reasoning: [
          'POPLA has said publicly that generic, template appeals are typically rejected, while specific and personalised grounds succeed. The assessors read hundreds of these. A letter that could have been written about any car park reads exactly like what it is.',
          'You get one shot. On most schemes you must submit all your evidence with the appeal and cannot add to it later, so filing early with nothing is a real cost.',
          'We are not going to hand you a letter at this point, because it would reduce your chances rather than improve them.',
        ],
        nextSteps: [
          'Go back to the location and photograph every sign, from the driver’s eye position at the exact spot you parked, with a wide shot showing distance and lighting.',
          'Find the payment record. App history, card statement line or paper ticket. A keying error with proof of payment is one of the strongest grounds there is.',
          'Read the notice itself against Schedule 4 of the Protection of Freedoms Act 2012. Check when it was served and whether it contains the prescribed wording. Operators get this wrong more often than you would expect.',
          'Once you have one or two specific, evidenced grounds, come back and re-run this tool.',
        ],
        caveats: [
          `The clock is still running. This notice was issued ${dayText} ago and the discount window and appeal deadlines do not pause while you gather evidence.`,
          'Listing five weak grounds is worse than one strong one. Assessors decide on the best point you make, and padding invites the operator to rebut the easy ones.',
        ],
      };
    }

    const g = GROUNDS[ground as Exclude<Ground, '' | 'none'>];
    const caveats: string[] = [];
    const nextSteps: string[] = [];

    // ---- Private land
    if (isPrivate) {
      const discountOpen = days !== null && days <= 14;
      caveats.push(
        discountOpen
          ? `This notice was issued ${dayText} ago, so a reduced amount is probably still available. Most private operators offer a discount if you pay within 14 days. That discount is set by the operator’s trade body code, not by statute, so check the figure and the deadline printed on your notice.`
          : `This notice was issued ${dayText} ago, so the 14-day reduced amount has probably lapsed. Appealing does not usually bring it back, although some operators re-offer it if they reject an appeal made in time. Check your notice.`,
      );

      caveats.push(
        'A private parking charge is an alleged breach of contract, not a fine. Nobody can add points to your licence for it and it is not a criminal matter. It can still be pursued through the county court, so ignoring it is not a strategy.',
      );

      if (stage === 'not-appealed') {
        nextSteps.push(
          'Appeal to the parking operator first. You normally have 28 days from the notice, but check the deadline on the notice itself, because it varies.',
          `Lead with your strongest point: ${g.line}`,
          `Attach the evidence: ${g.evidence}`,
          'Ask the operator, in the same letter, to confirm the name of its appeals scheme and to issue a verification code if it rejects you.',
        );
      } else {
        const scheme =
          body === 'bpa'
            ? 'POPLA, the appeals service for British Parking Association members. You normally have 33 days from the date of the rejection notice.'
            : body === 'ipc'
              ? 'the Independent Appeals Service (IAS), used by International Parking Community members. You normally have 21 days from the date of the rejection notice.'
              : 'whichever scheme the rejection letter names. BPA members go to POPLA, normally within 33 days. IPC members go to the IAS, normally within 21 days. The deadlines are different, so read the letter before you assume.';
        nextSteps.push(
          `Escalate to ${scheme}`,
          'You will need the verification or reference code from the rejection letter. Without it the scheme cannot open the case.',
          `Submit every piece of evidence with the appeal, not afterwards: ${g.evidence}`,
          'Keep the appeal to your strongest one or two grounds and evidence them properly.',
        );
        caveats.push(
          'On these schemes you generally cannot add evidence after you submit. Prepare everything first, then file.',
        );
      }

      if (ground === 'not-driver') {
        caveats.push(
          'You are not obliged to name the driver. Do not volunteer it. The question is whether the operator complied with Schedule 4, and that is answered from the notice, not from you.',
        );
      }

      const strong = g.strength === 'strong';
      return {
        tone: g.strength === 'weak' ? 'caution' : strong ? 'yes' : 'maybe',
        tag:
          g.strength === 'weak'
            ? 'Weak ground'
            : strong
              ? 'Worth appealing'
              : 'Arguable, evidence dependent',
        headline:
          g.strength === 'weak'
            ? 'This ground is unlikely to succeed on its own'
            : strong
              ? 'This is a ground worth putting properly'
              : 'This can work, but only with documents behind it',
        reasoning: [g.line],
        nextSteps,
        caveats: [
          `Evidence you need: ${g.evidence}`,
          ...caveats,
          'We will not tell you your odds. Nobody can, and any tool that quotes you a success rate for your specific case is guessing.',
        ],
      };
    }

    // ---- Council PCN
    const inLondon = issuer === 'council-london';
    const adjudicator = inLondon
      ? 'London Tribunals, the independent adjudicator for PCNs issued by London boroughs and Transport for London'
      : 'the Traffic Penalty Tribunal, the independent adjudicator for council PCNs in England outside London and in Wales';
    const discountOpen = days !== null && days <= 14;

    caveats.push(
      discountOpen
        ? `This PCN was issued ${dayText} ago, so the 50% discount for paying within 14 days is probably still open. If you challenge informally within that window and the council rejects it, many councils re-offer the discounted amount for a short further period. Check the wording on your notice.`
        : `This PCN was issued ${dayText} ago, so the 14-day 50% discount has probably lapsed. Where a PCN was served by post following camera enforcement, some schemes run the discount from the date of service rather than the date of the contravention, so check the notice.`,
    );

    if (stage === 'not-appealed') {
      nextSteps.push(
        'Make an informal challenge to the council now, in writing, quoting the PCN number.',
        `State your ground plainly: ${g.line}`,
        `Attach the evidence: ${g.evidence}`,
        'Ask the council to supply its own photographs and the traffic regulation order that creates the restriction. Councils sometimes cannot produce a valid order, and that ends the matter.',
      );
      caveats.push(
        'If the informal challenge is rejected, the council issues a Notice to Owner. You then have 28 days to make formal representations. If those are rejected you get a Notice of Rejection, and 28 days from that to appeal to the adjudicator.',
      );
    } else {
      nextSteps.push(
        `Appeal to ${adjudicator}. You normally have 28 days from the date of the Notice of Rejection.`,
        'It is free and you do not need a solicitor. You can choose a decision on the papers, by telephone or in person.',
        `Put in every document: ${g.evidence}`,
        'Ask the council for its evidence pack in advance and address it directly rather than repeating your original letter.',
      );
    }

    caveats.push(
      'A council PCN is a statutory penalty, not a contract dispute. The grounds for formal representations are set out in the Traffic Management Act 2004 and are narrower than "it seems unfair". Frame your point as one of those statutory grounds.',
    );

    return {
      tone: g.strength === 'weak' ? 'caution' : g.strength === 'strong' ? 'yes' : 'maybe',
      tag:
        g.strength === 'weak'
          ? 'Weak ground'
          : g.strength === 'strong'
            ? 'Worth challenging'
            : 'Arguable, evidence dependent',
      headline:
        g.strength === 'weak'
          ? 'This ground is unlikely to succeed on its own'
          : `Council PCN: ${stage === 'not-appealed' ? 'challenge the council first' : `appeal to ${inLondon ? 'London Tribunals' : 'the Traffic Penalty Tribunal'}`}`,
      reasoning: [g.line],
      nextSteps,
      caveats: [`Evidence you need: ${g.evidence}`, ...caveats],
    };
  }

  return (
    <div className="tool-card">
      <h2>Find your appeal route</h2>
      <p className="tool-card-hint">
        Private land and council tickets are completely different systems with
        different deadlines. Getting the route wrong burns the deadline. This
        runs in your browser and stores nothing.
      </p>

      <div className="tool-fields is-two">
        <Field
          label="Who issued the ticket?"
          htmlFor="pk-issuer"
          full
          help="A council PCN is a statutory penalty. A private parking charge is an alleged breach of contract. Your notice will say which."
        >
          <select id="pk-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value as Issuer)}>
            <option value="">Choose one</option>
            <option value="private">A private parking company, on private land</option>
            <option value="council">A council, outside London (or in Wales)</option>
            <option value="council-london">A London borough or Transport for London</option>
            <option value="police">The police or the DVLA</option>
          </select>
        </Field>

        {isPrivate ? (
          <Field
            label="Which trade body is the operator in?"
            htmlFor="pk-body"
            help="Usually printed at the foot of the notice. It decides whether you go to POPLA or the IAS, and the deadlines differ."
          >
            <select id="pk-body" value={body} onChange={(e) => setBody(e.target.value as Body)}>
              <option value="">Choose one</option>
              <option value="bpa">British Parking Association (goes to POPLA)</option>
              <option value="ipc">International Parking Community (goes to the IAS)</option>
              <option value="unknown">I do not know</option>
            </select>
          </Field>
        ) : null}

        <Field label="Where are you in the process?" htmlFor="pk-stage">
          <select id="pk-stage" value={stage} onChange={(e) => setStage(e.target.value as Stage)}>
            <option value="">Choose one</option>
            <option value="not-appealed">I have not challenged it yet</option>
            <option value="rejected">I challenged it and they rejected me</option>
          </select>
        </Field>

        <Field label="Date the ticket was issued" htmlFor="pk-date">
          <input
            id="pk-date"
            type="date"
            value={issuedOn}
            onChange={(e) => setIssuedOn(e.target.value)}
          />
        </Field>

        <Field
          label="What is your strongest single ground?"
          htmlFor="pk-ground"
          full
          help="Pick the best one, not all of them. Padding an appeal with weak points invites the operator to knock them down."
        >
          <select id="pk-ground" value={ground} onChange={(e) => setGround(e.target.value as Ground)}>
            <option value="">Choose one</option>
            <option value="signage">The signs were unclear, unlit or not visible from where I parked</option>
            <option value="payment-made">I paid, but the registration was keyed wrongly</option>
            <option value="permit">I had a valid permit, ticket or entitlement to be there</option>
            <option value="not-driver">I am the registered keeper but I was not the driver</option>
            <option value="breakdown">The vehicle broke down, or there was an emergency</option>
            <option value="overstay-minutes">I overstayed by only a few minutes</option>
            <option value="contravention-wrong">The contravention did not happen or the restriction was not properly signed</option>
            <option value="amount">The charge is too high</option>
            <option value="none">I do not have a specific factual ground yet</option>
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
          Check my route
        </button>
        {verdict ? (
          <button
            type="button"
            className="btn btn-ghost btn-lg"
            onClick={() => {
              setIssuer('');
              setBody('');
              setStage('');
              setIssuedOn('');
              setGround('');
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
