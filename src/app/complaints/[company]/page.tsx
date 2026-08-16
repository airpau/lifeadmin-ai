import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { COMPANIES, getCompanyBySlug, companiesInSameCategory } from '@/data/companies';
import { getSectorGuidance } from '@/data/complaint-sectors';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import type { Metadata } from 'next';
import '../../(marketing)/styles.css';

interface Props {
  params: Promise<{ company: string }>;
}

const BASE = 'https://paybacker.co.uk';

export async function generateStaticParams() {
  return COMPANIES.map((c) => ({ company: c.slug }));
}

/** Meta descriptions get truncated in the SERP past roughly 160 characters. */
function clampDescription(text: string, max = 158): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max).replace(/[,.;:]$/, '')}…`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company: slug } = await params;
  const company = getCompanyBySlug(slug);

  if (!company) {
    return { title: 'Company not found', robots: { index: false, follow: false } };
  }

  const sector = getSectorGuidance(company);
  const url = `${BASE}/complaints/${company.slug}`;
  // `absolute` bypasses the root layout's "%s | Paybacker" template.
  // With the template applied this title ran to ~80 characters, which
  // Google truncates. The descriptive detail lives in the meta
  // description and the H1 instead.
  const title = `How to complain to ${company.name} | Paybacker`;
  const description = clampDescription(
    `Complaining to ${company.name}? The rights that apply, the deadlines that decide your claim, and how to escalate to ${sector.escalation.name}.`,
  );

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    keywords: [
      `complain to ${company.name}`,
      `${company.name} complaints`,
      `${company.name} complaint letter`,
      `${company.name} refund`,
      `${company.regulator} complaint`,
      'UK consumer rights',
    ],
    openGraph: {
      title,
      description,
      url,
      siteName: 'Paybacker',
      type: 'article',
      locale: 'en_GB',
    },
    twitter: {
      card: 'summary',
      title: `How to complain to ${company.name}`,
      description,
    },
  };
}

export default async function CompanyPage({ params }: Props) {
  const { company: slug } = await params;
  const company = getCompanyBySlug(slug);

  if (!company) {
    notFound();
  }

  const sector = getSectorGuidance(company);
  const url = `${BASE}/complaints/${company.slug}`;
  const related = companiesInSameCategory(company.slug).slice(0, 6);

  // BreadcrumbList mirrors the visible breadcrumb. FAQPage is genuine:
  // every question below is answered in full in the visible copy. We do
  // not emit Review or AggregateRating anywhere, because we hold no
  // review data about these companies and inventing it would be both
  // dishonest and a structured-data violation.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Paybacker', item: BASE },
          { '@type': 'ListItem', position: 2, name: 'Company complaints', item: `${BASE}/complaints` },
          { '@type': 'ListItem', position: 3, name: `Complain to ${company.name}`, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: sector.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <div className="m-land-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarkNav />
      <main>
        <div className="wrap">
          <section className="land-hero" style={{ paddingBottom: 24 }}>
            <nav
              aria-label="Breadcrumb"
              style={{ fontSize: 13, marginBottom: 14, color: 'var(--text-secondary)' }}
            >
              <Link href="/" style={{ color: 'inherit' }}>Home</Link>
              <span aria-hidden="true"> / </span>
              <Link href="/complaints" style={{ color: 'inherit' }}>Company complaints</Link>
              <span aria-hidden="true"> / </span>
              <span>{company.name}</span>
            </nav>
            <span className="badge">Regulated by {company.regulator}</span>
            <h1>How to complain to {company.name}</h1>
            <p className="subtitle">{sector.intro}</p>
          </section>

          {/* Rights ------------------------------------------------------ */}
          <section className="prose-section" style={{ paddingTop: 24 }}>
            <div className="rights-card">
              <h2>The rights that apply when you complain to {company.name}</h2>
              <p className="prose-body" style={{ marginTop: 0 }}>
                {company.name} is a UK {sector.label}, so the rules below are the ones
                that decide your complaint. Each is named, because a letter that cites
                the specific rule is handled by a different team to one that does not.
              </p>
              <ul className="rights-list" style={{ marginTop: 18 }}>
                {sector.rights.map((r) => (
                  <li key={r.basis + r.text.slice(0, 24)}>
                    {r.text}{' '}
                    <span style={{ display: 'block', marginTop: 4, fontSize: 13.5, color: 'var(--text-secondary)' }}>
                      {r.basis}
                    </span>
                  </li>
                ))}
              </ul>
              {company.phone && (
                <p className="prose-body" style={{ marginBottom: 0 }}>
                  <strong>{company.name} complaints line:</strong>{' '}
                  <span style={{ color: 'var(--accent-mint-deep)', fontWeight: 600 }}>
                    {company.phone}
                  </span>{' '}
                  <span style={{ color: 'var(--text-secondary)' }}>
                    — put the complaint in writing as well. A phone call leaves no record
                    you can rely on later.
                  </span>
                </p>
              )}
            </div>
          </section>

          {/* Deadlines --------------------------------------------------- */}
          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>The deadlines that decide your claim</h2>
            <div className="step-grid" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 920 }}>
              {sector.deadlines.map((d) => (
                <div key={d.title} className="step" style={{ textAlign: 'left' }}>
                  <h3>{d.title}</h3>
                  <p>{d.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* What to put in the letter ----------------------------------- */}
          <section className="prose-section">
            <div className="rights-card">
              <h2>What to put in the letter to {company.name}</h2>
              <p className="prose-body" style={{ marginTop: 0 }}>
                Complaints teams work from a script. The detail below is what moves a
                case off that script and onto the desk of someone who can authorise a
                remedy.
              </p>
              <ul className="rights-list" style={{ marginTop: 18 }}>
                {sector.letterPoints.map((p) => (
                  <li key={p.slice(0, 32)}>{p}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* Escalation -------------------------------------------------- */}
          <section className="prose-section">
            <div className="rights-card">
              <h2>If {company.name} says no, or says nothing</h2>
              <div className="prose-body" style={{ margin: 0 }}>
                <p>
                  Escalate to{' '}
                  <a
                    href={sector.escalation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent-mint-deep)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    {sector.escalation.name}
                  </a>
                  .
                </p>
                <p><strong>When you can go:</strong> {sector.escalation.eligibility}</p>
                <p><strong>How long you have:</strong> {sector.escalation.timeLimit}</p>
                <p><strong>What it costs:</strong> {sector.escalation.cost}</p>
                <p><strong>Whether it binds {company.name}:</strong> {sector.escalation.binding}</p>
              </div>
            </div>
          </section>

          {/* Honesty note ------------------------------------------------ */}
          {sector.caveat && (
            <section className="prose-section">
              <div className="soft-cta" style={{ display: 'block' }}>
                <p style={{ fontWeight: 600, marginBottom: 6 }}>Worth knowing before you start</p>
                <p>{sector.caveat}</p>
              </div>
            </section>
          )}

          {/* FAQs -------------------------------------------------------- */}
          <section className="prose-section">
            <h2 style={{ textAlign: 'center' }}>Common questions</h2>
            <div className="faq-grid" style={{ marginTop: 20 }}>
              {sector.faqs.map((f) => (
                <div key={f.q} className="faq-card">
                  <h3>{f.q}</h3>
                  <p>{f.a}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Sources ----------------------------------------------------- */}
          <section className="prose-section">
            <div className="rights-card">
              <h2>Where this comes from</h2>
              <p className="prose-body" style={{ marginTop: 0 }}>
                Every rule on this page is drawn from primary legislation, a regulator, or
                an approved dispute resolution scheme. Check them yourself.
              </p>
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
                {sector.sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-mint-deep)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="prose-body" style={{ marginBottom: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>
                Paybacker is not a law firm and this is not legal advice. It is a summary
                of the published rules that apply to a {sector.label}, so that you can put
                your own case properly. For a dispute of real value, or anything turning on
                facts unique to you, speak to a solicitor or Citizens Advice.
              </p>
            </div>
          </section>

          {/* Related companies ------------------------------------------- */}
          {related.length > 0 && (
            <section className="prose-section">
              <h2 style={{ textAlign: 'center' }}>Complaining about other {sector.pluralLabel}</h2>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  justifyContent: 'center',
                  maxWidth: 820,
                  margin: '20px auto 0',
                }}
              >
                {related.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/complaints/${c.slug}`}
                    style={{
                      border: '1px solid var(--divider)',
                      borderRadius: 999,
                      padding: '8px 16px',
                      fontSize: 14,
                      textDecoration: 'none',
                      color: 'var(--text-primary)',
                      background: '#fff',
                    }}
                  >
                    Complain to {c.name}
                  </Link>
                ))}
              </div>
              <p style={{ textAlign: 'center', marginTop: 18 }}>
                <Link href="/complaints" style={{ color: 'var(--accent-mint-deep)', fontWeight: 600, textDecoration: 'none' }}>
                  See all {COMPANIES.length} companies →
                </Link>
              </p>
            </section>
          )}

          {/* CTA --------------------------------------------------------- */}
          <section className="prose-section">
            <div className="final-cta">
              <h2>Check your {company.name} case against the actual law, free</h2>
              <p>
                Describe what happened and Paybacker tells you how strong the case looks,
                which rules apply with a link to every official source, and drafts the
                letter. No account, no email address needed.
              </p>
              <Link href="/check" className="btn btn-mint btn-lg">
                Check my case free <ArrowRight width={16} height={16} aria-hidden="true" />
              </Link>
              <p style={{ marginTop: 18, fontSize: 13, color: 'var(--text-on-ink-dim)' }}>
                Free to read and copy. No credit card.
              </p>
            </div>
          </section>
        </div>
      </main>
      <MarkFoot />
    </div>
  );
}
