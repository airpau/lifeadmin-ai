import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'How to Make an Insurance Complaint UK',
  subtitle: 'Claim denied, premium increased unfairly, or poor service? Under FCA rules, your insurer must handle your complaint fairly. If they do not, the Financial Ombudsman Service can award up to £375,000 — and it is completely free to use.',
  badge: 'Free complaint letter — FOS escalation if needed',
  heroStat: '£375,000',
  heroStatLabel: 'maximum Financial Ombudsman Service award for insurance disputes',
  heroStatColor: 'text-violet-400',
  ctaPrimary: 'Generate Your Free Insurance Complaint Letter Now',
  socialProof: 'The Financial Ombudsman Service upholds over 35% of insurance complaints referred to them — meaning thousands of customers are wrongly denied each year.',
  legislationTitle: 'FCA rules and the Financial Ombudsman Service',
  legislationParagraphs: [
    "All UK insurers must be authorised by the Financial Conduct Authority (FCA) and comply with the Insurance Conduct of Business Sourcebook (ICOBS). ICOBS requires insurers to handle claims promptly and fairly, to communicate policy terms clearly, and not to reject claims in a way that is not justified by the policy wording. The FCA's Consumer Duty, which came into force in July 2023, strengthens these obligations further — insurers must now actively ensure their products and services deliver good outcomes for consumers, not merely avoid causing harm.",
    'The Financial Ombudsman Service (FOS) is a free, independent service that resolves disputes between consumers and FCA-authorised financial businesses. After complaining to your insurer, if you receive a final decision letter you disagree with — or if 8 weeks pass without resolution — you can refer your case to the FOS at no cost. The FOS can direct your insurer to pay compensation of up to £375,000 and its decisions are legally binding on the insurer. Over 35% of insurance complaints referred to the FOS are upheld in favour of the consumer.',
    "The Consumer Insurance (Disclosure and Representations) Act 2012 (CIDRA) governs what you must disclose when taking out a policy. Under CIDRA, you are required to take reasonable care not to make a misrepresentation — but this duty is not absolute. If you answered the insurer's questions honestly and to the best of your knowledge, they cannot void your policy on the grounds of innocent non-disclosure. If your claim has been denied on the basis of alleged non-disclosure, CIDRA may well protect you.",
  ],
  rightsTitle: 'Your rights when making an insurance complaint',
  rights: [
    'Right to a formal written response to your complaint within 8 weeks',
    'Right to refer to the Financial Ombudsman Service for free after 8 weeks, or on receipt of a final decision letter',
    'FOS can award up to £375,000 in compensation and its decisions are binding on your insurer',
    'Right to fair treatment under FCA Consumer Duty — your insurer must prioritise good outcomes for you',
    'Protection under CIDRA if your claim is denied for alleged non-disclosure where you answered questions honestly',
    'Right to a clear written explanation of any premium increase or policy change at renewal',
    'Protection against price walking: FCA rules prohibit charging loyal customers more than new customers for equivalent cover',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Describe your complaint',
      description: 'Denied claim, unfair premium increase, poor handling, or a dispute about policy terms. We identify which FCA rules and legislation apply.',
    },
    {
      step: '2',
      title: 'AI writes your complaint',
      description: 'Formal complaint letter citing ICOBS, FCA Consumer Duty, and CIDRA as relevant to your specific situation.',
    },
    {
      step: '3',
      title: 'Escalate to FOS if needed',
      description: 'If unresolved after 8 weeks, refer for free to the Financial Ombudsman Service. We include the referral process in your letter.',
    },
  ],
  faqs: [
    {
      q: 'Can I go straight to the Financial Ombudsman Service?',
      a: "You must first complain directly to your insurer and either receive a final decision letter or wait 8 weeks without a satisfactory resolution. After that, you can refer for free to the FOS. There is a 6-month window after receiving a final decision letter to refer to the FOS, so do not delay once the insurer has responded.",
    },
    {
      q: 'What if my claim was denied due to alleged non-disclosure?',
      a: "Under CIDRA, if you answered the insurer's questions honestly and to the best of your knowledge at sign-up, you have a defence against a non-disclosure claim. If the insurer is alleging deliberate misrepresentation, this is a more serious matter. Our complaint letter challenges non-disclosure decisions that appear to be based on technical breaches where no dishonesty was involved.",
    },
    {
      q: 'Can I challenge a large price increase at renewal?',
      a: "Yes. FCA rules ban price walking — charging existing customers more than new customers for equivalent cover. If your premium has increased significantly at renewal without a genuine increase in risk, you can complain. If your insurer cannot match the best quote for equivalent cover on the open market, you should switch and can complain about the increase.",
    },
    {
      q: 'What types of insurance can I complain about through the FOS?',
      a: 'All FCA-regulated insurance products: home and contents, car, travel, life, critical illness, income protection, pet, health, and business insurance. Also payment protection insurance, extended warranties sold with financial products, and other regulated protection products.',
    },
  ],
  finalCtaTitle: 'Ready to make your insurance complaint?',
  finalCtaSubtitle: 'Generate a formal FCA-backed complaint letter in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'How to Make an Insurance Complaint UK | Free Letter | Paybacker',
  description:
    'Make an insurance complaint citing FCA rules and ICOBS. Free complaint letter generator. Escalate to the Financial Ombudsman Service (FOS) for up to £375,000 compensation.',
  openGraph: {
    title: 'How to Make an Insurance Complaint UK | Free Letter',
    description:
      'Make an insurance complaint citing FCA rules. Escalate to the Financial Ombudsman Service for up to £375,000 compensation. Free complaint letter generator.',
    url: 'https://paybacker.co.uk/insurance-complaint',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/insurance-complaint' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
