import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'Mobile Phone Contract Dispute UK — How to Complain',
  subtitle: 'Mid-contract price rises, faulty handsets, coverage failures, and billing errors affect millions of UK mobile customers. Under Ofcom rules, some price rises give you the right to exit your contract penalty-free. Generate your free complaint letter now.',
  badge: 'Free complaint letter — works with all UK networks',
  heroStat: '£43/mo',
  heroStatLabel: 'average monthly overpayment by loyal out-of-contract customers',
  heroStatColor: 'text-cyan-400',
  ctaPrimary: 'Generate Your Free Mobile Complaint Letter Now',
  socialProof: 'Millions of UK mobile customers are on expired contracts or facing mid-contract price rises — many have the right to leave or seek compensation.',
  legislationTitle: 'Ofcom rules and the Consumer Rights Act for mobile contracts',
  legislationParagraphs: [
    "Ofcom has significantly strengthened protections for mobile customers in recent years. Since January 2023, all new mobile contracts must clearly state any mid-contract price rise in pounds and pence at the point of sale — a direct requirement that ended the use of opaque 'CPI plus X%' formulas. Since March 2024, if a provider increases prices above the amount explicitly stated when you signed up, you have a clear right to exit your contract without paying any early termination charge.",
    'The Consumer Rights Act 2015 also gives you strong protections on the handset itself. If a mobile phone develops a fault within 30 days of purchase, you have the short-term right to reject it for a full refund. Between 30 days and 6 months, the retailer must prove the handset was not faulty at the time of sale — the burden of proof lies with them. After 6 months, the burden shifts back to you, but a repair, replacement, or partial refund may still be available for up to 6 years under the Act.',
    "For service-related issues — persistent coverage failures, network outages, or billing errors — Ofcom's General Conditions require providers to maintain an adequate standard of service. If your provider consistently fails to deliver what you are paying for, you have grounds for a formal complaint. If the failure is serious or persistent, you may be entitled to exit your contract. Ofcom can be contacted directly if you believe a provider is systematically failing its obligations across a wider customer base.",
  ],
  rightsTitle: 'Your rights as a mobile phone customer',
  rights: [
    'Right to exit your contract without charge if a mid-contract price rise exceeds what was disclosed at sign-up (since March 2024)',
    '30-day short-term right to reject a faulty handset for a full refund under the Consumer Rights Act 2015',
    'Right to repair, replacement, or partial refund for faults appearing within 6 months (burden of proof on retailer)',
    'Right to your PAC (Porting Authorisation Code) to keep your number when switching — provider must supply this within one working day',
    'Right to accurate billing and prompt correction of any billing errors',
    'Right to escalate to CISAS or Ombudsman Services: Communications for free after 8 weeks without resolution',
    'Right to a final bill and account closure within a reasonable time after cancellation',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Tell us your complaint',
      description: 'Price rise dispute, faulty handset, coverage failure, billing error, or cancellation issue. We identify the right legal basis for your complaint.',
    },
    {
      step: '2',
      title: 'AI writes your complaint',
      description: 'Formal complaint letter citing Ofcom General Conditions, Consumer Rights Act 2015, and the specific rules that apply to your situation.',
    },
    {
      step: '3',
      title: 'Send and escalate if needed',
      description: 'Send to your provider. If unresolved after 8 weeks, refer for free to CISAS or Ombudsman Services: Communications.',
    },
  ],
  faqs: [
    {
      q: 'Can I leave my mobile contract if the price goes up?',
      a: "Under Ofcom's rules since March 2024, if your provider increases prices above the amount stated in pounds and pence at sign-up, you have the right to exit without an early termination charge. For older contracts, the right to exit depends on whether the price rise was contemplated in your contract. Our complaint letter covers both scenarios.",
    },
    {
      q: 'My handset developed a fault after 10 months — what are my rights?',
      a: 'Under the Consumer Rights Act 2015, between 30 days and 6 months after purchase, the retailer must prove the handset was not faulty at point of sale. After 6 months you must show it was faulty, but you still have rights to a repair, replacement, or partial refund for up to 6 years from purchase.',
    },
    {
      q: 'What is a PAC code and how quickly must my provider give me one?',
      a: "A PAC (Porting Authorisation Code) lets you keep your mobile number when switching to a new provider. Under Ofcom rules, your current provider must give you your PAC within one working day of you requesting it — whether by text, phone, or in-store. Text 'PAC' to 65075 and you will receive it by text within minutes.",
    },
    {
      q: 'What if my network coverage is poor at my address?',
      a: "If your provider misrepresented coverage at sign-up — for example showing full coverage on their checker for your postcode when it is actually poor — you may have grounds to exit your contract. If coverage has materially worsened since you signed up, this may also give grounds for a complaint citing your provider's obligation to maintain adequate service quality.",
    },
  ],
  finalCtaTitle: 'Ready to dispute your mobile contract?',
  finalCtaSubtitle: 'Generate a formal Ofcom-backed complaint in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'Mobile Phone Contract Dispute UK | Free Complaint Letter | Paybacker',
  description:
    'Dispute a mobile phone contract — mid-contract price rise, faulty handset, coverage failure, or billing error. Free complaint letter citing Ofcom rules and Consumer Rights Act 2015.',
  openGraph: {
    title: 'Mobile Phone Contract Dispute UK | Free Complaint Letter',
    description:
      'Dispute a mobile phone contract — mid-contract price rise, faulty handset, or coverage failure. Free complaint letter citing Ofcom rules and Consumer Rights Act 2015.',
    url: 'https://paybacker.co.uk/mobile-contract-dispute',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/mobile-contract-dispute' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
