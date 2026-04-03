import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'How to Respond to a Debt Collection Letter UK',
  subtitle: "Received a letter from a debt collector? Do not pay without understanding your rights first. The debt may be statute-barred, the amount may be wrong, or the collector may be unable to produce the original credit agreement. Generate your response letter now.",
  badge: 'Free response letter — know your rights before you pay',
  heroStat: '6 years',
  heroStatLabel: 'limitation period for most unsecured debts in England and Wales',
  heroStatColor: 'text-red-400',
  ctaPrimary: 'Generate Your Free Debt Response Letter Now',
  socialProof: 'Billions of pounds of UK debt is either statute-barred, unenforceable, or incorrectly calculated — but most people pay without checking.',
  legislationTitle: 'Consumer Credit Act 1974 and your rights when dealing with debt collectors',
  legislationParagraphs: [
    'The Consumer Credit Act 1974 (CCA) is the most important piece of legislation when dealing with debt collectors. Under Sections 77 to 79 of the CCA, you have the right to request a copy of the original credit agreement from the creditor or their agent. They must provide this within 12 working days. If they cannot produce a compliant copy of the original signed agreement, they cannot legally enforce the debt during that period of non-compliance and are not entitled to payment until they comply.',
    'The Limitation Act 1980 provides a separate and frequently overlooked protection. Most unsecured consumer debts — credit cards, personal loans, catalogue accounts, and overdrafts — become statute-barred after 6 years in England and Wales (5 years in Scotland). A statute-barred debt cannot be successfully enforced through the courts. The 6-year clock starts from the date of the last payment or the last written acknowledgement of the debt. Critically, once a debt is statute-barred, you must not make any payment or acknowledge it in writing, as this can restart the limitation period.',
    "FCA-authorised debt collectors must comply with strict conduct rules set out in the FCA's Debt Collection Guidance. These rules prohibit harassment, misleading communications, excessive contact, threatening legal action that is not genuinely intended or not legally possible, and pursuing statute-barred debts in a way that implies a legal obligation to pay. Breaches of these rules can be reported to the Financial Ombudsman Service at no cost, and the FOS can award compensation.",
  ],
  rightsTitle: 'Your rights when dealing with debt collectors',
  rights: [
    'Right to request the original credit agreement under Section 77-79 of the Consumer Credit Act 1974 within 12 working days',
    'Statute-barred protection: debts over 6 years old in England/Wales (5 in Scotland) with no recent payment or acknowledgement cannot be enforced in court',
    'Right not to be harassed, threatened, or contacted at unreasonable times',
    'Right to request all future communication in writing and refuse telephone contact',
    'Right to a full written breakdown of the debt: original amount, interest, charges, and any fees added',
    'Right to complain to the Financial Ombudsman Service if the collector breaches FCA Debt Collection Guidance',
    'Debt sold to a third party: the new owner has no greater rights than the original creditor',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Tell us the situation',
      description: 'Who the debt collector is, what type of debt, when you last made a payment or acknowledged it, and whether you recognise the amount claimed.',
    },
    {
      step: '2',
      title: 'AI writes your response',
      description: 'Formal response letter citing CCA 1974 rights, the Limitation Act 1980, and FCA Debt Collection Guidance — tailored to your circumstances.',
    },
    {
      step: '3',
      title: 'Send and protect yourself',
      description: 'Send by recorded delivery and keep copies. If harassment continues, escalate for free to the Financial Ombudsman Service.',
    },
  ],
  faqs: [
    {
      q: 'What should I do first when I receive a debt collection letter?',
      a: 'Do not panic and do not pay immediately. First check whether the debt is yours, whether the amount looks right, and — crucially — when you last made a payment. If the last payment was over 6 years ago (5 in Scotland) and you have not acknowledged the debt in writing since, it may be statute-barred and unenforceable in court.',
    },
    {
      q: 'What exactly is a statute-barred debt?',
      a: 'A statute-barred debt is one where the limitation period under the Limitation Act 1980 has expired. In England and Wales, this is 6 years from the date of the last payment or written acknowledgement. After this date, the creditor cannot obtain a County Court Judgment. They can still contact you, but they cannot successfully enforce the debt through the courts.',
    },
    {
      q: 'Will requesting proof of the debt stop the debt collection calls?',
      a: 'While a CCA request is outstanding and the creditor is in default, they cannot take enforcement action. However, they may continue to contact you. You can also request — in writing — that all future contact be by letter only, and refuse telephone communication. Keep records of any contact made after you have made this request in writing.',
    },
    {
      q: 'Can a debt collector add interest and charges to the original debt?',
      a: 'A creditor can only add interest and charges if the original credit agreement allowed for this. They cannot add charges that were not provided for in the original agreement. Your CCA request will clarify what was contractually permitted, and any charges beyond what the agreement allows can be challenged.',
    },
  ],
  finalCtaTitle: 'Ready to respond to your debt collection letter?',
  finalCtaSubtitle: 'Generate a formal response citing UK debt law in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'How to Respond to a Debt Collection Letter UK | Free Letter | Paybacker',
  description:
    'Know your rights before paying a debt collector. The debt may be statute-barred under the Limitation Act 1980 or unenforceable under the Consumer Credit Act 1974. Free response letter generator.',
  openGraph: {
    title: 'How to Respond to a Debt Collection Letter UK | Free Letter',
    description:
      'Know your rights before paying a debt collector. The debt may be statute-barred or unenforceable. Free response letter citing Consumer Credit Act 1974 and Limitation Act 1980.',
    url: 'https://paybacker.co.uk/debt-collection-response',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/debt-collection-response' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
