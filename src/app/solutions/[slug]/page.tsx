import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import { PAGES } from '../_data/solutions';
import '../../(marketing)/styles.css';

export function generateStaticParams() {
  return Object.keys(PAGES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) return { title: 'Paybacker' };

  const url = `https://paybacker.co.uk/solutions/${slug}`;
  return {
    title: page.title,
    description: page.description,
    keywords: page.keywords,
    openGraph: {
      title: page.title,
      description: page.description,
      url,
      siteName: 'Paybacker',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: page.title,
      description: page.description,
      images: ['/logo.png'],
    },
    alternates: {
      canonical: url,
    },
  };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = PAGES[slug];
  if (!page) notFound();

  const Icon = page.icon;

  return (
    <div className="m-land-root">
      <MarkNav />
      <main>
        <div className="wrap">
          <section className="land-hero">
            <span className="badge">
              <Icon width={14} height={14} aria-hidden="true" />
              Free to use — no credit card required
            </span>
            <h1>{page.h1}</h1>
            <p className="subtitle">{page.subtitle}</p>
            <div className="hero-stat">
              <span className="stat-value">{page.heroStat}</span>
              <span className="stat-label">{page.heroStatLabel}</span>
            </div>
            <div>
              <Link href={page.ctaLink} className="btn btn-mint btn-lg">
                {page.ctaText} <ArrowRight width={16} height={16} aria-hidden="true" />
              </Link>
            </div>
            <p className="social-proof">{page.socialProof}</p>
          </section>

          <section className="prose-section">
            <div className="rights-card">
              <h2>What you get</h2>
              <ul className="rights-list">
                {page.benefits.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>How it works</h2>
            <div className="step-grid">
              {page.howItWorks.map((step) => (
                <div key={step.step} className="step">
                  <div className="step-badge">{step.step}</div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="prose-section">
            <div className="soft-cta">
              <p>{page.featureHighlight}</p>
              <Link href={page.ctaLink}>
                Get started free <ArrowRight width={14} height={14} aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>Frequently asked questions</h2>
            <div className="faq-grid">
              {page.faqs.map((faq) => (
                <article key={faq.q} className="faq-card">
                  <h3>{faq.q}</h3>
                  <p>{faq.a}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="prose-section">
            <div className="final-cta">
              <h2>Ready to take control?</h2>
              <p>Join thousands of UK consumers who are using Paybacker to save money and fight unfair charges.</p>
              <Link href={page.ctaLink} className="btn btn-mint btn-lg">
                {page.ctaText} <ArrowRight width={16} height={16} aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>
      </main>
      <MarkFoot />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: page.faqs.map((faq) => ({
              '@type': 'Question',
              name: faq.q,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.a,
              },
            })),
          }),
        }}
      />
    </div>
  );
}
