import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { MarkNav, MarkFoot, SIGNUP_HREF } from '../blog/_shared';
import '../blog/styles.css';

/**
 * /templates — UK consumer letter-template index.
 *
 * The blog footer + careers footer link to /templates as "Letter
 * templates". Until this page existed those links 404'd. The page
 * doubles as a top-of-funnel SEO surface for "[X] letter template UK"
 * long-tail queries (e.g. "section 75 letter template UK", "council
 * tax challenge letter template").
 *
 * Each template tile points to a tool route that pre-fills the
 * dispute generator with the right type. Clicking a tile and then
 * generating a letter requires signup, so /templates funnels into
 * /auth/signup the same way the (marketing) landers do.
 *
 * Structurally a sibling of /blog and /how-it-works — uses the same
 * MarkNav + MarkFoot chrome and the same .m-blog-root design tokens.
 */

export const metadata: Metadata = {
  title: 'UK consumer letter templates — free, citing real law | Paybacker',
  description:
    'Free letter templates for every UK consumer dispute — energy bills, flight delays, council tax, parking, debt, gym memberships, refunds and more. Each one cites the exact UK law.',
  alternates: { canonical: 'https://paybacker.co.uk/templates' },
  openGraph: {
    title: 'UK consumer letter templates — citing exact UK law',
    description:
      'Free letter templates for every UK consumer dispute. AI generates the final letter in 30 seconds, citing the exact statute, regulator, and deadline that applies to your case.',
    url: 'https://paybacker.co.uk/templates',
    siteName: 'Paybacker',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'UK consumer letter templates — citing exact UK law',
    description:
      'Free letter templates for every UK consumer dispute. AI generates the final letter in 30 seconds.',
  },
};

type TemplateTile = {
  title: string;
  description: string;
  href: string;
  category: string;
  citesLaw: string;
};

const TEMPLATES: ReadonlyArray<TemplateTile> = [
  {
    title: 'Energy bill dispute letter',
    description:
      'Challenge an overcharging energy bill, estimated readings, wrong tariff or back-billing under Ofgem rules.',
    href: '/dispute-energy-bill',
    category: 'Utilities',
    citesLaw: 'Gas Act 1986, Electricity Act 1989, Ofgem Standards of Conduct',
  },
  {
    title: 'Flight delay compensation letter',
    description:
      'Claim up to £520 per passenger for delayed or cancelled UK / EU flights under UK261.',
    href: '/flight-delay-compensation',
    category: 'Travel',
    citesLaw: 'Regulation (EC) 261/2004 retained as UK law',
  },
  {
    title: 'Council tax band challenge letter',
    description:
      'Challenge an incorrect council tax band with the Valuation Office Agency (VOA).',
    href: '/council-tax-challenge',
    category: 'Council tax',
    citesLaw: 'Local Government Finance Act 1992, VOA challenge process',
  },
  {
    title: 'Gym cancellation letter',
    description:
      'Cancel a gym contract — 14-day cooling-off, change of circumstance, or breach of contract.',
    href: '/cancel-gym-membership',
    category: 'Subscriptions',
    citesLaw: 'Consumer Contracts Regulations 2013, Consumer Rights Act 2015',
  },
  {
    title: 'Debt collection response letter',
    description:
      'Respond to a debt collection letter — request proof, dispute liability, invoke statute-of-limitations.',
    href: '/debt-collection-response',
    category: 'Debt',
    citesLaw: 'Consumer Credit Act 1974, Limitation Act 1980, FCA CONC rules',
  },
  {
    title: 'Broadband overcharging complaint',
    description:
      'Out-of-contract overcharges, mid-contract price rises, advertised speed not delivered.',
    href: '/broadband-overcharging',
    category: 'Utilities',
    citesLaw: 'Ofcom General Conditions, Consumer Rights Act 2015',
  },
  {
    title: 'Mobile contract dispute letter',
    description:
      'Exit fees, mid-contract price rises above the rate permitted, signal not as advertised.',
    href: '/mobile-contract-dispute',
    category: 'Mobile',
    citesLaw: 'Ofcom General Conditions, Consumer Rights Act 2015',
  },
  {
    title: 'Insurance complaint letter',
    description:
      'Underpaid claim, unfair rejection, renewal price hike, mis-sold policy.',
    href: '/insurance-complaint',
    category: 'Insurance',
    citesLaw: 'FCA ICOBS, Insurance Act 2015, Consumer Insurance (Disclosure and Representations) Act 2012',
  },
  {
    title: 'Parking charge appeal letter',
    description:
      'Appeal a private parking charge or council PCN — POPLA, IAS, traffic adjudicator routes.',
    href: '/parking-appeal',
    category: 'Parking',
    citesLaw: 'British Parking Association code, Schedule 4 of the Protection of Freedoms Act 2012',
  },
  {
    title: 'Hidden subscription cancellation',
    description:
      'Cancel a forgotten subscription identified from your bank statements — under cooling-off or for breach.',
    href: '/hidden-subscriptions',
    category: 'Subscriptions',
    citesLaw: 'Consumer Contracts Regulations 2013, Consumer Rights Act 2015',
  },
  {
    title: 'Bank charge reclaim letter',
    description:
      'Challenge unfair overdraft, unarranged-overdraft and packaged-account charges via the FOS route.',
    href: '/unfair-bank-charges',
    category: 'Banking',
    citesLaw: 'FCA BCOBS, Consumer Credit Act 1974',
  },
];

