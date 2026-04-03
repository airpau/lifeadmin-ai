import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'Find Hidden Subscriptions Draining Your Bank Account',
  subtitle: 'The average UK adult pays for 9 active subscriptions but only uses 6 of them, wasting over £312 a year. Paybacker scans your bank account and email inbox to find every subscription, direct debit, and recurring payment you have forgotten about.',
  badge: 'Free bank scan — no credit card required',
  heroStat: '£312/yr',
  heroStatLabel: 'average wasted on forgotten subscriptions per UK adult',
  heroStatColor: 'text-purple-400',
  ctaPrimary: 'Scan My Bank Account Free Now',
  socialProof: 'UK consumers waste over £25 billion per year on unused subscriptions and forgotten direct debits.',
  legislationTitle: 'Your rights regarding subscription services and direct debits',
  legislationParagraphs: [
    'The Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 require businesses to provide clear information about the cost, duration, and cancellation terms of any subscription before you sign up. Free trials that automatically convert to paid subscriptions must clearly state this before you commit. If a company did not make these terms transparent, or if you were not clearly informed that a free trial would auto-renew as a paid subscription, you may have grounds to request a refund.',
    'The Direct Debit Guarantee is one of the most powerful protections available to UK consumers. If a company takes an incorrect amount by direct debit, or takes a payment you did not authorise, your bank must provide an immediate full refund — no questions asked. This applies to cancelled subscriptions that continued to take payments, subscription amounts that changed without adequate notice, and direct debits taken after you cancelled.',
    "The FCA's Consumer Duty, which came into force in July 2023, requires all subscription-based businesses regulated by the FCA to ensure their products deliver good outcomes for consumers. Deliberately hiding cancellation options, making cancellation unreasonably difficult, or continuing to charge after a valid cancellation request are all potential breaches of the Consumer Duty and can be reported to the Financial Ombudsman Service at no cost.",
  ],
  rightsTitle: 'Your rights regarding subscriptions and recurring payments',
  rights: [
    'Direct Debit Guarantee: immediate full refund from your bank if money was taken incorrectly or without authorisation',
    'Right to cancel any subscription by giving the notice period stated in your contract (usually one calendar month)',
    '14-day cooling-off period for subscriptions purchased online, by phone, or away from business premises',
    'Right to clear information about pricing and cancellation terms before signing up',
    'Right to a refund if a free trial converted to a paid subscription without adequate prior notice',
    'Right to dispute recurring card payments with your bank if a subscription continued after cancellation',
    'Right to report subscription traps to your bank, Trading Standards, or the FCA',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Connect your bank securely',
      description: 'Open Banking connection via FCA-regulated Yapily. Read-only access — we never see your login details or have any ability to move money.',
    },
    {
      step: '2',
      title: 'See every subscription',
      description: 'Paybacker identifies every recurring payment, direct debit, and subscription charge with the company name, monthly amount, and annual cost.',
    },
    {
      step: '3',
      title: 'Cancel what you do not need',
      description: 'Generate AI cancellation letters for any subscription, citing the exact UK consumer law that applies to that type of contract.',
    },
  ],
  faqs: [
    {
      q: 'Is it safe to connect my bank account?',
      a: 'Yes. We use Open Banking via Yapily, which is authorised and regulated by the Financial Conduct Authority. We only have read-only access to transaction data. We never see your bank login details and cannot move money. You can revoke access at any time from your bank app.',
    },
    {
      q: 'What if a company refuses to cancel my subscription?',
      a: "Contact your bank directly and request they cancel the direct debit or block the recurring card payment. Under the Direct Debit Guarantee, your bank must honour this request. For card payments (rather than direct debits), ask your bank to issue a chargeback for payments taken after your cancellation request.",
    },
    {
      q: 'Can I claim refunds for subscriptions I have already been paying?',
      a: 'If the subscription was not clearly authorised, if cancellation was deliberately obstructed, or if a free trial converted to a paid service without proper notice, you may be able to claim a chargeback from your bank. Chargebacks on credit cards can usually be claimed for up to 6 years; debit card chargeback windows vary by bank.',
    },
    {
      q: 'How far back does the scan go?',
      a: 'The bank account scan covers up to 12 months of transaction history via Open Banking. The email inbox scan — available when you connect Gmail or Outlook — covers up to 2 years of receipts, billing confirmations, and subscription notifications.',
    },
  ],
  finalCtaTitle: 'Find out what you are really paying for',
  finalCtaSubtitle: 'Scan your bank account for free and see every subscription draining your money.',
};

export const metadata: Metadata = {
  title: 'Find Hidden Subscriptions UK | Free Bank Account Scan | Paybacker',
  description:
    'Scan your bank account to find every hidden subscription, direct debit, and forgotten recurring payment. The average UK adult wastes £312/year. Free bank scan — no credit card required.',
  openGraph: {
    title: 'Find Hidden Subscriptions UK | Free Bank Account Scan',
    description:
      'Scan your bank account to find every hidden subscription and forgotten recurring payment. Average UK adult wastes £312/year. Free scan — no credit card required.',
    url: 'https://paybacker.co.uk/hidden-subscriptions',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/hidden-subscriptions' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
