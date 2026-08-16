import type { Metadata } from 'next';
import ToolShell from '../_components/ToolShell';
import EnergyOverchargeChecker from '../_components/EnergyOverchargeChecker';
import { ENERGY_FILING, ENERGY_SOURCES } from '../_data/sources';
import { CURRENT_PRICE_CAP } from '../_data/energy-price-cap';

const SLUG = 'energy-bill-overcharge-checker';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Energy Bill Overcharge Checker — Free, No Signup | Paybacker',
  description:
    'Compare your electricity and gas unit rates and standing charges against the current Ofgem price cap, and check whether a backdated bill breaks the 12-month back-billing rule. Free, no account needed.',
  keywords: [
    'energy bill overcharge checker',
    'Ofgem price cap unit rate',
    'back billing rule 12 months',
    'energy standing charge cap',
    'am I being overcharged energy',
  ],
  openGraph: {
    title: 'Energy Bill Overcharge Checker — Free, No Signup',
    description:
      'Check your unit rate and standing charge against the Ofgem price cap, and find out whether a backdated bill should have been issued at all.',
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
      h1="Energy bill overcharge checker"
      intro={`Compare your unit rates and standing charges against the Ofgem price cap for ${CURRENT_PRICE_CAP.shortLabel}, and check whether a backdated bill breaks the 12-month back-billing rule. The back-billing check is usually worth far more than the rate comparison. No account, nothing stored.`}
      calculator={<EnergyOverchargeChecker />}
      honesty={{
        title: 'What this comparison can and cannot tell you',
        paragraphs: [
          'The figures we compare against are the Great Britain average for customers paying by Direct Debit, including VAT, taken straight from the Ofgem table. Ofgem does not set one national cap. It sets the cap regionally, and separately for Direct Debit, standard credit and prepayment. Standing charges in particular vary considerably between regions.',
          'So a rate a few per cent above our figure is very probably your region, not an overcharge. We will tell you that rather than manufacture a complaint. A gap in double figures is a different matter and worth putting to your supplier in writing.',
          'We also cannot tell you your supplier has breached the cap, and we will not say so. That is a regulatory finding for Ofgem to make against a licensee, based on the regional cap for your area and your payment method. What this tool does is tell you whether there is something worth asking about, and give you the right words to ask it.',
          `The figures here apply to ${CURRENT_PRICE_CAP.shortLabel} and were last checked against the Ofgem table on ${CURRENT_PRICE_CAP.verifiedOn}. The cap changes every three months. If your bill covers an older period, select it in the tool.`,
        ],
      }}
      explainers={[
        {
          heading: 'The back-billing rule is where the money usually is',
          paragraphs: [
            'Ofgem’s back-billing rule, contained in Standard Licence Condition 21BA, stops a supplier billing a domestic customer for energy used more than 12 months before the date of the bill. It has applied since 2018 and it is absolute in the ordinary case.',
            'This matters far more than a penny or two on a unit rate. A catch-up bill reaching back two or three years, which usually arrives after a meter exchange, a long run of estimated readings or a switch that went wrong, can be four figures. If more than 12 months of it predates the bill date, that part should never have been charged.',
            'There is one narrow exception. The protection can be lost where the customer obstructed the supplier, for example by tampering with the meter or refusing access to it. Simply not submitting readings does not count against you. Suppliers occasionally suggest otherwise.',
            'If you have had a large unexpected bill, the first thing to check is not the rate. It is the date on the bill against the oldest period it charges you for.',
          ],
        },
        {
          heading: 'What the price cap actually caps',
          paragraphs: [
            'The cap limits the unit rate and the daily standing charge a supplier can charge on a standard variable, or default, tariff. It does not cap your bill. Use more energy on capped rates and you pay more, which is why the widely reported annual figure is described as being for a typical household rather than as a maximum.',
            'The cap does not apply to fixed tariffs at all. If you signed a fixed deal, the rate you agreed is the rate you pay, and a fixed rate above the cap is not a breach of anything. It also does not apply to business energy contracts or to heat networks.',
            'Ofgem resets the cap every three months, effective on 1 January, 1 April, 1 July and 1 October. Comparing a January bill against the July cap produces a meaningless answer, which is why this tool asks you which period your bill covers and tells you which figures it used.',
          ],
        },
        {
          heading: 'When a bill looks wrong but the rates are right',
          paragraphs: [
            'Most complaints that start as "I am being overcharged" turn out not to be a rate problem. Three causes account for the majority of them.',
            'Estimated readings are the most common. If your supplier has not had an actual reading, it guesses, and the guess is often high. Submitting an actual reading and asking for the account to be rebilled fixes it. If the estimate has been running for a long time, check the back-billing point as well.',
            'A direct debit set too high is the second. Suppliers build credit balances, sometimes far beyond what the coming winter justifies. You are entitled to ask for a review and to have a significant unexplained credit balance refunded.',
            'The third is a change in consumption you did not notice: a new appliance, someone working from home, an immersion heater left on a timer. A full statement of account with meter readings will show you which of the three it is before you write a complaint about the wrong thing.',
            'Whatever the cause, the route is the same. Complain to the supplier first. If it is unresolved after eight weeks, or you get a deadlock letter sooner, the Energy Ombudsman is free and its decisions bind the supplier.',
          ],
        },
      ]}
      sources={ENERGY_SOURCES}
      filing={ENERGY_FILING}
      faqs={[
        {
          q: 'Can my supplier bill me for energy I used two years ago?',
          a: 'Generally not. Ofgem’s back-billing rule, Standard Licence Condition 21BA, prevents a supplier billing a domestic customer for energy used more than 12 months before the date of the bill. The narrow exception is where the customer obstructed the supplier, for example by tampering with or blocking access to the meter. Failing to submit readings does not count against you.',
        },
        {
          q: 'My rate is higher than your figure. Is that an overcharge?',
          a: 'Not necessarily, and often not. The figures used here are the Great Britain average for Direct Debit customers. Ofgem sets the cap regionally and separately by payment method, so a few per cent either side of the average is normal regional variation. A double-digit gap is worth asking your supplier to justify in writing by reference to the cap for your region.',
        },
        {
          q: 'Does the price cap apply to my fixed tariff?',
          a: 'No. The cap applies only to standard variable, or default, tariffs. If you agreed a fixed deal, the rate you agreed is the rate you pay, whether it is above or below the cap. The cap also does not cover business energy contracts or heat networks.',
        },
        {
          q: 'Does the price cap limit my total bill?',
          a: 'No. It limits the rate per unit and the daily standing charge. The widely quoted annual figure describes what a household with typical consumption would pay at capped rates, not a maximum anyone can be charged. Use more energy and you pay more.',
        },
        {
          q: 'What do I do about a huge catch-up bill?',
          a: 'Check the date of the bill against the oldest period it charges for. Anything more than 12 months before the bill date should be removed under the back-billing rule. Write to the supplier stating that, ask for the bill to be reissued limited to the last 12 months, and ask for the readings used. If it will not, the Energy Ombudsman is free after eight weeks.',
        },
        {
          q: 'How do I take a complaint further?',
          a: 'Complain to your supplier first and keep it in writing. If it is not resolved after eight weeks, or the supplier issues a deadlock letter sooner, you can take it to the Energy Ombudsman at no cost. Its decisions are binding on the supplier, which is not true of a complaint to Ofgem.',
        },
      ]}
      cta={{
        title: 'Found something? The letter needs to cite the right condition.',
        body: 'A back-billing complaint that quotes Standard Licence Condition 21BA and states the exact period being challenged gets a very different response from one that just says the bill is too high. Paybacker drafts it, then runs the eight-week clock so you know when the Energy Ombudsman opens up.',
      }}
    />
  );
}
