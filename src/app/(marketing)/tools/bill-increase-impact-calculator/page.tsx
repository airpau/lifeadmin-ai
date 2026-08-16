import type { Metadata } from 'next';
import ToolShell, { MONEY_DISCLAIMER } from '../_components/ToolShell';
import BillIncreaseCalculator from '../_components/BillIncreaseCalculator';
import { BILL_RISE_FILING, BILL_RISE_SOURCES } from '../_data/sources';

const SLUG = 'bill-increase-impact-calculator';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Bill Increase Impact Calculator — What Price Rises Really Cost | Paybacker',
  description:
    'Add up a year of price rises across energy, broadband, mobile, insurance, council tax and water, and see which of them carry a right to challenge or leave. Free, no account needed.',
  keywords: [
    'bill increase calculator UK',
    'household bills price rise',
    'mid contract price rise rights',
    'energy price rise calculator',
    'council tax increase calculator',
  ],
  openGraph: {
    title: 'Bill Increase Impact Calculator — What Price Rises Really Cost',
    description:
      'The combined annual cost of this year’s rises, and which of them you can actually push back on.',
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
      h1="Bill increase impact calculator"
      intro="Price rises arrive one at a time, each too small to be worth an argument. Add them up and they rarely are. Enter what each bill was and what it is now, and see the combined annual cost, plus which of those rises carry a genuine right to challenge or leave. No account, nothing stored."
      calculator={<BillIncreaseCalculator />}
      honesty={{
        title: 'Most of these rises are lawful, and we will say so',
        paragraphs: [
          'A price rise is not the same as an overcharge. An energy rise that tracks the Ofgem cap is lawful. A council tax rise voted through by your council is lawful and cannot be appealed. A water bill you dislike cannot be switched away from, because water is a regional monopoly. An insurance renewal priced in line with the market is lawful even when it is 40% up on last year.',
          'The rises that do carry a real right are narrower than most people assume. The clearest is a mid-contract rise on broadband or mobile that was not set out in pounds and pence before you signed, where the Ofcom General Conditions require notice and a penalty-free exit. That one is worth pursuing and this site has a separate checker for it.',
          'For the rest, the useful moves are commercial rather than legal: switch, haggle, get a comparison quote and put it to the incumbent, or change what you are buying. That is less satisfying than a legal right, but it recovers more money in practice.',
          'What this tool does is stop you spending your effort on the wrong bill. The largest number is where the effort belongs, and the list at the end tells you honestly whether there is a lever to pull on it.',
        ],
      }}
      explainers={[
        {
          heading: 'Broadband and mobile: the one with a real right attached',
          paragraphs: [
            'Ofcom’s General Conditions require a provider to give at least one month’s notice of a contract modification likely to be of material detriment, and to offer a right to exit without penalty. Ofcom treats a rise in the core subscription price during a fixed term as likely to be of material detriment.',
            'Since 17 January 2025, providers have also had to state any in-contract price rise up front in pounds and pence. Rises expressed as CPI or RPI plus a percentage are no longer permitted in new contracts, because Ofcom concluded that customers could not know what they were agreeing to.',
            'The practical effect is that if your provider raised your price mid-contract, and the exact pounds-and-pence increase was not set out before you signed, you can normally leave without an early termination charge. Providers do not volunteer this and the notification email will not use the words "right to exit".',
            'There is a deadline. The right to leave is generally exercisable within the notice period, so acting when the email arrives matters more than acting when you get round to it. There is a dedicated checker for this on the site.',
          ],
        },
        {
          heading: 'Energy: the cap is on the rate, not on your bill',
          paragraphs: [
            'The Ofgem price cap limits the unit rate and the daily standing charge on a standard variable tariff. It does not cap your bill. If you use more energy on capped rates, you pay more, and the widely reported annual figure describes a household with typical consumption rather than a maximum anyone can be charged.',
            'The cap changes every three months, on 1 January, 1 April, 1 July and 1 October, and it is set regionally and separately by payment method. So a rate a few per cent above the national average figure is usually your region rather than an overcharge.',
            'There is no exit fee on a standard variable tariff, so you can leave whenever you like. That is the main lever available on an energy rise.',
            'The thing genuinely worth checking on an energy bill is not the rate at all. It is whether any part of a catch-up bill relates to energy used more than 12 months before the bill date, which Ofgem’s back-billing rule does not allow. That check is often worth hundreds of pounds where the rate comparison is worth pennies.',
          ],
        },
        {
          heading: 'Insurance: no right to exit, but a very real right to leave at renewal',
          paragraphs: [
            'Cancelling an insurance policy mid-term normally costs you a cancellation fee and a pro-rata premium adjustment. There is no equivalent of the Ofcom exit right.',
            'A renewal, though, is a new contract that you are entirely free to refuse. FCA rules require your insurer to show last year’s premium next to this year’s on the renewal notice, precisely so the increase is visible, and separately ban an insurer from quoting a renewing customer more than it would quote an equivalent new customer for the same policy.',
            'That second rule is the useful one. Get a quote from your own insurer as a new customer through a comparison site. If it is materially cheaper than your renewal, put that to them in writing and ask them to explain it by reference to the pricing rules. Insurers generally match rather than argue.',
            'Auto-renewal is the mechanism that costs people the most. Diarise the renewal date six weeks ahead, every year, for every policy.',
          ],
        },
        {
          heading: 'Council tax and water: where there is no lever, and where there is',
          paragraphs: [
            'The council tax rise itself is set by your billing authority, subject to a referendum threshold set by government, and there is no appeal against the level of it. Complaining about the increase gets you nowhere.',
            'What you can challenge is the band your property sits in. Bands in England are still based on 1991 values, were assessed quickly at the time, and a meaningful number are wrong. There is a separate checker on this site for whether you have a legal right to challenge, or only an informal review, because the difference matters and the risk of your band going up is real.',
            'Separately, discounts and exemptions are frequently missed rather than refused: single occupancy, students, a severe mental impairment exemption, an annexe discount, or a Council Tax Reduction on low income. Those are worth checking against your bill before you accept the figure.',
            'Water has neither switching nor an exit right. The two things that change a water bill are a meter, which usually helps where there are fewer bedrooms than occupants, and your supplier’s social tariff if your income qualifies. Both are worth asking about and neither is advertised.',
          ],
        },
      ]}
      sources={BILL_RISE_SOURCES}
      filing={BILL_RISE_FILING}
      faqs={[
        {
          q: 'Can I leave my broadband contract because the price went up?',
          a: 'Often yes. If the rise landed during a fixed term and the exact pounds-and-pence increase was not set out before you signed, the Ofcom General Conditions require notice and give you a penalty-free right to exit. If the rise was clearly stated in pounds and pence when you took the contract out, you agreed to it and there is no exit right. The broadband and mobile price rise checker on this site works through which applies.',
        },
        {
          q: 'Can I appeal a council tax increase?',
          a: 'No. The level of the increase is set by your council and there is no appeal against it. You can challenge the band your property is in, which is a separate process through the Valuation Office, and you can appeal a bill that wrongly refuses a discount, exemption or reduction.',
        },
        {
          q: 'My energy bill went up but I am on a fixed tariff. Is that allowed?',
          a: 'Your unit rate should not change during a fix. If your direct debit went up, that is a different thing: suppliers adjust the monthly payment based on projected usage and account balance. Ask for a full statement of account with the readings used. If the unit rate itself changed mid-fix, that is worth challenging in writing.',
        },
        {
          q: 'My insurance renewal is much higher. What can I do?',
          a: 'Get a quote from the same insurer as a new customer. FCA rules ban an insurer from quoting a renewing customer more than an equivalent new customer for the same policy. If the new-customer price is materially lower, put that to them in writing. Also check whether the cover has changed, because a higher excess or removed add-on is not the same product.',
        },
        {
          q: 'Is a mid-contract rise on my mobile handset plan the same as on airtime?',
          a: 'Not quite. Many providers split the contract into a handset element and an airtime element, and apply rises to the airtime part. The Ofcom exit right still applies to a material detriment on the airtime contract, but you may still owe the outstanding handset balance. Check what the notification actually said was rising.',
        },
        {
          q: 'Where do I go if the provider will not resolve it?',
          a: 'Telecoms goes to the Communications Ombudsman or CEDR, depending on which scheme your provider belongs to, after eight weeks or a deadlock letter. Energy goes to the Energy Ombudsman on the same timing. Insurance goes to the Financial Ombudsman Service after a final response or eight weeks. All are free to you and their decisions bind the company.',
        },
      ]}
      cta={{
        title: 'One of these rises is probably challengeable. Finding out is the slow part.',
        body: 'Paybacker watches your bank feed for the moment a bill changes, tells you which rises carry a right to exit or challenge, drafts the letter citing the right condition, and runs the eight-week clock so you know when the ombudsman opens up. Free plan, no card needed.',
      }}
    disclaimer={MONEY_DISCLAIMER}
    />
  );
}
