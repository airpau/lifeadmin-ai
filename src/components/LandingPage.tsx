import Link from 'next/link';

export interface LandingPageData {
  h1: string;
  subtitle: string;
  badge: string;
  heroStat: string;
  heroStatLabel: string;
  /** Retained for backwards compatibility with existing landing-page data objects.
   *  The new light theme drives stat colour from tokens, not per-page overrides. */
  heroStatColor?: string;
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

/**
 * Marketing SEO landing page shell.
 *
 * Renders inside `(marketing)/layout.tsx`, which wraps everything in
 * `.m-land-root` and includes MarkNav + MarkFoot. Styles live in
 * `(marketing)/styles.css`.
 */
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
    <main>
      {/* Hero */}
      <section className="section-light">
        <div className="wrap">
          <div className="land-hero">
            <div className="badge">{data.badge}</div>
            <h1>{data.h1}</h1>
            <p className="subtitle">{data.subtitle}</p>
            <div className="hero-stat">
              <span className="stat-value">{data.heroStat}</span>
              <span className="stat-label">{data.heroStatLabel}</span>
            </div>
            <div>
              <Link href="/auth/signup" className="btn btn-mint btn-lg">
                {data.ctaPrimary}
              </Link>
            </div>
            <p className="social-proof">{data.socialProof}</p>
          </div>
        </div>
      </section>

      {/* Legislation prose */}
      <section className="section-light prose-section">
        <div className="wrap">
          <div className="prose-body">
            <h2>{data.legislationTitle}</h2>
            {data.legislationParagraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>
      </section>

      {/* Rights checklist */}
      <section className="section-light prose-section">
        <div className="wrap">
          <div className="rights-card">
            <h2>{data.rightsTitle}</h2>
            <ul className="rights-list">
              {data.rights.map((right, i) => (
                <li key={i}>{right}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section-light prose-section">
        <div className="wrap">
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2
              style={{
                fontSize: 'var(--fs-h2)',
                fontWeight: 700,
                letterSpacing: 'var(--track-tight)',
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              How Paybacker helps
            </h2>
          </div>
          <div className="step-grid">
            {data.howItWorks.map((step) => (
              <div key={step.step} className="step">
                <div className="step-badge">{step.step}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="section-light prose-section">
        <div className="wrap">
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <h2
              style={{
                fontSize: 'var(--fs-h2)',
                fontWeight: 700,
                letterSpacing: 'var(--track-tight)',
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              Frequently asked questions
            </h2>
          </div>
          <div className="faq-grid">
            {data.faqs.map((faq, i) => (
              <div key={i} className="faq-card">
                <h3>{faq.q}</h3>
                <p>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Soft CTA strip — scan bank */}
      <section className="section-light prose-section" style={{ paddingTop: 8, paddingBottom: 56 }}>
        <div className="wrap">
          <div className="soft-cta">
            <p>Or scan your bank account to find more savings.</p>
            <Link href="/auth/signup">Scan my bank free →</Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-light" style={{ paddingBottom: 96 }}>
        <div className="wrap">
          <div className="final-cta">
            <h2>{data.finalCtaTitle}</h2>
            <p>{data.finalCtaSubtitle}</p>
            <Link href="/auth/signup" className="btn btn-mint btn-lg">
              {data.ctaPrimary}
            </Link>
          </div>
        </div>
      </section>

      {/* JSON-LD FAQPage schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </main>
  );
}