const CATEGORIES = Array.from(new Set(TEMPLATES.map((t) => t.category)));

export default function TemplatesPage() {
  return (
    <div className="m-blog-root">
      <MarkNav />

      {/* Hero */}
      <section className="section-light" style={{ paddingTop: 140, paddingBottom: 32 } as CSSProperties}>
        <div className="wrap">
          <span className="eyebrow">Letter templates</span>
          <h1
            style={{
              fontSize: 'var(--fs-h1)',
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              lineHeight: 1.05,
              margin: '18px 0 16px',
              maxWidth: 900,
            } as CSSProperties}
          >
            Every UK consumer letter you might ever need. Citing the actual law.
          </h1>
          <p
            style={{
              fontSize: 18,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              maxWidth: 720,
              margin: '0 0 16px',
            } as CSSProperties}
          >
            We&rsquo;ve mapped every common UK consumer dispute to the statute, regulator, and route that wins. Pick the one you need below — Paybacker generates the final letter in 30 seconds.
          </p>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-tertiary)',
              maxWidth: 720,
              margin: '0 0 32px',
            } as CSSProperties}
          >
            Categories: {CATEGORIES.join(' · ')}
          </p>
        </div>
      </section>

      {/* Tiles */}
      <section style={{ padding: '24px 0 80px' } as CSSProperties}>
        <div className="wrap">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 24,
            } as CSSProperties}
          >
            {TEMPLATES.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  background: '#fff',
                  border: '1px solid var(--divider)',
                  borderRadius: 'var(--r-card)',
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                } as CSSProperties}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 'var(--track-eyebrow)',
                    textTransform: 'uppercase',
                    color: 'var(--accent-mint-deep)',
                  } as CSSProperties}
                >
                  {t.category}
                </div>
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    letterSpacing: '-.015em',
                    margin: 0,
                    lineHeight: 1.25,
                  } as CSSProperties}
                >
                  {t.title}
                </h3>
                <p
                  style={{
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    color: 'var(--text-secondary)',
                    margin: 0,
                  } as CSSProperties}
                >
                  {t.description}
                </p>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-tertiary)',
                    margin: 0,
                    marginTop: 'auto',
                  } as CSSProperties}
                >
                  Cites: {t.citesLaw}
                </p>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--accent-mint-deep)',
                  } as CSSProperties}
                >
                  Open guide →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '40px 0 120px' } as CSSProperties}>
        <div className="wrap">
          <div
            style={{
              background: 'var(--surface-soft-mint)',
              border: '1px solid var(--divider)',
              borderRadius: 'var(--r-card)',
              padding: '48px 32px',
              textAlign: 'center',
            } as CSSProperties}
          >
            <h2
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: '-.02em',
                margin: '0 0 12px',
              } as CSSProperties}
            >
              Don&rsquo;t see your template? Describe the problem.
            </h2>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                color: 'var(--text-secondary)',
                maxWidth: 640,
                margin: '0 auto 24px',
              } as CSSProperties}
            >
              The complaint generator handles any UK consumer issue, even ones we haven&rsquo;t built a template for yet. Plain English in, formal letter citing real law out.
            </p>
            <Link
              href={SIGNUP_HREF}
              className="btn btn-mint"
              style={{ padding: '14px 24px', fontSize: 14 } as CSSProperties}
            >
              Generate any UK letter free →
            </Link>
          </div>
        </div>
      </section>

      <MarkFoot />
    </div>
  );
}
