import type { Metadata } from 'next';
import ToolShell from '../_components/ToolShell';
import BroadbandPriceRiseChecker from '../_components/BroadbandPriceRiseChecker';
import { TELECOMS_FILING, TELECOMS_SOURCES } from '../_data/sources';

const SLUG = 'broadband-price-rise-checker';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Broadband and Mobile Price Rise Checker — Free, No Signup | Paybacker',
  description:
    'Check whether a mid-contract price rise was notified properly and whether you have a penalty-free right to leave under the Ofcom General Conditions. Free checker, no account. Cites the actual rule, not the Consumer Rights Act.',
  keywords: [
    'broadband price rise right to exit',
    'mid contract price rise',
    'mobile price increase leave contract',
    'Ofcom General Conditions price rise',
    'cancel broadband price increase without penalty',
  ],
  openGraph: {
    title: 'Broadband and Mobile Price Rise Checker — Free, No Signup',
    description:
      'Can you leave without an exit fee? It depends on what you were told before you signed, not on how big the rise is. Check in under a minute.',
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
      h1="Broadband and mobile price rise checker"
      intro="Your provider has put the price up mid-contract. Whether you can walk away without an exit fee turns on what you were told before you signed, not on how big the rise is. Check which rule applies to you. No account, nothing stored."
      calculator={<BroadbandPriceRiseChecker />}
      honesty={{
        title: 'The law here is Ofcom, not the Consumer Rights Act',
        paragraphs: [
          'This is worth being precise about, because we have seen free tools get it wrong and it matters. A mid-contract price rise on broadband or mobile is governed by the Ofcom General Conditions of Entitlement, specifically Condition C1. It is not governed by section 9 of the Consumer Rights Act 2015, and it is not governed by the 14-day cancellation right in the Consumer Contracts Regulations 2013.',
          'Section 9 of the Consumer Rights Act is the satisfactory quality right, and it applies to GOODS. Broadband and mobile are services. The equivalent service provisions are sections 49 to 52 of the same Act, and they are about how the service is performed, not about what it costs. Citing section 9 in a complaint about a price rise tells the provider’s complaints team that you have looked the wrong thing up, and they will say so.',
          'The 14-day cooling-off period is equally beside the point. It runs from the day the contract was made. It does not restart because the price went up eighteen months later. Building a complaint on it gets it closed.',
          'The rule that actually gives you a right to leave is Condition C1: the price you will pay has to be in the contract information before you sign, and a modification likely to be of material detriment needs at least one month’s notice and a penalty-free exit. Ofcom expressly treats a rise in the core subscription price during a fixed term as likely to be of material detriment. That is the sentence to put in your letter.',
        ],
      }}
      explainers={[
        {
          heading: 'The one question that decides it',
          paragraphs: [
            'Everything turns on what you were told about future prices before you signed, and it produces three quite different answers.',
            'If the provider stated the exact new price in pounds and pence, with the date it takes effect, before you signed, then the rise is a term of the contract rather than a change to it. You generally have no penalty-free exit right when it happens. That is the rule working as designed, and we will tell you so rather than pretend otherwise.',
            'If nothing was said about future rises at all, the increase is a modification of the contract. Condition C1 then requires at least one month’s notice and gives you a right to exit without penalty. This is the strongest position you can be in.',
            'If the contract used an inflation-linked formula, CPI or RPI plus a percentage, the answer depends on one date. From 17 January 2025 Ofcom requires in-contract rises to be stated up front in pounds and pence, and inflation-linked terms are no longer permitted in new contracts. A contract entered on or after that date with an inflation-linked rise does not comply. A contract entered before it, where the term was properly disclosed, generally does, and there is generally no exit right.',
          ],
        },
        {
          heading: 'Why the date you signed matters more than you think',
          paragraphs: [
            'People assume they signed years ago and that the date is fixed. Usually it is not. Upgrading your package, taking a new handset, renewing at the end of a term, or accepting a retention offer normally creates a NEW contract with a new date and a new minimum term.',
            'So a customer who has been with the same provider since 2019 but re-contracted in March 2025 is on a post-rule-change contract, and the inflation-linked ban applies to them. That is a completely different answer from the one their contract history suggests.',
            'Find the order confirmation email or the contract information document for the CURRENT contract. That date is the one that counts. If you cannot find it, the provider has to keep it and you can ask for a copy.',
          ],
        },
        {
          heading: 'How to use the exit right without losing it',
          paragraphs: [
            'A right to exit is not a refund and it is not a licence to stop paying. It lets you leave without an early termination charge. You still pay for service you have used, and any separate balance on a handset or a router instalment plan usually survives the contract ending.',
            'It is also time-limited in practice. The right is tied to the notice of the change, so exercising it promptly matters. Waiting three months and then complaining about a rise you did not object to at the time generally loses it.',
            'Write to the provider rather than ringing. Say which contract you are on, that the increase is a modification under Ofcom General Condition C1, that a rise in the core subscription price is treated by Ofcom as likely to be of material detriment, and that you are exercising the right to exit without penalty. Ask it to confirm in writing which contract term it says permits the increase and where that term was disclosed to you before you signed. That question does most of the work.',
            'If the provider refuses, ask for a deadlock letter. After eight weeks, or on a deadlock letter, you can take it free of charge to whichever approved ADR scheme your provider belongs to, either the Communications Ombudsman or CISAS. Check which one before you file.',
            'If you are already out of your minimum term, none of this applies and your position is simply better: you can leave on standard notice with no exit fee at all. Out-of-contract customers are routinely on the highest prices a provider charges, so that is the moment to negotiate or move.',
          ],
        },
      ]}
      sources={TELECOMS_SOURCES}
      filing={TELECOMS_FILING}
      faqs={[
        {
          q: 'Can I leave my broadband contract because the price went up?',
          a: 'Only if the rise was a modification rather than something disclosed before you signed. Under Ofcom General Condition C1, a modification likely to be of material detriment requires at least one month’s notice and a right to exit without penalty, and Ofcom treats an increase in the core subscription price during a fixed term as likely to be of material detriment. If the exact new price was stated in pounds and pence before you signed, there is generally no exit right.',
        },
        {
          q: 'Does the Consumer Rights Act 2015 help with a price rise?',
          a: 'Not in the way it is usually cited. Section 9 is the satisfactory quality right and applies to goods, not to services like broadband and mobile. The service provisions are sections 49 to 52 and they concern how the service is performed, not the price. The rule that governs a mid-contract price rise is the Ofcom General Conditions, Condition C1.',
        },
        {
          q: 'What about the 14-day cooling-off period?',
          a: 'It does not apply. The cancellation right under the Consumer Contracts Regulations 2013 runs from the day the contract was made. It does not restart when the price changes later in the term. A complaint built on it will be closed.',
        },
        {
          q: 'My contract says CPI plus 3.9%. Is that allowed?',
          a: 'It depends on when you signed. From 17 January 2025 Ofcom requires in-contract price rises to be stated up front in pounds and pence, and inflation-linked formulas are no longer permitted in new contracts. For a contract entered before that date, a clearly disclosed CPI or RPI term was permitted, and the rise is generally something you agreed to. The rules were not made retrospective.',
        },
        {
          q: 'Does upgrading restart my contract?',
          a: 'Usually yes. Upgrading, taking a new handset, renewing, or accepting a retention offer normally creates a new contract with a new date and a new minimum term. Since the rules changed on 17 January 2025, that date can be the difference between having a strong ground and having none. Check the order confirmation for your current contract, not the date you first joined.',
        },
        {
          q: 'What if my provider says no?',
          a: 'Ask for a deadlock letter. After eight weeks from your written complaint, or immediately on a deadlock letter, you can take the case free of charge to the approved ADR scheme your provider belongs to, which is either the Communications Ombudsman or CISAS. Check which one before filing, because neither can hear a case about the other’s members.',
        },
      ]}
      cta={{
        title: 'Have a ground? Cite it correctly.',
        body: 'Complaints teams close letters that quote the wrong statute. Paybacker drafts yours against the Ofcom General Conditions, keeps a record of what you sent and when, and runs the eight-week clock so you know exactly when the ombudsman route opens.',
      }}
    />
  );
}
