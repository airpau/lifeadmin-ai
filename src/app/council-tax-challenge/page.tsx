import { Metadata } from 'next';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import { Check, ArrowRight, Scale, FileText, Shield, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Challenge Your Council Tax Band for Free UK | Paybacker',
  description:
    'Learn how to challenge your council tax band in the UK for free. Paybacker generates a professional appeal letter referencing the Local Government Finance Act 1992 in 30 seconds.',
  other: {
    keywords:
      'council tax band challenge UK, council tax appeal, Valuation Office Agency, council tax too high, council tax reduction, council tax band check',
  },
  openGraph: {
    title: 'Challenge Your Council Tax Band for Free UK | Paybacker',
    description:
      'Generate a professional council tax band challenge letter in 30 seconds. The process is completely free.',
    url: 'https://paybacker.co.uk/council-tax-challenge',
    siteName: 'Paybacker',
    type: 'website',
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/council-tax-challenge',
  },
};

const faqs = [
  {
    question: 'Does it cost anything to challenge my council tax band?',
    answer:
      'No. Challenging your council tax band with the Valuation Office Agency (VOA) is completely free. There are no fees to submit a proposal, and the VOA will review your case at no cost. You do not need a solicitor or any paid service.',
  },
  {
    question: 'How long does a council tax band challenge take?',
    answer:
      'The VOA aims to resolve proposals within a few months, but it can take longer in complex cases. If the VOA does not agree with your challenge, you can appeal to the Valuation Tribunal, which typically schedules a hearing within 6 to 12 months.',
  },
  {
    question: 'If my band is reduced, will I get a backdated refund?',
    answer:
      'Yes. If your council tax band is lowered, the reduction is backdated to when you became liable for the property, or to 1 April 1993 (when the current banding system began), whichever is later. Your council will recalculate your bills and issue a refund for any overpayment.',
  },
  {
    question: 'Can my council tax band go up if I challenge it?',
    answer:
      'Yes, this is a risk. The VOA reviews the banding of your property and can increase it if they determine the current band is too low. Before challenging, compare your property with similar neighbouring properties to make sure your band genuinely appears too high.',
  },
  {
    question: 'What evidence do I need for a council tax band challenge?',
    answer:
      'The strongest evidence is comparable properties. Find similar properties in your street or area that are in a lower band and show that your property is comparable in size, type, and value. You can check bands on the VOA website. Sale prices from 1991 (the valuation date for England) or 2003 (Wales) are also useful.',
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

export default function CouncilTaxChallengePage() {
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
              <span className="text-mint-400 text-sm font-medium">Free to Challenge</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-heading)] mb-6">
              Challenge Your Council Tax Band for Free
            </h1>
            <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
              Millions of UK properties are in the wrong council tax band. If yours is too high, you
              could save hundreds of pounds a year and get a backdated refund. The challenge process
              is completely free.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free council tax challenge letter
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
                  <strong className="text-white">Local Government Finance Act 1992:</strong> Council
                  tax bands in England are based on the estimated market value of a property on 1
                  April 1991. The Act gives any council tax payer the right to challenge their
                  banding if they believe it is incorrect.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Valuation Office Agency (VOA):</strong> The VOA is
                  responsible for assigning and maintaining council tax bands. You can submit a
                  formal proposal to the VOA to have your band reviewed. The process is free and you
                  do not need legal representation.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Valuation Tribunal:</strong> If the VOA does not
                  agree to change your band, you can appeal to the independent Valuation Tribunal.
                  The hearing is free and informal, and you can represent yourself.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Backdated refunds:</strong> If your band is
                  reduced, the change is backdated to when you became liable for the property or 1
                  April 1993, whichever is later. Overpayments are refunded by your local council.
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
                'Generates a formal council tax band challenge letter referencing the Local Government Finance Act 1992',
                'Explains how to find comparable properties and structure your evidence',
                'Includes the correct VOA submission process and Valuation Tribunal escalation path',
                'Highlights the potential for backdated refunds going back years',
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
              How to Challenge Your Council Tax Band: Step by Step
            </h2>
            <ol className="space-y-6">
              {[
                {
                  title: '1. Check your current band',
                  desc: 'Visit the VOA website (gov.uk/council-tax-bands) to confirm your property\'s current council tax band and see the bands of nearby properties.',
                },
                {
                  title: '2. Compare with your neighbours',
                  desc: 'Look at similar properties in your street or area. If comparable homes (similar size, type, and condition) are in a lower band, you have strong grounds for a challenge.',
                },
                {
                  title: '3. Gather your evidence',
                  desc: 'Collect details of comparable properties in lower bands, including their addresses and band letters. Historical sale prices from 1991 can also support your case. Paybacker helps you structure this evidence.',
                },
                {
                  title: '4. Submit your proposal to the VOA',
                  desc: 'Submit a formal proposal to the VOA online or by post. Include your evidence and explain why you believe your band is too high. Paybacker generates the letter for you.',
                },
                {
                  title: '5. Appeal to the Valuation Tribunal if needed',
                  desc: 'If the VOA rejects your proposal, you can appeal to the Valuation Tribunal within 3 months. The hearing is free and you can attend in person or submit your case in writing.',
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
              Could You Be Paying Too Much Council Tax?
            </h2>
            <p className="text-slate-300 mb-8 max-w-xl mx-auto">
              Millions of UK homes are in the wrong band. Paybacker generates your challenge letter
              in 30 seconds. The process is completely free and refunds are backdated.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free council tax challenge letter
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
