import Link from 'next/link';
import { CheckCircle, ArrowRight } from 'lucide-react';

export interface LandingPageData {
  h1: string;
  subtitle: string;
  badge: string;
  heroStat: string;
  heroStatLabel: string;
  heroStatColor: string;
  ctaPrimary: string;
  socialProof: string;
  legislationTitle: string;
  legislationParagraphs: string[];
  rightsTitle: string;
  rights: string[];
  howItWorks: Array<{ step: string; title: string; description: string }>;
  faqs: Array<{ q: string; a: string }>;
  finalCtaTitle: string;
  finalCtaSubtitle: string;
}

export default function LandingPage({ data }: { data: LandingPageData }) {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };

  return (
    <main className="container mx-auto px-4 md:px-6 py-12">
      {/* Hero */}
      <div className="max-w-4xl mx-auto mb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-mint-400/10 px-4 py-2 text-sm text-mint-400 border border-mint-400/20 mb-8">
          <span>{data.badge}</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 leading-tight font-[family-name:var(--font-heading)]">
          {data.h1}
        </h1>
        <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto leading-relaxed">
          {data.subtitle}
        </p>
        <div className="flex justify-center mb-8">
          <div className="bg-navy-900 border border-mint-400/20 rounded-2xl px-8 py-4 text-center">
            <p className={`text-4xl font-bold ${data.heroStatColor}`}>{data.heroStat}</p>
            <p className="text-slate-500 text-sm mt-1">{data.heroStatLabel}</p>
          </div>
        </div>
        <Link
          href="/auth/signup"
          className="inline-block bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all text-lg"
        >
          {data.ctaPrimary}
        </Link>
        <p className="text-slate-500 text-sm mt-4">{data.socialProof}</p>
      </div>

      {/* Legislation */}
      <div className="max-w-3xl mx-auto mb-16">
        <h2 className="text-2xl font-bold text-white mb-6 font-[family-name:var(--font-heading)]">
          {data.legislationTitle}
        </h2>
        <div className="space-y-4">
          {data.legislationParagraphs.map((para, i) => (
            <p key={i} className="text-slate-300 leading-relaxed">{para}</p>
          ))}
        </div>
      </div>

      {/* Your Rights */}
      <div className="max-w-3xl mx-auto mb-16">
        <div className="bg-navy-900 border border-mint-400/20 rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6 font-[family-name:var(--font-heading)]">
            {data.rightsTitle}
          </h2>
          <ul className="space-y-3">
            {data.rights.map((right, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-mint-400 flex-shrink-0 mt-0.5" />
                <span className="text-slate-300">{right}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-4xl mx-auto mb-16">
        <h2 className="text-2xl font-bold text-white mb-8 text-center font-[family-name:var(--font-heading)]">
          How Paybacker helps
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {data.howItWorks.map((step) => (
            <div key={step.step} className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 text-center">
              <div className="bg-mint-400 text-navy-950 w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg">
                {step.step}
              </div>
              <h3 className="text-white font-semibold mb-2">{step.title}</h3>
              <p className="text-slate-400 text-sm">{step.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* FAQs */}
      <div className="max-w-3xl mx-auto mb-16">
        <h2 className="text-2xl font-bold text-white mb-6 text-center font-[family-name:var(--font-heading)]">
          Frequently asked questions
        </h2>
        <div className="space-y-4">
          {data.faqs.map((faq, i) => (
            <div key={i} className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-2">{faq.q}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Secondary CTA */}
      <div className="max-w-3xl mx-auto mb-16">
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-300 text-sm">Or scan your bank account to find more savings</p>
          <Link
            href="/auth/signup"
            className="inline-flex items-center gap-2 text-mint-400 font-semibold hover:text-mint-300 transition-all text-sm whitespace-nowrap"
          >
            Scan my bank free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Final CTA */}
      <div className="max-w-3xl mx-auto mb-16 text-center">
        <h2 className="text-3xl font-bold text-white mb-4 font-[family-name:var(--font-heading)]">
          {data.finalCtaTitle}
        </h2>
        <p className="text-slate-400 mb-8">{data.finalCtaSubtitle}</p>
        <Link
          href="/auth/signup"
          className="inline-block bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all text-lg"
        >
          {data.ctaPrimary}
        </Link>
      </div>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </main>
  );
}
