import type { Metadata } from 'next';
import ToolShell from '../_components/ToolShell';
import ParkingAppealChecker from '../_components/ParkingAppealChecker';
import { PARKING_FILING, PARKING_SOURCES } from '../_data/sources';

const SLUG = 'parking-ticket-appeal-checker';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Parking Ticket Appeal Checker UK — Free, No Signup | Paybacker',
  description:
    'Find the right appeal route and deadline for a private parking charge or a council PCN: POPLA, the IAS, the Traffic Penalty Tribunal or London Tribunals. Free checker, no account. Honest about which grounds actually work.',
  keywords: [
    'parking ticket appeal',
    'POPLA appeal',
    'private parking charge appeal',
    'PCN appeal UK',
    'parking charge notice appeal deadline',
  ],
  openGraph: {
    title: 'Parking Ticket Appeal Checker UK — Free, No Signup',
    description:
      'Private land or council? POPLA, the IAS or the Traffic Penalty Tribunal? Get the right route, the deadline, and an honest read on whether your ground is strong enough to file.',
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
      h1="Parking ticket appeal checker"
      intro="Private parking charges and council PCNs are completely different systems with different appeal bodies and different deadlines. Get the right route, work out whether the reduced amount is still available, and get a straight answer on whether your ground is worth filing. No account, nothing stored."
      calculator={<ParkingAppealChecker />}
      honesty={{
        title: 'Read this before you send a generic appeal',
        paragraphs: [
          'POPLA, the appeals service for British Parking Association members, has said publicly that generic, template appeals are typically rejected, while specific and personalised grounds succeed. That is not a marketing line, it is the assessors telling you how they decide. They read hundreds of these a week and an appeal that could have been written about any car park in the country reads exactly like what it is.',
          'So this tool will sometimes tell you not to appeal yet. If you have not photographed the signs, found the payment record, or checked the notice against Schedule 4 of the Protection of Freedoms Act 2012, then filing today spends your one submission on nothing. On most schemes you cannot add evidence after you file.',
          'We also will not build you an appeal around the charge being too expensive. In ParkingEye v Beavis the Supreme Court held that an £85 private parking charge was not an unenforceable penalty. An appeal built on the amount alone loses, and including it alongside a good ground gives the operator something easy to knock down.',
          'And we will not quote you a success rate. Nobody can honestly tell you the odds on your specific ticket, because they turn on evidence the operator holds.',
        ],
      }}
      explainers={[
        {
          heading: 'A private parking charge is not a fine',
          paragraphs: [
            'A charge issued by a private company on private land, such as a retail park, a hospital car park or a residential development, is an alleged breach of contract. The contract is the sign. Nobody can put points on your licence for it and it is not a criminal matter.',
            'That does not mean you can ignore it. The operator can pursue you through the county court, and an unpaid charge can become a judgment. Ignoring is not a strategy, it is a slower version of paying more.',
            'The appeal runs in two stages. First you challenge the operator directly, normally within 28 days, though check the notice because it varies. If the operator rejects you, it must give you a code to take the case to its trade body’s appeals service: POPLA for British Parking Association members, the Independent Appeals Service for International Parking Community members. POPLA normally allows 33 days from the rejection, the IAS normally 21. Sending it to the wrong scheme wastes the deadline.',
            'Most operators reduce the charge if you pay within 14 days. That discount comes from the trade body code of practice, not from statute, so check the figure and the deadline printed on your own notice rather than relying on a general rule.',
          ],
        },
        {
          heading: 'Schedule 4 keeper liability, the ground operators most often get wrong',
          paragraphs: [
            'If you were not the driver, the operator can only pursue you as the registered keeper by complying with Schedule 4 of the Protection of Freedoms Act 2012. This is the strongest technical ground in private parking and it is worth checking properly.',
            'Schedule 4 requires the operator to serve a notice to keeper within a prescribed period, containing prescribed information: an invitation to identify the driver, a warning that the keeper may become liable, and specified detail about the charge and the period of parking. Get the timing or the wording wrong and keeper liability simply does not arise.',
            'You are under no obligation to name the driver. Do not volunteer it. The question is whether the notice complied, and that is answered from the document in front of you, not from anything you say.',
            'This is also why a generic appeal is such a waste. Checking a notice against Schedule 4 takes fifteen minutes and either wins the case outright or takes it off the table. A template letter does neither.',
          ],
        },
        {
          heading: 'Council PCNs run on a statutory timetable',
          paragraphs: [
            'A penalty charge notice issued by a council is a statutory penalty under Part 6 of the Traffic Management Act 2004. The grounds for challenging it are set out in legislation and are narrower than "this seems unfair". Frame your point as one of the statutory grounds and it gets taken seriously.',
            'The timetable is fixed. Pay within 14 days and the penalty is normally halved. If you challenge informally within that window and the council rejects you, many councils re-offer the discount for a short further period, so challenging early costs you little.',
            'If the informal challenge fails, the council issues a Notice to Owner. You then have 28 days to make formal representations. If those are rejected you receive a Notice of Rejection, and 28 days from that date to appeal to an independent adjudicator. In London that is London Tribunals. Everywhere else in England, and in Wales, it is the Traffic Penalty Tribunal.',
            'Appealing to the adjudicator is free and you do not need a solicitor. Ask the council for its evidence pack in advance and address it directly, rather than resubmitting the letter that was already rejected.',
          ],
        },
      ]}
      sources={PARKING_SOURCES}
      filing={PARKING_FILING}
      faqs={[
        {
          q: 'What is the difference between a PCN from a council and one from a private company?',
          a: 'A council penalty charge notice is a statutory penalty under the Traffic Management Act 2004, with a fixed representations and appeal timetable ending at an independent adjudicator. A private parking charge is an alleged breach of the contract on the signs, enforced through the civil courts, with an appeal to the operator’s trade body scheme. Confusingly, private operators often use the letters PCN too. Look at who issued it.',
        },
        {
          q: 'Do I go to POPLA or the IAS?',
          a: 'It depends which trade body the operator belongs to, usually printed at the foot of the notice. British Parking Association members go to POPLA, normally within 33 days of the rejection. International Parking Community members go to the Independent Appeals Service, normally within 21 days. The deadlines are different and neither scheme can hear a case about the other’s members.',
        },
        {
          q: 'Can I appeal on the basis that the charge is too expensive?',
          a: 'You can, but it is very unlikely to work. In ParkingEye v Beavis the Supreme Court held that an £85 private parking charge was not an unenforceable penalty, because the operator had a legitimate interest in managing turnover in the car park. Appeals built on the amount alone fail. Put your effort into signage, the payment record or Schedule 4 compliance instead.',
        },
        {
          q: 'I was not the driver. Do I have to say who was?',
          a: 'No. On private land the operator can only hold you liable as registered keeper if it complied with Schedule 4 of the Protection of Freedoms Act 2012, including serving a compliant notice to keeper in the prescribed window. Check the notice against those requirements. You are not obliged to name the driver and you should not volunteer it.',
        },
        {
          q: 'Does appealing lose me the discount?',
          a: 'On a council PCN, challenging informally within the first 14 days is generally safe, because many councils re-offer the discounted amount for a short period if they reject you. On a private charge the position varies by operator, so read what your notice says about what happens to the reduced amount if you appeal.',
        },
        {
          q: 'Should I just ignore a private parking charge?',
          a: 'No. Private operators do use the county court and an unpaid charge can turn into a judgment that affects your credit file. Ignoring makes the position worse and removes your appeal rights. Either appeal properly or pay while the reduced amount is still available.',
        },
      ]}
      cta={{
        title: 'Got a real ground? Write it up properly.',
        body: 'Once you have a specific, evidenced ground, the appeal has to say the right things in the right order and cite the right provision. Paybacker drafts it from your facts, not from a template, and then tracks the deadline so you do not lose the case to a calendar.',
      }}
    />
  );
}
