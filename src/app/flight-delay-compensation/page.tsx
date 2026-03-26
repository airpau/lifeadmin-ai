import { Metadata } from 'next';
import Link from 'next/link';
import PublicNavbar from '@/components/PublicNavbar';
import { Check, ArrowRight, Scale, FileText, Shield, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Claim Up to £520 Flight Delay Compensation UK | Paybacker',
  description:
    'Claim flight delay compensation of up to £520 under UK261. Paybacker generates a professional claim letter citing UK aviation law in 30 seconds.',
  other: {
    keywords:
      'flight delay compensation UK, UK261 claim, flight cancellation compensation, delayed flight refund, Civil Aviation Authority complaint, EU261 UK',
  },
  openGraph: {
    title: 'Claim Up to £520 Flight Delay Compensation UK | Paybacker',
    description:
      'Generate a professional flight delay compensation letter citing UK261 in 30 seconds. Claims up to £520.',
    url: 'https://paybacker.co.uk/flight-delay-compensation',
    siteName: 'Paybacker',
    type: 'website',
  },
  alternates: {
    canonical: 'https://paybacker.co.uk/flight-delay-compensation',
  },
};

const faqs = [
  {
    question: 'How long do I have to claim flight delay compensation in the UK?',
    answer:
      'In England, Wales, and Northern Ireland, you have 6 years from the date of the flight to make a claim under the Limitation Act 1980. In Scotland, the time limit is 5 years. This applies to both UK261 and retained EU261 claims.',
  },
  {
    question: 'What counts as extraordinary circumstances?',
    answer:
      'Airlines do not have to pay compensation if the delay was caused by extraordinary circumstances beyond their control. This includes severe weather, air traffic control strikes, security threats, and political instability. However, technical faults and staff shortages are generally not considered extraordinary circumstances.',
  },
  {
    question: 'How much compensation can I claim by distance?',
    answer:
      'For flights under 1,500 km, you can claim up to £220. For flights between 1,500 km and 3,500 km, up to £350. For flights over 3,500 km, up to £520. These amounts apply when the delay at arrival is 3 hours or more.',
  },
  {
    question: 'Can I claim compensation for charter flights?',
    answer:
      'Yes. UK261 applies to all flights departing from a UK airport, regardless of the airline, and to flights arriving in the UK operated by a UK or EU carrier. This includes charter flights and package holiday flights.',
  },
  {
    question: 'What if the airline refuses to pay?',
    answer:
      'If the airline rejects your claim or does not respond within 8 weeks, you can escalate to an Alternative Dispute Resolution (ADR) scheme approved by the Civil Aviation Authority, or to the CAA directly if the airline is not a member of an ADR scheme.',
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

export default function FlightDelayCompensationPage() {
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
              <span className="text-mint-400 text-sm font-medium">UK Aviation Rights</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold font-[family-name:var(--font-heading)] mb-6">
              Claim Up to £520 Flight Delay Compensation
            </h1>
            <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
              Was your flight delayed by 3 hours or more? Cancelled without notice? UK law entitles
              you to compensation of up to £520 per passenger. Paybacker generates your claim letter
              in 30 seconds.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free flight compensation letter
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
                  <strong className="text-white">UK261 (Retained EU Regulation 261/2004):</strong>{' '}
                  Passengers are entitled to compensation of £220 to £520 for flights delayed by 3
                  or more hours, cancelled with less than 14 days notice, or denied boarding due to
                  overbooking.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Scope of UK261:</strong> The regulation applies to
                  all flights departing from a UK airport (any airline) and flights arriving in the
                  UK operated by a UK or EU carrier. This includes scheduled, charter, and package
                  holiday flights.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Civil Aviation Authority (CAA):</strong> The CAA
                  enforces UK261. If an airline does not resolve your complaint, you can escalate to
                  the CAA or an approved Alternative Dispute Resolution scheme.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <Scale className="h-5 w-5 text-mint-400 mt-1 shrink-0" />
                <p className="text-slate-300">
                  <strong className="text-white">Limitation Act 1980:</strong> You have up to 6
                  years from the date of the flight to make a compensation claim in England, Wales,
                  and Northern Ireland (5 years in Scotland).
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
                'Generates a professional compensation claim letter citing UK261 with the correct compensation amount based on flight distance',
                'Includes the airline contact details and the CAA escalation path',
                'References your legal right to claim for flights up to 6 years old',
                'Covers delays, cancellations, denied boarding, and downgraded seating',
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
              How to Claim Flight Delay Compensation: Step by Step
            </h2>
            <ol className="space-y-6">
              {[
                {
                  title: '1. Check your eligibility',
                  desc: 'Your flight must have departed from a UK airport, or arrived in the UK on a UK/EU carrier. The delay at your final destination must be 3 hours or more, or your flight was cancelled with less than 14 days notice.',
                },
                {
                  title: '2. Gather your flight details',
                  desc: 'You will need your booking reference, flight number, date of travel, departure and arrival airports, and the length of the delay. Keep boarding passes, emails, and any receipts for expenses.',
                },
                {
                  title: '3. Submit your claim to the airline',
                  desc: 'Send a formal compensation letter to the airline. Paybacker generates this for you, citing UK261 and the exact compensation amount you are owed based on the flight distance.',
                },
                {
                  title: '4. Wait for the airline to respond',
                  desc: 'Airlines typically respond within 6 to 8 weeks. If they reject your claim citing extraordinary circumstances, check whether the reason genuinely qualifies. Technical faults and crew shortages generally do not.',
                },
                {
                  title: '5. Escalate if needed',
                  desc: 'If the airline refuses to pay or does not respond within 8 weeks, escalate to the CAA or the airline\'s approved ADR scheme. You can also take the claim to the small claims court for a low fee.',
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
              Get the Compensation You Are Owed
            </h2>
            <p className="text-slate-300 mb-8 max-w-xl mx-auto">
              Paybacker generates a professional claim letter citing UK261 in 30 seconds. Claims go
              back up to 6 years. Free to get started.
            </p>
            <Link
              href="/auth/signup"
              className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 text-base"
            >
              Generate your free flight compensation letter
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
