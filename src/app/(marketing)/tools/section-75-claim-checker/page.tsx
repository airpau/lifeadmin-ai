import type { Metadata } from 'next';
import ToolShell from '../_components/ToolShell';
import Section75Checker from '../_components/Section75Checker';
import { SECTION_75_FILING, SECTION_75_SOURCES } from '../_data/sources';

const SLUG = 'section-75-claim-checker';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Section 75 Claim Checker — Free, No Signup | Paybacker',
  description:
    'Check whether section 75 of the Consumer Credit Act 1974 makes your credit card provider jointly liable for a purchase that went wrong. Free checker, no account. Covers the £100 to £30,000 rule and the traps that get claims refused.',
  keywords: [
    'section 75 claim',
    'section 75 checker',
    'Consumer Credit Act 1974 section 75',
    'credit card claim faulty goods',
    'section 75 vs chargeback',
  ],
  openGraph: {
    title: 'Section 75 Claim Checker — Free, No Signup',
    description:
      'Is your credit card provider jointly liable? Check the £100 threshold, the payment chain and the limitation period in under a minute.',
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
      h1="Section 75 claim checker"
      intro="Section 75 of the Consumer Credit Act 1974 makes your credit card provider jointly liable with the retailer when a purchase goes wrong. Check whether it applies to yours, and see the three things that most often get a claim refused. No account, nothing stored."
      calculator={<Section75Checker />}
      honesty={{
        title: 'Where section 75 claims actually fail',
        paragraphs: [
          'It is rarely the £100 threshold. Claims are usually refused on the payment chain. Section 75 needs an unbroken link between you as the debtor, the lender as the creditor, and the trader as the supplier. Pay through PayPal or a similar intermediary and lenders will often argue that link is broken. Buy on a card where you are an additional cardholder rather than the account holder and they will argue you are not the debtor. Neither point is unarguable, but you should know it is coming.',
          'The second trap is the item price. The £100 test applies to the cash price of the item or service, not to what you charged to the card and not to the basket total. Four separate £40 items in one £160 order are four £40 purchases, and none of them qualifies.',
          'The third is limitation. You normally have six years in England and Wales, five in Scotland, and lenders do enforce it. If you have been going round in circles with a trader for years, put the section 75 claim in now rather than after one more attempt.',
        ],
      }}
      explainers={[
        {
          heading: 'What section 75 actually gives you',
          paragraphs: [
            'Section 75 of the Consumer Credit Act 1974 makes the credit provider jointly and severally liable with the supplier for any breach of contract or misrepresentation. Joint and several is the important phrase. It means you can pursue the lender for the whole amount and it is then the lender’s job to chase the trader, not yours.',
            'That is why section 75 is at its most valuable when a trader has gone out of business. An administrator will not pay you. Your card provider still has to.',
            'It applies where the cash price of the item or service is more than £100 and no more than £30,000. Above that, a narrower provision called section 75A can apply to linked credit agreements, with tighter conditions.',
            'You can also claim consequential losses that flow from the breach, not only the purchase price. If a faulty appliance damaged something else, or a cancelled service left you out of pocket in a way you can evidence, that forms part of the claim.',
          ],
        },
        {
          heading: 'The part-payment rule, which is worth real money',
          paragraphs: [
            'This is the single most valuable thing on this page. You do not have to put the whole purchase on the credit card. Paying any part of the price with the card gives you section 75 cover for the entire cash price.',
            'So a £4,000 sofa where you paid a £200 deposit on a credit card and the balance by bank transfer is fully covered for £4,000. A £2,500 holiday where you paid £150 on a card is covered for £2,500.',
            'The Financial Ombudsman Service lists this among the most common misunderstandings it sees. People assume the whole amount had to go on the card, so they never claim. If you have ever paid a deposit by credit card on something that later went wrong, this is worth going back over.',
          ],
        },
        {
          heading: 'Section 75 or chargeback: they are not the same thing',
          paragraphs: [
            'Section 75 is a statutory right. Chargeback is a card scheme rule. That difference decides which one is worth pursuing.',
            'Because section 75 is statutory, the lender cannot decline it on discretion, it is jointly liable as a matter of law, there is no scheme time limit beyond the ordinary limitation period, and you can recover consequential losses.',
            'Chargeback is what you use when section 75 does not apply, most obviously on debit cards or where the item cost £100 or less. It is quicker but weaker: the usual window is 120 days, the bank has more discretion, and it generally recovers only what you paid.',
            'If both are open to you, claim under section 75 and name it as such. Some card providers will quietly process a section 75 claim as a chargeback, which is a worse outcome for you. Use the words "section 75 claim under the Consumer Credit Act 1974" in writing.',
          ],
        },
      ]}
      sources={SECTION_75_SOURCES}
      filing={SECTION_75_FILING}
      faqs={[
        {
          q: 'Does the whole purchase have to go on the credit card?',
          a: 'No. Paying any part of the price with a credit card gives you section 75 cover for the full cash price, provided that price is over £100 and no more than £30,000. A £200 deposit on a £4,000 purchase gives you cover for the whole £4,000. The Financial Ombudsman Service lists this as one of the most common section 75 misunderstandings.',
        },
        {
          q: 'Is £100 exactly enough?',
          a: 'No. The cash price has to be MORE than £100, so £100.01 at minimum, and no more than £30,000. The test applies to the price of the single item or service you are complaining about, not to the total order value.',
        },
        {
          q: 'I paid by debit card. Am I covered?',
          a: 'Not by section 75, which only applies to credit. Your route is chargeback, a card scheme rule your bank operates. Ask for it quickly, because the usual window is 120 days from the transaction or from when you expected delivery. Chargeback is weaker than section 75 and generally recovers only what you paid.',
        },
        {
          q: 'What if I paid through PayPal with my credit card?',
          a: 'It depends on how the payment was routed. Section 75 requires an unbroken debtor-creditor-supplier chain, and lenders frequently argue that an intermediary breaks it. Outcomes have varied, so it is worth claiming rather than assuming you are out, but expect the lender to raise it and be ready to take it to the Financial Ombudsman Service.',
        },
        {
          q: 'Do I have to complain to the retailer first?',
          a: 'Not as a matter of law. Section 75 liability is joint and several, so you can go to the lender directly. In practice lenders ask, and a written refusal or an unanswered letter from the trader makes the claim considerably harder to refuse. It is worth doing.',
        },
        {
          q: 'How long do I have to make a section 75 claim?',
          a: 'The ordinary limitation period applies: six years in England and Wales under section 5 of the Limitation Act 1980, five years in Scotland. Time normally runs from the breach, which for goods that never arrived is the date delivery was due rather than the date you ordered.',
        },
      ]}
      cta={{
        title: 'Eligible? The letter is where claims are won or lost.',
        body: 'A section 75 claim that names the section, sets out the breach and attaches the right evidence gets treated differently from an angry email. Paybacker drafts it, then tracks the eight-week clock so you know exactly when the Financial Ombudsman route opens.',
      }}
    />
  );
}
