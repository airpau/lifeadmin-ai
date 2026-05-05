import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'How to make an NHS complaint UK',
  subtitle:
    'Unhappy with NHS care, treatment, or waiting times? You have the right to complain and expect a response. Paybacker helps you write a formal NHS complaint letter citing the NHS Constitution and relevant regulations in seconds.',
  badge: 'Free to use — no credit card required',
  heroStat: '12 months',
  heroStatLabel: 'time limit to complain from the incident date',
  ctaPrimary: 'Generate Your Free NHS Complaint Letter Now',
  socialProof:
    'Every NHS service has a complaints procedure. Most complaints are resolved locally within 25 working days.',
  legislationTitle: 'Your legal rights when complaining about NHS care',
  legislationParagraphs: [
    'The NHS Constitution for England gives everyone the right to complain about NHS services, to have that complaint properly investigated, and to receive a full and prompt reply. The Constitution also guarantees your right to non-discrimination, dignity and respect, and access to information about your care. When these rights are breached, you are entitled to a formal complaint and, where appropriate, an apology and remedy.',
    'Under the Local Authority Social Services and National Health Service Complaints (England) Regulations 2009 (the "Complaints Regulations"), every NHS trust and clinical commissioning group must have a complaints manager and a two-stage complaints process. Stage 1 (local resolution) must be completed within 3-6 months. Stage 2 (independent review by the Parliamentary and Health Service Ombudsman) is available if you remain unhappy.',
    'The Health and Social Care Act 2008 (Regulated Activities) Regulations 2014 require care providers to meet fundamental standards, including person-centred care, dignity and respect, and safety. If a provider breaches these standards, the Care Quality Commission (CQC) can take enforcement action — and your complaint forms part of that evidence base.',
  ],
  rightsTitle: 'Your rights under NHS and health law',
  rights: [
    'Right to complain about any aspect of NHS care, treatment, or service',
    'Right to a response within 3 working days acknowledging your complaint',
    'Right to a full investigation and written response, usually within 25 working days',
    'Right to take your complaint to the Parliamentary and Health Service Ombudsman if unresolved',
    'Right to receive an apology and remedy when care has fallen below standard',
    'Right to complain on behalf of someone else if they cannot complain themselves',
    'Right to independent advocacy support to help you make your complaint',
    'Right to confidentiality — your care must not be affected by making a complaint',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Describe what happened',
      description:
        'Tell us about the incident — poor care, missed diagnosis, long wait, rude treatment, or failure to communicate. Plain English is fine.',
    },
    {
      step: '2',
      title: 'AI generates your letter',
      description:
        'Paybacker writes a formal NHS complaint letter citing the NHS Constitution, Complaints Regulations 2009, and relevant care standards.',
    },
    {
      step: '3',
      title: 'Send and get a response',
      description:
        'Submit your complaint to the NHS trust PALS team or complaints manager. They must acknowledge it within 3 working days and respond fully within 25.',
    },
  ],
  faqs: [
    {
      q: 'How long do I have to make an NHS complaint?',
      a: 'You should normally complain within 12 months of the incident, or from the date you became aware of it. The time limit can be extended if there are good reasons for the delay and the investigation is still possible.',
    },
    {
      q: 'What is PALS?',
      a: 'PALS (Patient Advice and Liaison Service) is a confidential service in every NHS trust that helps patients and families resolve concerns quickly. They can guide you through the complaints process and often resolve issues without a formal complaint.',
    },
    {
      q: 'Can I complain on behalf of a relative?',
      a: 'Yes. You can complain on behalf of someone else if they cannot complain themselves, for example because they are too ill, have died, or lack mental capacity. You will usually need their written consent unless they are deceased or a child.',
    },
    {
      q: 'What if I am not happy with the NHS response?',
      a: 'If the NHS trust response does not resolve your complaint, you can ask for an independent review by the Parliamentary and Health Service Ombudsman (PHSO). The PHSO is free, independent, and can recommend remedies including apologies, service changes, and financial compensation.',
    },
  ],
  finalCtaTitle: 'Ready to make your NHS complaint?',
  finalCtaSubtitle:
    'Generate a formal NHS complaint letter citing the NHS Constitution and health regulations in seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'How to Make an NHS Complaint UK | Free Letter Generator | Paybacker',
  description:
    'Make an NHS complaint with a formal letter citing the NHS Constitution and Complaints Regulations 2009. Generate your free complaint letter in seconds. Covers hospitals, GPs, mental health, and social care.',
  openGraph: {
    title: 'How to Make an NHS Complaint UK | Free Letter Generator',
    description:
      'Generate a formal NHS complaint letter citing UK health law in seconds. Free to use.',
    url: 'https://paybacker.co.uk/nhs-complaint',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/nhs-complaint' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
