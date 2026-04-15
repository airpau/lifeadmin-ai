import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'Dispute Unfair Bank & Overdraft Charges Instantly',
  subtitle: 'Hit with an unexpected overdraft fee, failed direct debit charge, or hidden account fee? Don\'t just accept it. Our AI securely scans your bank and generates custom, legally-sound dispute letters citing UK consumer law to get your money back.',
  badge: 'Free to use — challenge fees from all major UK banks',
  heroStat: '100%',
  heroStatLabel: 'custom drafted AI dispute letters based on your exact bank',
  heroStatColor: 'text-rose-500',
  ctaPrimary: 'Scan Your Bank & Dispute Charges Now',
  socialProof: 'Millions of pounds in unfair bank charges are paid by UK consumers every year simply because they don\'t know how to fight back.',
  legislationTitle: 'Financial Ombudsman and FCA Guidelines — your right to fair treatment',
  legislationParagraphs: [
    "Under guidelines set by the Financial Conduct Authority (FCA) and standard practices upheld by the Financial Ombudsman Service (FOS), UK banks are required to treat customers fairly. If an overdraft fee or returned item fee is disproportionate entirely to the administrative cost the bank incurs, it can often be challenged as an unfair term.",
    'Many people are hit with "cascading fees"—where one missed payment causes a chain reaction of overdraft and late fees, putting you in financial hardship. Banks have a specific regulatory duty to assist customers in financial difficulty, not penalise them further. If the charges pushed you into hardship, you have a strong case for a full refund.',
    'You don\'t need a lawyer to get your fees back. By citing the appropriate FCA handbook rules and asserting financial hardship or disproportionate penalties, our AI drafts a formal dispute letter addressed directly to your bank\'s complaints department. If they fail to resolve it within 8 weeks, you have the auto-escalated right to take it to the Financial Ombudsman.',
  ],
  rightsTitle: 'When you can challenge bank fees',
  rights: [
    'The fee is disproportionate to the actual cost the bank incurred',
    'The charges have caused or exacerbated financial hardship',
    'You were not properly notified of the fee changes',
    'A chain reaction of fees occurred from a single mistake',
    'You are a vulnerable customer (e.g., health issues, sudden job loss)',
    'Right to escalate unresolved complaints to the Financial Ombudsman Service for free',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Securely link your bank',
      description: 'Connect via Open Banking to safely scan your statements for overdraft, late payment, or account fees from the last 12 months.',
    },
    {
      step: '2',
      title: 'AI generates your dispute',
      description: 'The AI identifies unfair charges and drafts a formal legal letter citing FCA regulations and hardship rules, addressed to your bank.',
    },
    {
      step: '3',
      title: 'Submit and get refunded',
      description: 'Send the letter directly. The bank has 8 weeks to respond. If they refuse, escalate it to the Ombudsman for free.',
    },
  ],
  faqs: [
    {
      q: 'Which banks can I dispute charges with?',
      a: "Our AI supports disputes with all major UK high street and challenger banks, including Barclays, HSBC, Lloyds, NatWest, Monzo, Starling, and Santander.",
    },
    {
      q: 'What is "financial hardship" regarding bank charges?',
      a: "Financial hardship occurs when bank fees prevent you from paying for basic necessities like rent, mortgage, or food. If bank charges caused this, the FCA requires banks to treat you with forbearance, which often means refunding the fees.",
    },
    {
      q: 'Can I do this myself without the AI?',
      a: 'Yes, you can write to your bank yourself. However, using our AI ensures you cite the correct FCA regulations and format the complaint precisely how the bank\'s compliance department needs to see it, significantly increasing your chances of success.',
    },
    {
      q: 'What happens if the bank ignores me?',
      a: 'If the bank does not resolve the complaint to your satisfaction within 8 weeks, or issues a "deadlock letter", you can refer the case to the Financial Ombudsman Service (FOS) entirely for free.',
    },
  ],
  finalCtaTitle: 'Ready to reclaim your bank fees?',
  finalCtaSubtitle: 'Connect your bank safely and generate a formal dispute letter in seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'Dispute Unfair Bank Charges & Overdraft Fees | Paybacker',
  description:
    'Hit with unfair overdraft fees or bank charges? Generate a free AI dispute letter citing FCA guidelines to get your money refunded. Works with all UK banks.',
  openGraph: {
    title: 'Dispute Unfair Bank Charges & Overdraft Fees',
    description:
      'Hit with unfair overdraft fees or bank charges? Generate a free AI dispute letter citing FCA guidelines to get your money refunded. Works with all UK banks.',
    url: 'https://paybacker.co.uk/unfair-bank-charges',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/unfair-bank-charges' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
