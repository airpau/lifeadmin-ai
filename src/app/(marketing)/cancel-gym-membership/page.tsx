import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'How to Cancel a Gym Membership UK',
  subtitle: 'Gyms make cancellation deliberately difficult and often include unfair contract terms. Under UK consumer law, unfair terms are not enforceable — and you have a 14-day cooling-off period if you signed up online. Generate your free cancellation letter in 30 seconds.',
  badge: 'Free to use — works with all UK gyms',
  heroStat: '14 days',
  heroStatLabel: 'cooling-off period if you signed up online or by phone',
  heroStatColor: 'text-green-400',
  ctaPrimary: 'Generate Your Free Gym Cancellation Letter Now',
  socialProof: 'Gym membership disputes are among the most common consumer complaints referred to Citizens Advice in the UK.',
  legislationTitle: 'Your legal rights when cancelling a gym membership',
  legislationParagraphs: [
    'The Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 give you a 14-day cooling-off period when you sign up for any service online, over the phone, or away from business premises. If you signed up via an app, website, or telephone, you can cancel within 14 days with no exit fee whatsoever. The gym must issue a full refund for any payments taken within this period.',
    "The Consumer Rights Act 2015 provides broader protection for all gym contracts. Any contract term that creates a significant imbalance in the parties' rights and obligations — to your detriment — is unfair and not legally binding, even if you signed it. Terms that prevent cancellation on medical grounds, that automatically renew without adequate notice, or that impose disproportionate exit fees are all potentially unfair under this Act. You cannot be prevented from relying on your statutory rights by any contractual clause.",
    'The Competition and Markets Authority (CMA) published specific guidance on gym contracts in 2011, finding that minimum terms over 12 months, automatic renewals without clear notice, and blanket refusals to allow cancellation in cases of hardship were likely to be unfair. These principles remain applicable today. If your gym contract contains such terms, they may be challenged as unenforceable regardless of when the contract was signed.',
  ],
  rightsTitle: 'Your rights when cancelling a gym membership',
  rights: [
    '14-day cooling-off period if you signed up online, by phone, or away from the gym premises',
    'Right to cancel if the gym fundamentally changes its facilities, location, or the services you signed up for',
    'Right to cancel on medical grounds that prevent you from exercising (a letter from your GP is usually sufficient)',
    'Right to cancel if you are made redundant or suffer a significant loss of income',
    'Unfair contract terms — such as excessive exit fees or blocking medical cancellation — are not legally enforceable',
    'Right to written confirmation of cancellation and a final bill showing no further payments due',
    'Right to escalate disputes to Citizens Advice or your local Trading Standards if the gym refuses',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Tell us your situation',
      description: 'Online sign-up cooling-off, medical grounds, gym changed facilities, or standard end-of-term cancellation. We identify the right legal basis for your letter.',
    },
    {
      step: '2',
      title: 'AI writes your cancellation',
      description: 'Formal letter citing the Consumer Contracts Regulations 2013, Consumer Rights Act 2015, and CMA guidance. Gyms cannot legally ignore this.',
    },
    {
      step: '3',
      title: 'Send and confirm cancellation',
      description: 'Send by email and keep the reply as proof. If the gym refuses, escalate to Citizens Advice or your local Trading Standards office.',
    },
  ],
  faqs: [
    {
      q: 'Can the gym refuse to cancel my membership?',
      a: "If you are within a minimum term and have no qualifying grounds (cooling-off, medical, redundancy, facility changes), the gym can hold you to the contract. However, if the contract contains unfair terms under the Consumer Rights Act, or if the gym has materially changed what you signed up for, you may still be entitled to cancel without paying exit fees.",
    },
    {
      q: 'What counts as a significant change that lets me cancel?',
      a: 'Moving to a location significantly less convenient for you, removing key facilities advertised at sign-up (such as a swimming pool or specific classes), substantially increasing the membership price, or changing opening hours significantly — all of these may constitute a material change that entitles you to exit without penalty.',
    },
    {
      q: 'Do I need a doctor\'s letter to cancel on medical grounds?',
      a: "Most gyms require evidence from a GP or specialist confirming you cannot exercise. Our cancellation letter outlines what evidence is appropriate and formally requests the gym waive the exit fee. Some gyms will accept a doctor's letter without requiring you to formally complain.",
    },
    {
      q: 'What if the gym sends my account to a debt collector?',
      a: 'If your cancellation request was valid under consumer law, the underlying debt may not be enforceable. Do not simply pay to make the issue go away. Seek advice from Citizens Advice and write to the debt collector citing the grounds for your cancellation. Paying a disputed amount can sometimes be interpreted as an admission that the debt is valid.',
    },
  ],
  finalCtaTitle: 'Ready to cancel your gym membership?',
  finalCtaSubtitle: 'Generate a formal cancellation letter citing UK consumer law in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'How to Cancel a Gym Membership UK | Free Letter Generator | Paybacker',
  description:
    'Cancel a gym membership using your UK consumer law rights. 14-day cooling-off period, medical grounds, unfair contract terms. Generate your free cancellation letter in 30 seconds.',
  openGraph: {
    title: 'How to Cancel a Gym Membership UK | Free Letter Generator',
    description:
      'Cancel a gym membership using your UK consumer law rights. 14-day cooling-off period, medical grounds, unfair contract terms. Generate your free cancellation letter in 30 seconds.',
    url: 'https://paybacker.co.uk/cancel-gym-membership',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/cancel-gym-membership' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
