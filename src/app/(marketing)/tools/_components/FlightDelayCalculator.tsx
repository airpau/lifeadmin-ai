'use client';

import { useState } from 'react';
import { Field, ResultCard, type Verdict } from './ResultCard';

/**
 * UK261 flight compensation checker.
 *
 * Amounts come from The Air Passenger Rights and Air Travel Organisers'
 * Licensing (Amendment) (EU Exit) Regulations 2019, which converted the
 * euro figures in Regulation (EC) 261/2004 into sterling.
 *
 * Two details this deliberately gets right where simpler calculators do
 * not:
 *
 *  1. On a flight where BOTH airports are in the UK, EU or EEA, the top
 *     band is £350 no matter how long the flight is. The £520 band only
 *     applies to flights over 3,500km where one end is outside that
 *     area.
 *  2. On a long-haul flight delayed 3 to under 4 hours, the amount is
 *     halved to £260 under Article 7(2). Airlines apply this and so
 *     does the CAA, so quoting £520 would set the passenger up to be
 *     knocked back.
 */

type Scope = 'departed-uk' | 'arrived-uk' | 'departed-eu' | 'none' | '';
type Route = 'internal' | 'external' | '';
type Band = 'short' | 'medium' | 'long' | '';
type Event = 'delay' | 'cancelled' | 'denied-boarding' | '';
type DelayBand = 'under2' | '2to3' | '3to4' | 'over4' | '';
type Reason =
  | 'technical'
  | 'crew'
  | 'knock-on'
  | 'weather'
  | 'atc'
  | 'airline-strike'
  | 'security'
  | 'none-given'
  | '';
type Age = 'under5' | '5to6' | 'over6' | '';

const CARE_THRESHOLD: Record<string, string> = {
  short: '2 hours',
  medium: '3 hours',
  long: '4 hours',
};

const REASON_ANALYSIS: Record<Exclude<Reason, ''>, { line: string; strong: boolean }> = {
  technical: {
    line:
      'A routine technical fault is generally not an extraordinary circumstance. The courts have repeatedly held that mechanical problems are inherent in the normal activity of running an airline. Expect the airline to try the defence anyway, and expect it to fail unless the fault was a hidden manufacturing defect or sabotage.',
    strong: true,
  },
  crew: {
    line:
      'Crew shortages and rostering problems are within the airline’s control and are generally not extraordinary circumstances.',
    strong: true,
  },
  'knock-on': {
    line:
      'A knock-on delay from an earlier rotation is generally not extraordinary in itself. The airline has to show the original cause was extraordinary AND that it took all reasonable measures to avoid the effect on your flight.',
    strong: true,
  },
  weather: {
    line:
      'Severe weather can be an extraordinary circumstance, so this is the airline’s strongest defence. It still has to prove the weather actually affected your flight and that it took all reasonable measures. If other aircraft were departing that airport around the same time, that is worth putting to them.',
    strong: false,
  },
  atc: {
    line:
      'Air traffic control restrictions and ATC strikes are generally accepted as extraordinary circumstances outside the airline’s control. Compensation is unlikely, though your right to care still applies.',
    strong: false,
  },
  'airline-strike': {
    line:
      'A strike by the airline’s own staff is generally not treated as an extraordinary circumstance, because industrial relations are part of running the business. This is different from an ATC or airport staff strike.',
    strong: true,
  },
  security: {
    line:
      'A security incident or an onboard medical emergency is normally an extraordinary circumstance. Compensation is unlikely, though your right to care still applies.',
    strong: false,
  },
  'none-given': {
    line:
      'No reason was given. The burden of proof is on the airline, not on you. If it wants to avoid paying it has to state and evidence the extraordinary circumstance. Silence is not a defence.',
    strong: true,
  },
};

function amountFor(route: Route, band: Band, delay: DelayBand): { value: number; halved: boolean } | null {
  if (band === 'short') return { value: 220, halved: false };
  if (band === 'medium') return { value: 350, halved: false };
  if (band === 'long') {
    // Both ends inside the UK/EU/EEA caps at £350 however long the flight.
    if (route === 'internal') return { value: 350, halved: false };
    if (delay === '3to4') return { value: 260, halved: true };
    return { value: 520, halved: false };
  }
  return null;
}

