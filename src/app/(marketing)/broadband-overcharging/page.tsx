import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'Broadband Contract Overcharging UK — How to Fight Back',
  subtitle: 'Mid-contract price rises, slow speeds, and service outages affect millions of UK broadband customers. Under Ofcom rules you may be entitled to £9.33 per day compensation for service loss, and the right to exit your contract penalty-free if your provider breaches their obligations.',
  badge: 'Free complaint letter — takes 30 seconds',
  heroStat: '£9.33/day',
  heroStatLabel: 'Ofcom automatic compensation for loss of service',
  heroStatColor: 'text-blue-400',
  ctaPrimary: 'Generate Your Free Broadband Complaint Letter Now',
  socialProof: 'Millions of UK broadband customers are overcharged or underserved by their provider every year.',
  legislationTitle: 'Ofcom rules and your broadband rights',
  legislationParagraphs: [
    "Ofcom's Automatic Compensation Scheme, which came into force in April 2019, requires participating broadband providers — including BT, Sky, TalkTalk, Virgin Media, and Zen Internet — to automatically pay compensation when service failures occur. You are entitled to £9.33 per day for a total loss of service lasting more than two full working days, £6.21 per day if a repair is not completed by an agreed date, and a one-off payment of £6.21 if an engineer misses a scheduled appointment. Providers are required to issue this compensation automatically without you needing to ask.",
    "On mid-contract price rises, Ofcom's rules changed significantly in March 2024. All new broadband and mobile contracts must now state any potential price rises in pounds and pence at the point of sale — not vague references to 'CPI plus 3.9%'. If your provider increases your price above what was explicitly and clearly stated when you signed up, you now have the right to exit your contract without paying an early termination charge. This applies even within a minimum term.",
    'The Consumer Rights Act 2015 provides a further safety net. Broadband services must be provided with reasonable care and skill. Under Ofcom rules, providers must disclose a minimum guaranteed download speed at sign-up. If your speeds consistently fall below this minimum and the provider cannot improve service within 30 days of your complaint, you are entitled to exit the contract penalty-free.',
  ],
  rightsTitle: 'Your rights as a broadband customer in the UK',
  rights: [
    '£9.33 per day automatic compensation for loss of service lasting more than 2 full working days',
    '£6.21 per day if a repair is not completed by an agreed date',
    '£6.21 one-off payment if an engineer misses or cancels a scheduled appointment',
    'Right to exit your contract without charge if a mid-contract price rise exceeds what was agreed at sign-up',
    'Right to exit if your provider consistently fails to deliver your minimum guaranteed download speed',
    'Right to escalate to Ombudsman Services: Communications or CISAS for free after 8 weeks',
    'Right to report providers not in the Automatic Compensation Scheme directly to Ofcom',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Tell us your problem',
      description: 'Service outage, price rise, slow speeds, missed engineer, or billing dispute. We identify which Ofcom rules and which compensation scheme applies.',
    },
    {
      step: '2',
      title: 'AI writes your complaint',
      description: 'Formal complaint letter citing Ofcom General Conditions, the Automatic Compensation Scheme amounts, and Consumer Rights Act provisions.',
    },
    {
      step: '3',
      title: 'Send and get compensated',
      description: 'Your provider must respond within 8 weeks. If unresolved, escalate for free to Ombudsman Services: Communications.',
    },
  ],
  faqs: [
    {
      q: 'Which providers are covered by the Ofcom Automatic Compensation Scheme?',
      a: 'BT, EE, Plusnet, Sky, TalkTalk, Virgin Media, and Zen Internet are among the major providers signed up. If your provider is not on the list, you still have rights under the Consumer Rights Act and Ofcom General Conditions, but automatic compensation does not apply.',
    },
    {
      q: 'Can I leave my broadband contract if the price goes up mid-contract?',
      a: "From March 2024, if your provider increases prices above the amount explicitly stated in pounds and pence at sign-up, you have a clear right to exit without an early termination charge. For contracts signed before this date, the right to exit depends on whether the price rise exceeds what was contractually agreed. Our complaint letter addresses both scenarios.",
    },
    {
      q: 'What is my minimum guaranteed speed and how do I find it?',
      a: 'Ofcom requires providers to give you a minimum guaranteed download speed at sign-up, usually included in your contract documents or available from your provider on request. If you cannot find it, contact your provider in writing and request a copy. This figure is the legal baseline for your service.',
    },
    {
      q: 'What is CISAS?',
      a: 'CISAS (Communications and Internet Services Adjudication Scheme) is an approved dispute resolution body for broadband and phone complaints. It is free to use for consumers. It covers providers not handled by Ombudsman Services: Communications. You can refer a complaint after 8 weeks without resolution.',
    },
  ],
  finalCtaTitle: 'Ready to challenge your broadband provider?',
  finalCtaSubtitle: 'Generate a formal Ofcom-backed complaint in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'Broadband Overcharging UK | Claim Compensation | Paybacker',
  description:
    'Challenge broadband overcharging with a formal complaint citing Ofcom rules. Claim £9.33/day for service loss. Exit your contract if a mid-contract price rise exceeds what was agreed. Free letter generator.',
  openGraph: {
    title: 'Broadband Overcharging UK | Claim Compensation | Paybacker',
    description:
      'Challenge broadband overcharging with a formal Ofcom-backed complaint. Claim £9.33/day for service loss. Exit your contract if a mid-contract price rise exceeds what was agreed.',
    url: 'https://paybacker.co.uk/broadband-overcharging',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/broadband-overcharging' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
