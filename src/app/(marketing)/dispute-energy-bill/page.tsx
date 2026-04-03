import { Metadata } from 'next';
import LandingPage, { LandingPageData } from '@/components/LandingPage';

const data: LandingPageData = {
  h1: 'How to Dispute an Energy Bill UK',
  subtitle: 'Overcharged by your energy supplier? Under Ofgem rules, suppliers must bill accurately and refund overpayments within 10 working days. Generate a formal dispute letter citing the exact regulations in 30 seconds.',
  badge: 'Free to use — no credit card required',
  heroStat: '12 months',
  heroStatLabel: 'maximum backbilling period under Ofgem rules',
  heroStatColor: 'text-amber-400',
  ctaPrimary: 'Generate Your Free Energy Dispute Letter Now',
  socialProof: 'Thousands of UK households successfully dispute incorrect energy bills every year. Most are resolved within 8 weeks.',
  legislationTitle: 'Your legal rights when disputing an energy bill',
  legislationParagraphs: [
    'Under the Gas Act 1986 and Electricity Act 1989, Ofgem sets binding Standards of Conduct that every UK energy supplier must follow. These standards require suppliers to treat customers fairly and to bill accurately. If your supplier has overcharged you, used estimated readings when actual readings were available, or applied the wrong tariff, they are in breach of these standards and you are entitled to a formal complaint and a refund.',
    "The Backbilling Principle — established under Ofgem's billing rules — protects you from large catch-up bills after years of estimated readings. Your supplier cannot charge you for gas or electricity used more than 12 months before the bill was issued, if the delay in billing was their fault. If the debt is older than 12 months and the error was not yours, you are legally entitled to have it written off entirely.",
    'The Consumer Rights Act 2015 also applies. Energy services must be supplied with reasonable care and skill. If your supplier has persistently used incorrect readings, applied the wrong tariff, or failed to process a meter change correctly, you have grounds for a formal complaint under Section 55 of the Act, and may be entitled to additional compensation beyond the simple refund.',
  ],
  rightsTitle: 'Your rights under UK energy law',
  rights: [
    'Right to accurate billing using actual meter readings where possible',
    'Right to a refund within 10 working days if your account is in credit',
    'Backbilling protection: cannot be charged for usage more than 12 months old if the error was your supplier\'s fault',
    'Right to £30 compensation if your supplier fails to resolve a billing complaint within 10 working days',
    'Right to escalate to the Energy Ombudsman for free if unresolved after 8 weeks',
    'Right to a payment plan for disputed bills — suppliers cannot disconnect domestic customers in winter (October to March)',
    'Right to leave your supplier without exit fees if they are in breach of their obligations',
  ],
  howItWorks: [
    {
      step: '1',
      title: 'Describe your issue',
      description: 'Tell us what happened — overcharged, estimated bills, wrong tariff, or large catch-up bill. Plain English is fine.',
    },
    {
      step: '2',
      title: 'AI generates your letter',
      description: 'Paybacker writes a formal dispute letter citing the exact Ofgem rules and Consumer Rights Act provisions that apply to your situation.',
    },
    {
      step: '3',
      title: 'Send and get your refund',
      description: 'Email or post the letter to your supplier. They must respond within 8 weeks. Most disputes resolve within 2 to 4 weeks.',
    },
  ],
  faqs: [
    {
      q: 'What is the Backbilling Principle?',
      a: "Ofgem's Backbilling Principle says your energy supplier cannot charge you for gas or electricity used more than 12 months before the bill was issued, if the delay in billing was their fault. This protects you from large catch-up bills after years of estimated readings. If a catch-up bill covers usage more than 12 months old and the error was the supplier's, you are entitled to have that portion written off.",
    },
    {
      q: 'How long does an energy complaint take?',
      a: 'Suppliers must acknowledge your complaint within 2 working days and aim to resolve it within 8 weeks. If they fail to do so, or issue a deadlock letter, you can escalate for free to the Energy Ombudsman, who can award compensation and direct the supplier to refund you.',
    },
    {
      q: 'Can I withhold payment while a bill is disputed?',
      a: 'If you have genuine grounds for disputing a bill, you can withhold the disputed portion while your complaint is investigated. Pay any undisputed amount and make clear in writing which part you are disputing and why. Your supplier should not refer undisputed amounts to debt collection while a formal complaint is open.',
    },
    {
      q: 'What if my energy supplier has gone bust?',
      a: "If your supplier has been taken over under Ofgem's Supplier of Last Resort process, the new supplier is obligated to honour your existing tariff and credit balance. Contact the new supplier directly and follow the same complaints process. Credit balances are protected.",
    },
  ],
  finalCtaTitle: 'Ready to dispute your energy bill?',
  finalCtaSubtitle: 'Generate a formal complaint letter citing exact UK energy law in 30 seconds. Free to use.',
};

export const metadata: Metadata = {
  title: 'How to Dispute an Energy Bill UK | Free Letter Generator | Paybacker',
  description:
    'Dispute an overcharging energy bill with a formal letter citing Ofgem rules and Consumer Rights Act 2015. Generate your free complaint letter in 30 seconds. Works with all UK energy suppliers.',
  openGraph: {
    title: 'How to Dispute an Energy Bill UK | Free Letter Generator',
    description:
      'Dispute an overcharging energy bill with a formal letter citing Ofgem rules and Consumer Rights Act 2015. Generate your free complaint letter in 30 seconds.',
    url: 'https://paybacker.co.uk/dispute-energy-bill',
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: 'https://paybacker.co.uk/dispute-energy-bill' },
};

export default function Page() {
  return <LandingPage data={data} />;
}
