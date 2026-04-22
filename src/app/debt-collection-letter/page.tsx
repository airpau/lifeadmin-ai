import { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Shield } from 'lucide-react';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import '../(marketing)/styles.css';

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

const lawCitations = [
  {
    title: 'Consumer Credit Act 1974, Sections 77-79',
    body:
      'You have the legal right to request a copy of your original credit agreement from any creditor or debt collector. They must provide it within 12 working days. If they cannot produce it, they cannot enforce the debt in court.',
  },
  {
    title: 'Limitation Act 1980',
    body:
      'In England, Wales, and Northern Ireland, most debts become statute-barred after 6 years from the last payment or written acknowledgement. In Scotland, the Prescription and Limitation (Scotland) Act 1973 sets the limit at 5 years. Once statute-barred, the creditor cannot take court action.',
  },
  {
    title: 'Financial Conduct Authority (FCA) Rules',
    body:
      'All debt collectors must be authorised by the FCA. They must treat customers fairly, not use deceptive practices, and must stop collection activity if the debt is genuinely disputed until the dispute is resolved.',
  },
  {
    title: 'Protection from Harassment Act 1997',
    body:
      'Debt collectors must not harass you. Repeated phone calls, threatening language, contacting you at unreasonable hours, or discussing your debt with others are all potential breaches.',
  },
];

const steps = [
  {
    step: '1',
    title: 'Do not ignore the letter',
    body:
      'Ignoring a debt collection letter does not make it go away. Even if you do not recognise the debt, respond in writing to protect your rights and create a paper trail.',
  },
  {
    step: '2',
    title: 'Check if the debt is valid',
    body:
      'Think about whether you recognise the debt. Check the amount, the original creditor, and the dates. If you are unsure, do not acknowledge the debt or make any payment until you have more information.',
  },
  {
    step: '3',
    title: 'Request the original credit agreement',
    body:
      'Under Sections 77-79 of the Consumer Credit Act 1974, write to the debt collector requesting a copy of the original signed credit agreement. Paybacker generates this letter for you. They must respond within 12 working days.',
  },
  {
    step: '4',
    title: 'Check if the debt is statute-barred',
    body:
      'If more than 6 years have passed since your last payment or written acknowledgement (5 years in Scotland), the debt may be statute-barred. The creditor cannot take you to court for a statute-barred debt.',
  },
  {
    step: '5',
    title: 'Dispute or negotiate',
    body:
      'If the debt collector cannot produce the credit agreement, they cannot enforce the debt. If the debt is valid but you are struggling to pay, you can propose a repayment plan. Free debt advice is available from StepChange and Citizens Advice.',
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
    <div className="m-land-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarkNav />
      <main>
        <div className="wrap">
          <section className="land-hero">
            <span className="badge">
              <Shield width={14} height={14} aria-hidden="true" />
              UK Consumer Credit Rights
            </span>
            <h1>How to respond to a debt collection letter</h1>
            <p className="subtitle">
              Received a letter from a debt collector? Do not panic. UK law gives you strong
              rights to challenge, dispute, and defend yourself. Paybacker generates a
              professional response letter in 30 seconds.
            </p>
            <div className="hero-stat">
              <span className="stat-value">30 sec</span>
              <span className="stat-label">to generate your dispute letter</span>
            </div>
            <Link href="/auth/signup" className="btn btn-mint btn-lg">
              Generate your free debt dispute letter{' '}
              <ArrowRight width={16} height={16} aria-hidden="true" />
            </Link>
            <p className="social-proof">
              Cites the Consumer Credit Act 1974, Limitation Act 1980, and FCA rules
            </p>
          </section>

          <section className="prose-section">
            <div className="rights-card">
              <h2>What the law says</h2>
              <ul className="rights-list">
                {lawCitations.map((law) => (
                  <li key={law.title}>
                    <strong>{law.title}:</strong> {law.body}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="prose-section">
            <div className="rights-card">
              <h2>How Paybacker helps</h2>
              <ul className="rights-list">
                <li>
                  Generates a formal debt dispute letter requesting proof of the debt under the
                  Consumer Credit Act 1974.
                </li>
                <li>
                  Identifies whether the debt may be statute-barred under the Limitation Act
                  1980.
                </li>
                <li>
                  Cites FCA rules and warns the collector against harassment or unfair
                  practices.
                </li>
                <li>
                  Provides a professional response ready to send, putting you in control of the
                  situation.
                </li>
              </ul>
            </div>
          </section>

          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>
              How to respond to a debt collection letter: step by step
            </h2>
            <div className="step-grid">
              {steps.map(({ step, title, body }) => (
                <div key={step} className="step">
                  <div className="step-badge">{step}</div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="prose-section">
            <div className="soft-cta">
              <p>
                Need free debt advice? <a href="https://www.stepchange.org" target="_blank" rel="noopener noreferrer">StepChange</a> and{' '}
                <a href="https://www.citizensadvice.org.uk" target="_blank" rel="noopener noreferrer">Citizens Advice</a>{' '}
                offer confidential, non-judgemental help at no cost.
              </p>
            </div>
          </section>

          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>Frequently asked questions</h2>
            <div className="faq-grid">
              {faqs.map((faq) => (
                <article key={faq.question} className="faq-card">
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="prose-section">
            <div className="final-cta">
              <h2>Know your rights against debt collectors</h2>
              <p>
                Paybacker generates a professional debt dispute letter citing the Consumer
                Credit Act and Limitation Act in 30 seconds. Do not let debt collectors
                pressure you into paying what you may not owe.
              </p>
              <Link href="/auth/signup" className="btn btn-mint btn-lg">
                Generate your free debt dispute letter{' '}
                <ArrowRight width={16} height={16} aria-hidden="true" />
              </Link>
              <p style={{ marginTop: 18, fontSize: 13, color: 'var(--text-on-ink-dim)' }}>
                No credit card required. Free plan available.
              </p>
            </div>
          </section>
        </div>
      </main>
      <MarkFoot />
    </div>
  );
}
