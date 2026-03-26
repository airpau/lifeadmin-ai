import { Metadata } from 'next';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import { Check, ArrowRight, Scale, FileText, Shield, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'How to Dispute an Energy Bill in the UK | Paybacker',
  description:
    'Learn how to dispute an unfair energy bill in the UK. Paybacker generates a professional complaint letter citing Ofgem rules and the Consumer Rights Act 2015 in 30 seconds.',
  other: {
    keywords:
      'dispute energy bill UK, energy bill complaint, Ofgem complaint, overcharged energy, back-billing rules UK, estimated bill dispute',
  },
  openGraph: {
    title: 'How to Dispute an Energy Bill in the UK | Paybacker',
    description:
      'Generate a professional energy complaint letter citing exact UK legislation in 30 seconds. Free to use.',
    url: 'https://paybacker.co.uk/dispute-energy-bill',
    siteName: 'Paybacker',
    type: 'website',
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/dispute-energy-bill',
  },
};

const faqs = [
  {
    question: 'How long do I have to dispute an energy bill in the UK?',
    answer:
      'Under Ofgem back-billing rules, your energy supplier cannot charge you for energy used more than 12 months ago if they failed to bill you correctly. For general billing disputes, you should raise the issue as soon as you notice it. If your supplier does not resolve the complaint within 8 weeks, you can escalate to the Energy Ombudsman.',
  },
  {
    question: 'How does the Energy Ombudsman process work?',
    answer:
      'First, you must complain directly to your energy supplier and give them 8 weeks to respond. If they fail to resolve it, or issue a deadlock letter, you can escalate to the Energy Ombudsman for free. The Ombudsman will review both sides and issue a binding decision. Suppliers must comply with the ruling.',
  },
  {
    question: 'What are the Ofgem back-billing rules?',
    answer:
      'Ofgem back-billing rules state that if your energy supplier has not billed you accurately, they can only charge you for energy used in the last 12 months. This applies to both gas and electricity. If they try to bill you for usage older than 12 months due to their own error, you have the right to refuse payment for that period.',
  },
  {
    question: 'Can I dispute an estimated energy bill?',
    answer:
      'Yes. If your bill is based on estimated readings and you believe it is too high, you can submit an actual meter reading to your supplier and request a corrected bill. Under the Gas Act 1986 and Electricity Act 1989, suppliers must use accurate data when billing. If they refuse to adjust, you can escalate to the Energy Ombudsman.',
  },
  {
    question: 'What happens if my energy supplier ignores my complaint?',
    answer:
      'If your supplier does not respond within 8 weeks, or you receive a deadlock letter, you can take your complaint to the Energy Ombudsman free of charge. The Ombudsman can order your supplier to apologise, correct your bill, or pay you compensation.',
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

export default function DisputeEnergyBillPage() {
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
              <Scale className="h-4 w-4 text-mint-400" />
              <span className="text-mint-400 text-sm font-medium">UK Consumer Rights</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-heading)] mb-6">
              How to Dispute an Energy Bill in the UK
            </h1>
            <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
              Overcharged on gas or electricity? You have legal rights. Paybacker generates a
              professional complaint letter citing exact UK energy legislation in 30 seconds.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free energy complaint letter
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
                  <strong className="text-white">Ofgem Back-Billing Rules:</strong> Energy suppliers
                  cannot charge you for energy used more than 12 months ago if they failed to send
                  accurate bills during that period.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Gas Act 1986 &amp; Electricity Act 1989:</strong>{' '}
                  Suppliers are legally required to bill accurately based on actual meter readings
                  where available. Persistent estimated billing without attempting to read the meter
                  is a breach of licence conditions.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Consumer Rights Act 2015, Section 49:</strong>{' '}
                  Energy supply is a service that must be carried out with reasonable care and skill.
                  Incorrect billing or failure to resolve complaints breaches this duty.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Energy Ombudsman:</strong> If your supplier does
                  not resolve your complaint within 8 weeks, or issues a deadlock letter, you can
                  escalate for free. The Ombudsman can order billing corrections and compensation.
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
                'Generates a formal complaint letter citing Ofgem rules, the Gas Act, and Consumer Rights Act 2015 in under 30 seconds',
                'Includes the correct escalation path to the Energy Ombudsman with deadlines',
                'References back-billing protection so suppliers cannot overcharge you for past periods',
                'Provides a professional, legally-grounded letter ready to send by email or post',
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
              How to Dispute an Energy Bill: Step by Step
            </h2>
            <ol className="space-y-6">
              {[
                {
                  title: '1. Check your meter reading',
                  desc: 'Take a current meter reading and compare it with the reading on your bill. If your bill is based on an estimate, submit the actual reading to your supplier.',
                },
                {
                  title: '2. Compare recent bills',
                  desc: 'Look at your bills over the past 12 months. A sudden spike without a change in usage could indicate an error, an incorrect tariff, or a missed meter reading.',
                },
                {
                  title: '3. Contact your supplier with a formal complaint',
                  desc: 'Write a formal complaint citing the specific issue. Paybacker generates this letter for you, referencing the relevant legislation and Ofgem rules.',
                },
                {
                  title: '4. Allow 8 weeks for a response',
                  desc: 'Your supplier has 8 weeks to resolve the complaint. Keep records of all correspondence, including dates, reference numbers, and names of staff.',
                },
                {
                  title: '5. Escalate to the Energy Ombudsman',
                  desc: 'If the supplier fails to resolve your complaint within 8 weeks, or sends a deadlock letter, submit your case to the Energy Ombudsman for a free, independent review.',
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
              Stop Overpaying on Energy
            </h2>
            <p className="text-slate-300 mb-8 max-w-xl mx-auto">
              Paybacker generates a professional complaint letter in 30 seconds, citing the exact UK
              laws that protect you. Free to get started.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free energy complaint letter
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
