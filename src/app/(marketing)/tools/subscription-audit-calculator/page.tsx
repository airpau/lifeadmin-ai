import type { Metadata } from 'next';
import ToolShell, { MONEY_DISCLAIMER } from '../_components/ToolShell';
import SubscriptionAuditCalculator from '../_components/SubscriptionAuditCalculator';
import { SUBSCRIPTION_SOURCES } from '../_data/sources';

const SLUG = 'subscription-audit-calculator';
const URL = `https://paybacker.co.uk/tools/${SLUG}`;

export const metadata: Metadata = {
  title: 'Subscription Audit Calculator — What Your Subscriptions Really Cost | Paybacker',
  description:
    'Add up every recurring payment and see the true annual cost, the cost per actual use, and what the same money would be worth if you saved it instead. Free, no account, nothing stored.',
  keywords: [
    'subscription calculator UK',
    'how much do my subscriptions cost',
    'subscription audit',
    'cancel unused subscriptions',
    'recurring payments tracker',
  ],
  openGraph: {
    title: 'Subscription Audit Calculator — What Your Subscriptions Really Cost',
    description:
      'Annual cost, cost per use, and what the same money would be worth saved instead.',
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
      h1="Subscription audit calculator"
      intro="List everything that leaves your account on repeat and see what it actually costs: the annual figure, the cost every time you genuinely use it, and what the same money would have been worth saved instead. Work from a bank statement, not memory. No account, nothing stored."
      calculator={<SubscriptionAuditCalculator />}
      honesty={{
        title: 'Your total is almost certainly too low',
        paragraphs: [
          'If you filled this in from memory, you have missed some. That is not a criticism, it is the entire mechanism by which subscriptions work. A charge you remember is one you have decided is worth it. The expensive ones are the ones that have gone quiet.',
          'The usual suspects are annual renewals that landed eleven months ago, a service you signed up to inside an app rather than on a website, anything billed to a card rather than by direct debit, and a free trial you meant to cancel. Also worth checking: anything charged in dollars, which will not read as a familiar name on your statement.',
          'Go and open your last three months of statements and your app store subscription list, and run this again. The gap between the from-memory number and the from-statement number is usually the most useful output on the page.',
          'The savings comparison is an illustration at a constant rate, not a forecast, and it assumes the money sits inside an ISA so no tax is deducted. It is there to show the scale of the money rather than to predict a balance.',
        ],
      }}
      explainers={[
        {
          heading: 'Cost per use is the number that changes behaviour',
          paragraphs: [
            'Monthly price is designed to be the number you judge a subscription by, because it is always small. £12.99 never feels like a decision. Cost per use is the number that tells you the truth.',
            'A £12.99 streaming service watched twice a month costs £6.50 a go, which is fine. The same service watched twice a year costs £78 a time, which is not. A £45 monthly gym membership used four times a month is £11.25 a session, roughly a drop-in class. Used twice, it is £22.50. Used not at all, it is £540 a year for a plastic card.',
            'The point is not that expensive-per-use things should always go. Insurance has an appalling cost per use and is worth every penny. The point is that you should know the number before you decide, rather than judging everything against a monthly price that was set precisely so you would not think about it.',
            'The pattern to look for is the subscription you keep because cancelling feels like admitting something. Gym memberships, language apps and professional subscriptions all live here. The money is already gone either way; the only question is whether it keeps going.',
          ],
        },
        {
          heading: 'What you can actually do about a subscription you want to end',
          paragraphs: [
            'If you signed up online within the last 14 days, the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 normally give you a right to cancel and get your money back, whatever the trader’s own terms say. If the trader never gave you the required cancellation information, that 14-day window extends, potentially by up to a year.',
            'Outside that window, you are governed by the contract. A rolling monthly subscription can normally be stopped with a month’s notice. A minimum term, common on gym memberships and mobile handset plans, generally survives your wish to stop paying, though a genuine change of circumstances is worth raising.',
            'Always cancel in writing, through the provider’s own channel, and keep the confirmation with a date. A phone call you cannot evidence is worth very little later.',
            'Cancelling the payment is a backstop, not a substitute. You can withdraw a continuous payment authority on a card by telling your card provider, and they must stop it. But the underlying contract still exists, so if you owe money you can still be pursued for it. Cancel the contract first and the payment second.',
            'If a term made cancellation unreasonably difficult, or an automatic renewal was never fairly brought to your attention, the unfair terms provisions in Part 2 of the Consumer Rights Act 2015 are the route to challenge it.',
          ],
        },
        {
          heading: 'Why the money reappears somewhere else if you are not careful',
          paragraphs: [
            'Cancelling £60 a month of subscriptions does not make you £60 a month better off unless the £60 goes somewhere. Money that sits in a current account gets absorbed within about two months, and nobody can ever quite say into what.',
            'The fix is mechanical rather than moral. Set up a standing order for the amount you have freed up, dated the day after payday, into a separate account. Then the decision is made once rather than every month.',
            'The savings figure this tool produces is there to make that concrete. £60 a month is £720 a year, and around £4,000 over five years at a typical savings rate. Framed as £60, it is a rounding error. Framed as £4,000, it is a holiday, a chunk of a deposit or several months of an emergency fund.',
            'It is also worth doing this annually rather than once. Subscriptions accumulate. Whatever you cancel today, the same audit in twelve months will find new ones.',
          ],
        },
      ]}
      sources={SUBSCRIPTION_SOURCES}
      filing={[]}
      faqs={[
        {
          q: 'How do I find subscriptions I have forgotten about?',
          a: 'Go through three months of bank and credit card statements line by line, then check your Apple and Google subscription lists separately, because in-app subscriptions often do not show a recognisable merchant name. Also search your email for words like "renewal", "your subscription" and "receipt". Anything billed annually will not appear in a three-month statement window, so check twelve months for those.',
        },
        {
          q: 'Can I get a refund for a subscription I forgot to cancel?',
          a: 'Sometimes. If you signed up online in the last 14 days there is normally a statutory right to cancel. Beyond that it depends on the contract, but it is always worth asking, particularly where you have clearly not used the service at all since a renewal. Many providers will refund a recent annual renewal rather than argue about it. Ask in writing.',
        },
        {
          q: 'What is a continuous payment authority?',
          a: 'A recurring payment taken from a debit or credit card rather than by direct debit. You can tell your card provider to stop it and they must comply, even if the merchant objects. It is not the same as cancelling the contract though, so cancel with the provider as well or you may still owe the money.',
        },
        {
          q: 'Does cancelling a direct debit cancel the contract?',
          a: 'No. It stops the payment, not the obligation. The provider can still pursue the debt and may report a missed payment. Cancel with the provider in writing first, get confirmation, and then stop the payment as a backstop.',
        },
        {
          q: 'Is the savings projection a prediction?',
          a: 'No. It applies a single constant rate that you choose, with contributions at the end of each month and no tax deducted, on the assumption the money would sit inside an ISA. It is there to show the scale of what the subscriptions cost over time, not to forecast a balance.',
        },
        {
          q: 'Is anything I type here stored?',
          a: 'No. The calculation runs entirely in your browser. Nothing is transmitted to us, logged or saved, and there is no email gate before the result.',
        },
      ]}
      cta={{
        title: 'Paybacker finds these automatically from your bank feed.',
        body: 'You typed this list from memory, and the ones you forgot are the ones costing you the most. Connect your bank read-only and Paybacker pulls out every recurring payment, spots the ones that quietly rose, flags renewals before they hit, and drafts the cancellation email citing the right law. Free plan, no card needed, and the connection is read-only.',
      }}
    disclaimer={MONEY_DISCLAIMER}
    />
  );
}