export default function FlightDelayCalculator() {
  const [scope, setScope] = useState<Scope>('');
  const [route, setRoute] = useState<Route>('');
  const [band, setBand] = useState<Band>('');
  const [event, setEvent] = useState<Event>('');
  const [delay, setDelay] = useState<DelayBand>('');
  const [reason, setReason] = useState<Reason>('');
  const [age, setAge] = useState<Age>('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const needsDelay = event === 'delay';
  const ready =
    scope !== '' && route !== '' && band !== '' && event !== '' && reason !== '' && age !== '' &&
    (!needsDelay || delay !== '');

  function evaluate(): Verdict {
    const caveats: string[] = [];
    const careLine = `Whatever the cause, you had a right to care once the delay passed ${CARE_THRESHOLD[band] ?? '2 hours'}: free food and drink appropriate to the wait, two free communications, and a hotel plus transfers if you had to stay overnight. If the airline left you to buy your own, keep the receipts and claim them back separately. That right applies even when compensation does not.`;

    if (scope === 'none') {
      return {
        tone: 'no',
        tag: 'Outside UK261',
        headline: 'UK261 does not cover this flight',
        reasoning: [
          'UK261 covers flights departing any UK airport on any airline, and flights arriving in the UK operated by a UK or EU carrier. A flight that meets neither test falls outside it.',
          'EU261 may still cover you if you departed an EU airport. Otherwise you are on the airline’s conditions of carriage and the law of the country of departure.',
        ],
        nextSteps: [
          'Check the airline’s conditions of carriage for its own delay policy.',
          'If you booked a package holiday, the Package Travel Regulations may give you a separate route against the tour operator.',
          'If you paid by credit card and the cash price was over £100, a section 75 claim against your card provider may be open to you.',
        ],
        caveats: [
          'Codeshares can be confusing. What matters is the operating carrier, not the airline whose code is on the ticket.',
          careLine,
        ],
      };
    }

    if (age === 'over6') {
      caveats.push(
        'You told us the flight was more than six years ago. In England and Wales the limitation period for a contract claim is six years under section 5 of the Limitation Act 1980, and in Scotland it is five. An out-of-time claim can be refused on that basis alone. It costs nothing to ask, but expect that answer.',
      );
    } else if (age === '5to6') {
      caveats.push(
        'This flight is close to the six-year limit in England and Wales, and already past the five-year limit in Scotland. If you are going to claim, do it now.',
      );
    }

    if (event === 'denied-boarding') {
      const amt = amountFor(route, band, 'over4');
      return {
        tone: 'yes',
        tag: 'Likely eligible',
        headline: 'Denied boarding against your will normally attracts compensation immediately',
        amount: amt ? `£${amt.value}` : undefined,
        amountNote:
          'Denied boarding compensation does not depend on how long you were delayed. It is payable as soon as you are refused carriage against your will.',
        reasoning: [
          'Under Article 4, if you were denied boarding against your will after checking in on time, the airline owes compensation plus either a refund or re-routing.',
          'The three-hour delay test does not apply to denied boarding.',
        ],
        nextSteps: [
          'Write to the airline citing Article 4 and Article 7 of Regulation (EC) 261/2004 as retained in UK law, and state the amount.',
          'Say clearly that you did not volunteer to give up your seat.',
          'If the airline refuses or does not reply within eight weeks, take it to the aviation ADR body your airline belongs to.',
        ],
        caveats: [
          'If you volunteered to give up your seat in exchange for benefits, you gave up the right to this compensation.',
          'Compensation can be refused if you did not present for check-in on time, or if you were denied boarding on reasonable grounds such as health, safety or inadequate travel documents.',
          careLine,
          ...caveats,
        ],
      };
    }

    if (event === 'cancelled') {
      const amt = amountFor(route, band, 'over4');
      const analysis = REASON_ANALYSIS[reason as Exclude<Reason, ''>];
      return {
        tone: analysis?.strong ? 'maybe' : 'caution',
        tag: 'Depends on the notice and the re-routing',
        headline: 'A cancellation can attract the same amounts, but the detail decides it',
        amount: amt ? `up to £${amt.value}` : undefined,
        amountNote:
          'We have shown the full band amount. The actual figure can be halved, or reduced to nothing, depending on how much notice you were given and what re-routing you were offered.',
        reasoning: [
          'If the airline told you more than 14 days before departure, no compensation is due.',
          'Between 14 and 7 days before departure, compensation is avoided only if the re-routing left no more than 2 hours early and got you there less than 4 hours late.',
          'Less than 7 days before departure, compensation is avoided only if the re-routing left no more than 1 hour early and got you there less than 2 hours late.',
          analysis?.line ?? '',
        ].filter(Boolean),
        nextSteps: [
          'Find the cancellation email or text and note the exact date and time it was sent. That timestamp decides the notice period.',
          'Note the scheduled and actual arrival times of the replacement flight you were put on.',
          'Write to the airline citing Articles 5 and 7, setting out the notice period and the re-routing times.',
          'If the airline refuses or is silent for eight weeks, escalate to its aviation ADR body.',
        ],
        caveats: [
          'You are also entitled to choose between a full refund and re-routing. Accepting a voucher instead can weaken your position, so read what you are agreeing to.',
          careLine,
          ...caveats,
        ],
      };
    }

    // Delay path
    if (delay === 'under2' || delay === '2to3') {
      return {
        tone: 'no',
        tag: 'No compensation',
        headline: 'A delay under 3 hours on arrival does not attract UK261 compensation',
        reasoning: [
          'Compensation under UK261 turns on how late you ARRIVED, not how late you departed. The threshold is three hours at the destination.',
          'Below that threshold no compensation is payable, however inconvenient the delay was.',
        ],
        nextSteps: [
          `Check your right to care instead. On this flight it starts at ${CARE_THRESHOLD[band] ?? '2 hours'}.`,
          'If you paid for meals, calls or a hotel because the airline provided nothing, claim those costs back with receipts.',
          'If you missed a connection or an onward booking as a result, that can be a separate claim depending on how the tickets were booked.',
        ],
        caveats: [
          'Arrival time means when the aircraft door was opened, not when it touched down. If you were close to three hours, the difference can matter and it is worth checking.',
          careLine,
        ],
      };
    }

    const amt = amountFor(route, band, delay as DelayBand);
    const analysis = REASON_ANALYSIS[reason as Exclude<Reason, ''>];
    const strong = analysis?.strong ?? false;

    const reasoning: string[] = [];
    if (route === 'internal' && band === 'long') {
      reasoning.push(
        'Both airports are inside the UK, EU or EEA. On those routes the top band is £350 regardless of distance, so the £520 figure you may have seen elsewhere does not apply here.',
      );
    }
    if (amt?.halved) {
      reasoning.push(
        'This is a flight over 3,500km delayed between 3 and 4 hours. Article 7(2) allows the amount to be reduced by half, so the realistic figure is £260 rather than £520. Airlines apply this reduction and the CAA accepts it.',
      );
    }
    reasoning.push(
      'You arrived at least three hours late, which is the threshold set by the retained Regulation as interpreted by the courts.',
    );
    if (analysis) reasoning.push(analysis.line);

    return {
      tone: strong ? 'yes' : 'caution',
      tag: strong ? 'Likely eligible' : 'Eligible in principle, but expect a defence',
      headline: strong
        ? 'On these facts a compensation claim is worth making'
        : 'The amount is right, but the reason given is the airline’s best defence',
      amount: amt ? `£${amt.value}` : undefined,
      amountNote: 'Per passenger, including children with their own seat.',
      reasoning,
      nextSteps: [
        'Gather your booking reference, the flight number, and the scheduled and actual arrival times.',
        'Write to the airline citing Articles 5, 6 and 7 of Regulation (EC) 261/2004 as retained in UK law, and state the amount per passenger.',
        'Ask the airline to state, in writing, the specific extraordinary circumstance it relies on and the reasonable measures it took. Most claims are won on that reply.',
        'If it refuses or does not respond within eight weeks, escalate free of charge to the aviation ADR body your airline belongs to.',
      ],
      caveats: [
        'Compensation is not payable if the airline proves an extraordinary circumstance that could not have been avoided even with all reasonable measures. The burden is on the airline, but it does sometimes discharge it.',
        'This is compensation, not a refund of the fare. If you did not fly at all you may also be entitled to a refund, which is separate.',
        careLine,
        ...caveats,
      ],
    };
  }

  return (
    <div className="tool-card">
      <h2>Check a UK261 claim</h2>
      <p className="tool-card-hint">
        Six questions. Nothing is sent anywhere and nothing is stored. The
        calculation runs in your browser.
      </p>

      <div className="tool-fields is-two">
        <Field
          label="Which of these describes the flight?"
          htmlFor="fd-scope"
          full
          help="UK261 covers departures from UK airports on any airline, and arrivals into the UK on a UK or EU airline."
        >
          <select id="fd-scope" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            <option value="">Choose one</option>
            <option value="departed-uk">It departed from a UK airport</option>
            <option value="arrived-uk">It arrived in the UK on a UK or EU airline</option>
            <option value="departed-eu">It departed from an EU or EEA airport</option>
            <option value="none">None of these</option>
          </select>
        </Field>

        <Field label="Were both airports in the UK, EU or EEA?" htmlFor="fd-route">
          <select id="fd-route" value={route} onChange={(e) => setRoute(e.target.value as Route)}>
            <option value="">Choose one</option>
            <option value="internal">Yes, both</option>
            <option value="external">No, one was outside</option>
          </select>
        </Field>

        <Field
          label="How far was the flight?"
          htmlFor="fd-band"
          help="Great circle distance between the two airports."
        >
          <select id="fd-band" value={band} onChange={(e) => setBand(e.target.value as Band)}>
            <option value="">Choose one</option>
            <option value="short">Under 1,500km (London to Dublin, Paris, Amsterdam)</option>
            <option value="medium">1,500km to 3,500km (London to Athens, Tenerife, Marrakesh)</option>
            <option value="long">Over 3,500km (London to New York, Dubai, Delhi)</option>
          </select>
        </Field>

        <Field label="What happened?" htmlFor="fd-event">
          <select id="fd-event" value={event} onChange={(e) => setEvent(e.target.value as Event)}>
            <option value="">Choose one</option>
            <option value="delay">The flight was delayed</option>
            <option value="cancelled">The flight was cancelled</option>
            <option value="denied-boarding">I was denied boarding against my will</option>
          </select>
        </Field>

        {needsDelay ? (
          <Field
            label="How late did you ARRIVE?"
            htmlFor="fd-delay"
            help="Arrival delay is what counts, not departure delay. Measured to the moment the aircraft door opened."
          >
            <select id="fd-delay" value={delay} onChange={(e) => setDelay(e.target.value as DelayBand)}>
              <option value="">Choose one</option>
              <option value="under2">Under 2 hours</option>
              <option value="2to3">2 to under 3 hours</option>
              <option value="3to4">3 to under 4 hours</option>
              <option value="over4">4 hours or more</option>
            </select>
          </Field>
        ) : null}

        <Field label="What reason did the airline give?" htmlFor="fd-reason">
          <select id="fd-reason" value={reason} onChange={(e) => setReason(e.target.value as Reason)}>
            <option value="">Choose one</option>
            <option value="technical">Technical or mechanical fault</option>
            <option value="crew">Crew shortage or rostering</option>
            <option value="knock-on">Knock-on delay from an earlier flight</option>
            <option value="weather">Severe weather</option>
            <option value="atc">Air traffic control restriction or ATC strike</option>
            <option value="airline-strike">Strike by the airline’s own staff</option>
            <option value="security">Security incident or medical emergency</option>
            <option value="none-given">No reason given</option>
          </select>
        </Field>

        <Field label="When was the flight?" htmlFor="fd-age">
          <select id="fd-age" value={age} onChange={(e) => setAge(e.target.value as Age)}>
            <option value="">Choose one</option>
            <option value="under5">Within the last 5 years</option>
            <option value="5to6">Between 5 and 6 years ago</option>
            <option value="over6">More than 6 years ago</option>
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
              setScope('');
              setRoute('');
              setBand('');
              setEvent('');
              setDelay('');
              setReason('');
              setAge('');
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
