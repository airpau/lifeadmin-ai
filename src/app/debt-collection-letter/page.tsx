import { Metadata } from 'next';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import { Check, ArrowRight, Scale, FileText, Shield, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'How to Respond to a Debt Collection Letter UK | Paybacker',
  description:
    'Learn how to respond to a debt collection letter in the UK. Paybacker generates a professional dispute letter citing the Consumer Credit Act 1974 and Limitation Act 1980 in 30 seconds.',
  other: {
    keywords:
      'debt collection letter UK, respond to debt collector, statute barred debt, Consumer Credit Act 1974, debt dispute letter, prove you owe debt UK',
  },
  openGraph: {
    title: 'How to Respond to a Debt Collection Letter UK | Paybacker',
    description:
      'Generate a professional debt dispute letter citing UK consumer credit law in 30 seconds. Know your rights.',
    url: 'https://paybacker.co.uk/debt-collection-letter',
    siteName: 'Paybacker',
    type: 'website',
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/debt-collection-letter',
  },
};

const faqs = [
  {
    question: 'What is a statute-barred debt?',
    answer:
      'A debt becomes statute-barred if the creditor has not taken court action within 6 years of your last payment or written acknowledgement of the debt (5 years in Scotland). Under the Limitation Act 1980, once a debt is statute-barred, the creditor can no longer take you to court to recover it. However, the debt still technically exists and can appear on your credit file for up to 6 years from the default date.',
  },
  {
    question: 'Can a debt collector affect my credit file?',
    answer:
      'A debt collector can report a default to credit reference agencies, but only if the original creditor has not already done so. The default stays on your credit file for 6 years from the date of the original default, regardless of whether the debt is sold to a collector. If a debt collector reports incorrect information, you can dispute it with the credit reference agency under the Data Protection Act 2018.',
  },
  {
    question: 'What counts as harassment from a debt collector?',
    answer:
      'Under FCA rules and the Protection from Harassment Act 1997, debt collectors must not contact you at unreasonable times, use threatening language, discuss your debt with third parties, misrepresent their authority, or contact you repeatedly in a way that causes distress. If a collector harasses you, report them to the Financial Conduct Authority.',
  },
  {
    question: 'Do I have to prove I owe the debt?',
    answer:
      'No. The burden of proof is on the creditor or debt collector. Under Section 77-79 of the Consumer Credit Act 1974, you can request a copy of the original credit agreement. If they cannot produce it, they cannot enforce the debt in court. You have the right to send a formal request and they must respond within 12 working days.',
  },
  {
    question: 'What should I do if I receive a debt collection letter for a debt I do not recognise?',
    answer:
      'Do not ignore it, but do not pay it either. Write to the debt collector requesting proof of the debt, including the original credit agreement and a full statement of account. Under the Consumer Credit Act 1974, they must provide this. If they cannot prove you owe the debt, they cannot enforce it. Paybacker generates this request letter for you.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

export default function DebtCollectionLetterPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNavbar />
      <div className="h-16" />

      <main className="min-h-screen bg-navy-950 text-white">
        {/* Hero */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-3xl text-center">
            <div className="inline-flex items-center gap-2 bg-mint-400/10 border border-mint-400/20 rounded-full px-4 py-1.5 mb-6">
              <Shield className="h-4 w-4 text-mint-400" />
              <span className="text-mint-400 text-sm font-medium">UK Consumer Credit Rights</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-heading)] mb-6">
              How to Respond to a Debt Collection Letter
            </h1>
            <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
              Received a letter from a debt collector? Do not panic. UK law gives you strong rights
              to challenge, dispute, and defend yourself. Paybacker generates a professional response
              letter in 30 seconds.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free debt dispute letter
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* What the law says */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] mb-8">
              What the Law Says
            </h2>
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 md:p-8 space-y-4">
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Consumer Credit Act 1974, Sections 77-79:</strong>{' '}
                  You have the legal right to request a copy of your original credit agreement from
                  any creditor or debt collector. They must provide it within 12 working days. If
                  they cannot produce it, they cannot enforce the debt in court.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Limitation Act 1980:</strong> In England, Wales,
                  and Northern Ireland, most debts become statute-barred after 6 years from the last
                  payment or written acknowledgement. In Scotland, the Prescription and Limitation
                  (Scotland) Act 1973 sets the limit at 5 years. Once statute-barred, the creditor
                  cannot take court action.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Financial Conduct Authority (FCA) Rules:</strong>{' '}
                  All debt collectors must be authorised by the FCA. They must treat customers
                  fairly, not use deceptive practices, and must stop collection activity if the debt
                  is genuinely disputed until the dispute is resolved.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Protection from Harassment Act 1997:</strong> Debt
                  collectors must not harass you. Repeated phone calls, threatening language,
                  contacting you at unreasonable hours, or discussing your debt with others are all
                  potential breaches.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How Paybacker helps */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] mb-8">
              How Paybacker Helps
            </h2>
            <ul className="space-y-4">
              {[
                'Generates a formal debt dispute letter requesting proof of the debt under the Consumer Credit Act 1974',
                'Identifies whether the debt may be statute-barred under the Limitation Act 1980',
                'Cites FCA rules and warns the collector against harassment or unfair practices',
                'Provides a professional response ready to send, putting you in control of the situation',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-mint-400 mt-0.5 shrink-0" />
                  <span className="text-slate-300">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Step by step */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] mb-8">
              How to Respond to a Debt Collection Letter: Step by Step
            </h2>
            <ol className="space-y-6">
              {[
                {
                  title: '1. Do not ignore the letter',
                  desc: 'Ignoring a debt collection letter does not make it go away. Even if you do not recognise the debt, respond in writing to protect your rights and create a paper trail.',
                },
                {
                  title: '2. Check if the debt is valid',
                  desc: 'Think about whether you recognise the debt. Check the amount, the original creditor, and the dates. If you are unsure, do not acknowledge the debt or make any payment until you have more information.',
                },
                {
                  title: '3. Request the original credit agreement',
                  desc: 'Under Sections 77-79 of the Consumer Credit Act 1974, write to the debt collector requesting a copy of the original signed credit agreement. Paybacker generates this letter for you. They must respond within 12 working days.',
                },
                {
                  title: '4. Check if the debt is statute-barred',
                  desc: 'If more than 6 years have passed since your last payment or written acknowledgement (5 years in Scotland), the debt may be statute-barred. The creditor cannot take you to court for a statute-barred debt.',
                },
                {
                  title: '5. Dispute or negotiate',
                  desc: 'If the debt collector cannot produce the credit agreement, they cannot enforce the debt. If the debt is valid but you are struggling to pay, you can propose a repayment plan. Free debt advice is available from StepChange and Citizens Advice.',
                },
              ].map((step) => (
                <li key={step.title} className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                  <p className="text-slate-300">{step.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] mb-8">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <article
                  key={faq.question}
                  className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6"
                >
                  <h3 className="text-lg font-semibold text-white mb-2">{faq.question}</h3>
                  <p className="text-slate-300">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-20 px-4">
          <div className="container mx-auto max-w-3xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-heading)] mb-4">
              Know Your Rights Against Debt Collectors
            </h2>
            <p className="text-slate-300 mb-8 max-w-xl mx-auto">
              Paybacker generates a professional debt dispute letter citing the Consumer Credit Act
              and Limitation Act in 30 seconds. Do not let debt collectors pressure you into paying
              what you may not owe.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free debt dispute letter
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Footer link */}
        <footer className="py-8 px-4 border-t border-navy-700/50">
          <div className="container mx-auto max-w-3xl text-center">
            <Link href="/" className="text-slate-400 hover:text-white text-sm transition-colors">
              &larr; Back to paybacker.co.uk
            </Link>
          </div>
        </footer>
      </main>
    </>
  );
}
