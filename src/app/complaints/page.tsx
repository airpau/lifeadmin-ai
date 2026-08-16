import Link from 'next/link';
import type { Metadata } from 'next';
import { COMPANIES } from '@/data/companies';
import { getSectorGuidance } from '@/data/complaint-sectors';
import { MarkNav, MarkFoot } from '@/app/blog/_shared';
import '../(marketing)/styles.css';

/**
 * Hub for the per-company complaint guides.
 *
 * Without this page the 104 company pages are reachable only from the
 * sitemap, which is a weak crawl signal and a dead end for a reader who
 * lands on one of them. This is the index that gives the set a shape.
 */

const BASE = 'https://paybacker.co.uk';
// `absolute` in the metadata below bypasses the "%s | Paybacker"
// template, so the brand is written in here and the whole string stays
// inside Google's ~60-character display budget.
const TITLE = `How to complain to ${COMPANIES.length} UK companies | Paybacker`;
// Kept under ~158 characters so Google does not truncate it.
const DESCRIPTION =
  'Company-by-company UK complaint guides: the rules that apply in each sector, the deadlines that decide your claim, and the free scheme to escalate to.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: `${BASE}/complaints` },
  keywords: [
    'how to complain UK',
    'UK company complaints',
    'ombudsman UK',
    'complaint letter UK',
    'escalate a complaint UK',
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${BASE}/complaints`,
    siteName: 'Paybacker',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: {
    card: 'summary',
    title: 'How to complain to UK companies — rights, deadlines, escalation',
    description: DESCRIPTION,
  },
};

/** Group companies by sector, preserving declaration order. */
function groupBySector() {
  const groups = new Map<string, { heading: string; companies: typeof COMPANIES }>();
  for (const company of COMPANIES) {
    const guidance = getSectorGuidance(company);
    const key = guidance.pluralLabel;
    const existing = groups.get(key);
    if (existing) {
      existing.companies.push(company);
    } else {
      groups.set(key, { heading: key, companies: [company] });
    }
  }
  return Array.from(groups.values());
}

export default function ComplaintsIndexPage() {
  const groups = groupBySector();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Paybacker', item: BASE },
          { '@type': 'ListItem', position: 2, name: 'Company complaints', item: `${BASE}/complaints` },
        ],
      },
      {
        '@type': 'ItemList',
        name: 'UK company complaint guides',
        numberOfItems: COMPANIES.length,
        itemListElement: COMPANIES.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `How to complain to ${c.name}`,
          url: `${BASE}/complaints/${c.slug}`,
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
            <span className="badge">UK consumer rights</span>
            <h1>How to complain to {COMPANIES.length} UK companies</h1>
            <p className="subtitle">
              Each guide covers the rules that actually apply in that sector, the deadlines
              that decide whether a claim survives, and the free scheme you can escalate to
              when the company says no. Pick the company you are dealing with.
            </p>
          </section>

          {groups.map((group) => (
            <section className="prose-section" key={group.heading} style={{ paddingTop: 8 }}>
              <h2 style={{ textTransform: 'capitalize' }}>{group.heading}</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                {group.companies.map((c) => (
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
                    {c.name}
                  </Link>
                ))}
              </div>
            </section>
          ))}

          <section className="prose-section">
            <div className="final-cta">
              <h2>Not sure which rules apply to you?</h2>
              <p>
                Describe what happened and Paybacker tells you how strong the case looks,
                which UK laws and regulator rules apply with a link to every official
                source, and drafts the letter. Free, no account.
              </p>
              <Link href="/check" className="btn btn-mint btn-lg">
                Check my case free
              </Link>
            </div>
          </section>
        </div>
      </main>
      <MarkFoot />
    </div>
  );
}
