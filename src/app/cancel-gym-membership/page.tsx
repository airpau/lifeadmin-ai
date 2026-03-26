import { Metadata } from 'next';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import { Check, ArrowRight, Scale, FileText, Shield, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'How to Cancel Your Gym Membership UK | Paybacker',
  description:
    'Learn how to cancel your gym membership in the UK. Paybacker generates a cancellation letter citing the Consumer Contracts Regulations 2013 and Consumer Rights Act 2015 in 30 seconds.',
  other: {
    keywords:
      'cancel gym membership UK, gym cancellation letter, gym contract cancellation, cooling off period gym, unfair gym contract, cancel direct debit gym',
  },
  openGraph: {
    title: 'How to Cancel Your Gym Membership UK | Paybacker',
    description:
      'Generate a professional gym cancellation letter citing UK consumer law in 30 seconds. Free to use.',
    url: 'https://paybacker.co.uk/cancel-gym-membership',
    siteName: 'Paybacker',
    type: 'website',
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/cancel-gym-membership',
  },
};

const faqs = [
  {
    question: 'Do I have a cooling-off period to cancel my gym membership?',
    answer:
      'If you signed up online, by phone, or away from the gym premises, the Consumer Contracts Regulations 2013 give you a 14-day cooling-off period to cancel for any reason and receive a full refund. If you signed up in person at the gym, there is no automatic cooling-off period unless the gym contract includes one.',
  },
  {
    question: 'Can I cancel during a minimum term contract?',
    answer:
      'It depends on the contract terms. Most gyms require you to pay until the end of the minimum term. However, if the gym has significantly changed the terms (such as raising the price mid-contract), reduced facilities, or breached the contract, you may have grounds to cancel early under the Consumer Rights Act 2015.',
  },
  {
    question: 'Can I cancel my gym membership if I am moving house?',
    answer:
      'Some gym contracts include a clause allowing early cancellation if you move a certain distance from the gym. Check your contract terms. If no such clause exists, you may still be able to negotiate, especially if the gym is part of a chain and cannot offer a nearby alternative.',
  },
  {
    question: 'Can I cancel my gym membership for medical reasons?',
    answer:
      'Many gym contracts allow cancellation for medical reasons with a doctor\'s note. Even if the contract does not explicitly state this, the Consumer Rights Act 2015 protects against unfair terms. A clause that prevents cancellation for serious medical reasons could be deemed unfair and unenforceable.',
  },
  {
    question: 'What if the gym keeps charging me after I cancel?',
    answer:
      'If you have cancelled in writing and the gym continues to take payments, contact your bank to cancel the direct debit. Under the Direct Debit Guarantee, your bank must refund any payments taken in error. Keep a copy of your cancellation letter as evidence.',
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

export default function CancelGymMembershipPage() {
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
              <FileText className="h-4 w-4 text-mint-400" />
              <span className="text-mint-400 text-sm font-medium">UK Consumer Rights</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-heading)] mb-6">
              How to Cancel Your Gym Membership in the UK
            </h1>
            <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
              Stuck in a gym contract you want out of? UK consumer law gives you more rights than
              you think. Paybacker generates a professional cancellation letter in 30 seconds.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free gym cancellation letter
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
                  <strong className="text-white">Consumer Contracts Regulations 2013:</strong> If
                  you joined online, by phone, or away from the gym premises, you have a 14-day
                  cooling-off period to cancel and receive a full refund, no questions asked.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Consumer Rights Act 2015, Part 2 (Unfair Terms):</strong>{' '}
                  Any contract term that creates a significant imbalance to the detriment of the
                  consumer may be deemed unfair and unenforceable. This includes excessive exit fees,
                  unreasonable minimum terms, and clauses preventing cancellation for medical reasons.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Consumer Rights Act 2015, Section 62:</strong> A
                  term is unfair if it causes a significant imbalance in the parties&apos; rights and
                  obligations to the detriment of the consumer. Courts can strike down such terms.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Direct Debit Guarantee:</strong> If a gym takes
                  payments after you have cancelled, your bank must refund them under the Direct
                  Debit Guarantee scheme.
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
                'Generates a formal cancellation letter citing the Consumer Contracts Regulations 2013 and Consumer Rights Act 2015',
                'Identifies whether your contract contains unfair terms that can be challenged',
                'Includes the correct notice period and references your right to cancel the direct debit',
                'Provides guidance on escalation to Trading Standards or the small claims court if the gym refuses',
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
              How to Cancel Your Gym Membership: Step by Step
            </h2>
            <ol className="space-y-6">
              {[
                {
                  title: '1. Check your contract terms',
                  desc: 'Review your membership agreement for the notice period, minimum term, and cancellation process. Note whether you signed up online, by phone, or in person, as this affects your cooling-off rights.',
                },
                {
                  title: '2. Write a formal cancellation letter',
                  desc: 'Put your cancellation in writing, even if the gym says you can cancel verbally. Paybacker generates this letter for you, citing the relevant consumer law and your contract terms.',
                },
                {
                  title: '3. Send by recorded delivery or email with read receipt',
                  desc: 'Always keep proof that you sent the cancellation. Recorded delivery provides a signed receipt. If emailing, request a read receipt and save a copy of the sent email.',
                },
                {
                  title: '4. Cancel the direct debit with your bank',
                  desc: 'Once you have sent your cancellation letter, contact your bank to cancel the direct debit. This prevents the gym from taking further payments. Your bank can reclaim any incorrect charges under the Direct Debit Guarantee.',
                },
                {
                  title: '5. Follow up and escalate if needed',
                  desc: 'If the gym disputes your cancellation or continues to charge you, keep records of all correspondence. You can escalate to Trading Standards or take the matter to the small claims court.',
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
              Cancel Your Gym Membership Today
            </h2>
            <p className="text-slate-300 mb-8 max-w-xl mx-auto">
              Paybacker generates a professional cancellation letter citing UK consumer law in 30
              seconds. Stop paying for a gym you do not use.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free gym cancellation letter
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
