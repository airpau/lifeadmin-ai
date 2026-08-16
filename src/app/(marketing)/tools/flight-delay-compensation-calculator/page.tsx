import type { Metadata } from 'next';
import ToolShell from '../_components/ToolShell';
import FlightDelayCalculator from '../_components/FlightDelayCalculator';
import { FLIGHT_FILING, FLIGHT_SOURCES } from '../_data/sources';

const SLUG = 'flight-delay-compensation-calculator';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Flight Delay Compensation Calculator UK — Free, No Signup | Paybacker',
  description:
    'Work out what a delayed or cancelled flight is worth under UK261: £220, £260, £350 or £520 per passenger. Free calculator, no account needed. Cites Regulation (EC) 261/2004 as retained in UK law.',
  keywords: [
    'flight delay compensation calculator',
    'UK261 compensation',
    'flight delay compensation UK',
    'cancelled flight compensation calculator',
    'EU261 UK',
  ],
  openGraph: {
    title: 'Flight Delay Compensation Calculator UK — Free, No Signup',
    description:
      'Check whether your delayed or cancelled flight qualifies for £220 to £520 per passenger under UK261, and see the defence the airline is likely to run.',
    url: URL,
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: URL },
};

export default function Page() {
  return (
    <ToolShell
      slug={SLUG}
      h1="Flight delay compensation calculator"
      intro="Check what a delayed, cancelled or overbooked flight is actually worth under UK261, which distance band applies, and what defence the airline is likely to run. No account, no email, nothing stored."
      calculator={<FlightDelayCalculator />}
      honesty={{
        title: 'Two things most flight calculators get wrong',
        paragraphs: [
          'First, the £520 band. It only applies to flights over 3,500km where one end is outside the UK, EU or EEA. On a flight where both airports are inside that area, the maximum is £350 however far you flew. A calculator that quotes you £520 for a long domestic-area flight is setting you up to be knocked back by the airline.',
          'Second, the halving rule. On a flight over 3,500km delayed between 3 and 4 hours, Article 7(2) allows the amount to be reduced by half, so the realistic figure is £260, not £520. Airlines apply this and the Civil Aviation Authority accepts it. We show you £260, because quoting £520 and then being corrected by the airline weakens the rest of your claim.',
          'We also will not tell you your odds. The extraordinary circumstances defence turns on evidence the airline holds and we cannot see. Anyone quoting you a success rate for your specific flight is guessing.',
        ],
      }}
      explainers={[
        {
          heading: 'How UK261 compensation actually works',
          paragraphs: [
            'Regulation (EC) No 261/2004 was retained in UK law after Brexit and converted into sterling amounts by The Air Passenger Rights and Air Travel Organisers’ Licensing (Amendment) (EU Exit) Regulations 2019. The result is what everyone calls UK261.',
            'It covers flights departing from any UK airport on any airline, and flights arriving in the UK where the operating carrier is a UK or EU airline. The operating carrier is what matters, not whose code is on the ticket. On a codeshare, look at who actually flew the aircraft.',
            'Compensation is fixed by distance band and by how late you arrived, not by what you paid for the ticket. Somebody on a £40 fare and somebody on a £900 fare on the same flight get the same amount. It is compensation for the disruption, not a refund of the fare, and if your flight never operated you may be entitled to a refund as well.',
            'The threshold is three hours late at your final destination. Arrival time means when the aircraft door was opened, which can be fifteen or twenty minutes after touchdown. If you were close to the three-hour line, that difference is worth pinning down before you accept a refusal.',
          ],
        },
        {
          heading: 'Extraordinary circumstances, and why airlines lean on it',
          paragraphs: [
            'An airline does not have to pay compensation if it proves the delay was caused by extraordinary circumstances that could not have been avoided even if all reasonable measures had been taken. The burden of proof sits with the airline, not with you, and that matters more than most passengers realise.',
            'The defence is narrower than airlines suggest. Routine technical faults, crew shortages and rostering problems are inherent in the normal business of running an airline and are generally not extraordinary. A strike by the airline’s own staff is generally not extraordinary either, because industrial relations are part of running the business.',
            'What usually does qualify: severe weather, air traffic control restrictions and ATC strikes, airport security incidents, and onboard medical emergencies. Even then, the airline has to show it took all reasonable measures. If other aircraft were departing that airport around the same time, that is a fair question to put to them.',
            'The single most useful thing you can do is ask the airline, in writing, to state the specific extraordinary circumstance it relies on and the reasonable measures it took. A vague answer, or no answer, is the strongest thing you can take to the ombudsman.',
          ],
        },
        {
          heading: 'Your right to care applies even when compensation does not',
          paragraphs: [
            'Article 9 gives you a right to care during a long delay regardless of the cause. That means free food and drink appropriate to the wait, two free telephone calls or emails, and hotel accommodation plus transfers if you have to stay overnight.',
            'The threshold depends on distance: two hours for flights under 1,500km, three hours for flights between 1,500km and 3,500km and for longer flights inside the UK and EU, and four hours for everything else.',
            'This right survives extraordinary circumstances. Even where the delay was caused by weather and no compensation is payable, the airline still had to look after you. If it left you to buy your own food or book your own hotel, keep the receipts and claim those costs back separately. It is a common and often overlooked recovery.',
          ],
        },
      ]}
      sources={FLIGHT_SOURCES}
      filing={FLIGHT_FILING}
      faqs={[
        {
          q: 'Does UK261 apply to all airlines flying from UK airports?',
          a: 'Yes. UK261 covers flights departing from any UK airport regardless of the airline’s nationality. It also covers flights arriving in the UK where the operating carrier is a UK or EU airline. On a codeshare, what matters is who actually operated the flight, not whose code is on your ticket.',
        },
        {
          q: 'Is it the departure delay or the arrival delay that counts?',
          a: 'The arrival delay. Compensation turns on how late you reached your final destination, measured to the moment the aircraft door was opened. A flight can leave four hours late and still arrive under three hours late, in which case no compensation is due. It also works the other way round.',
        },
        {
          q: 'Why does your calculator say £260 when other sites say £520?',
          a: 'For flights over 3,500km delayed between 3 and 4 hours, Article 7(2) of the Regulation allows the compensation to be reduced by 50 per cent. Airlines apply that reduction and the Civil Aviation Authority accepts it. We show £260 because claiming £520 in that scenario invites a correction that undermines the rest of your letter. Once the delay passes four hours, the full £520 applies.',
        },
        {
          q: 'How far back can I claim?',
          a: 'In England and Wales the limitation period for a contract claim is six years under section 5 of the Limitation Act 1980. In Scotland it is five years under separate legislation. Time normally runs from the date of the flight. An older claim can be refused on limitation grounds alone, so if you are near the line, file now.',
        },
        {
          q: 'What if the airline just ignores me?',
          a: 'Give it eight weeks from your written claim, then take it free of charge to the aviation ADR body your airline belongs to, which is either CEDR or AviationADR. Check which one before filing, because sending it to the wrong scheme wastes time. The scheme’s decision is binding on member airlines.',
        },
        {
          q: 'Do children and infants get compensation too?',
          a: 'A child occupying their own seat is a passenger and is entitled to the same amount as an adult. An infant travelling on a lap on a free or heavily discounted ticket not available to the public is generally excluded, because the Regulation does not apply to passengers travelling free or on a reduced fare not available directly or indirectly to the public.',
        },
      ]}
      cta={{
        title: 'Know the amount. Now get the letter written.',
        body: 'The calculator is the easy part. Paybacker drafts the claim letter with the right articles cited, tracks whether the airline replies, runs the eight-week clock, and tells you when it is time to escalate to ADR.',
      }}
    />
  );
}
