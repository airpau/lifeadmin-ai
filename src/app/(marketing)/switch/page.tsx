import type { Metadata } from 'next';
import Link from 'next/link';
import { SIGNUP_HREF } from '@/app/blog/_shared';
import { SWITCHES, SWITCH_BASE } from './_data/switches';

/**
 * /switch hub.
 *
 * Lists the migration pages for UK money apps that have closed. The
 * tiles are derived from the registry in ./_data/switches.ts, ordered
 * most recent closure first, so adding a page there surfaces it here
 * and in the sitemap without touching this file.
 */

export const metadata: Metadata = {
  title: 'Your UK Money App Closed. Where To Go Next. | Paybacker',
  description:
    'Moneyhub’s consumer app closed on 31 July 2026. Money Dashboard closed on 31 October 2023. Honest, source-linked guides to what Paybacker replaces, what it does not, and how to reconnect your accounts through Open Banking.',
  keywords: [
    'Moneyhub alternative',
    'Money Dashboard alternative',
    'UK money app closed',
    'budgeting app shut down UK',
    'switch budgeting app UK',
  ],
  openGraph: {
    title: 'Your UK money app closed. Where to go next.',
    description:
      'Source-linked guides for people moving on from a closed UK money app, with an honest account of what carries over and what does not.',
    url: SWITCH_BASE,
    type: 'website',
    siteName: 'Paybacker',
    locale: 'en_GB',
  },
  alternates: { canonical: SWITCH_BASE },
};

const ordered = [...SWITCHES].sort((a, b) =>
  b.closedOnIso.localeCompare(a.closedOnIso),
);

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://paybacker.co.uk' },
        { '@type': 'ListItem', position: 2, name: 'Switching', item: SWITCH_BASE },
      ],
    },
    {
      '@type': 'ItemList',
      name: 'Moving on from a closed UK money app',
      itemListElement: ordered.map((s, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: s.name,
        description: s.oneLiner,
        url: `${SWITCH_BASE}/${s.slug}`,
      })),
    },
  ],
};

export default function SwitchHubPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="section-light">
        <div className="wrap">
          <div className="sw-hero">
            <div className="sw-breadcrumb">
              <Link href="/">Home</Link>
              <span>/</span>
              <span>Switching</span>
            </div>
            <h1>Your money app closed. Where to go next.</h1>
            <p className="sw-intro">
              Two of the best-known UK money apps have shut their consumer
              products in the last three years, and in both cases user accounts
              and data were deleted. If you are looking for somewhere to put
              your accounts next, these pages are written for you.
            </p>
            <p className="sw-intro">
              Each one states the closure factually with a link to the source,
              sets out what Paybacker covers and what it genuinely does not,
              and explains how to reconnect through Open Banking. We would
              rather you arrived knowing the gaps than found them a week in.
            </p>
          </div>
        </div>
      </section>

      <section className="section-light sw-section" style={{ paddingTop: 24 }}>
        <div className="wrap">
          <div className="sw-hub-grid">
            {ordered.map((s) => (
              <Link key={s.slug} className="sw-hub-tile" href={`/switch/${s.slug}`}>
                <span className="sw-status-chip">Closed {s.closedOn}</span>
                <h2>{s.name}</h2>
                <p>{s.oneLiner}</p>
                <span className="sw-hub-go">Read the honest comparison →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-light sw-section">
        <div className="wrap">
          <div className="sw-narrow">
            <h2>Why these pages are written the way they are</h2>
            <p>
              A closing app is an easy moment to oversell to. Someone has just
              lost a tool they relied on, they are irritated, and they will
              accept a comparison table at face value because they want the
              problem solved. That is exactly when a flattering table does the
              most damage, because the gaps turn up at the bank connection
              screen and the person leaves.
            </p>
            <p>
              So the comparison tables here include the rows that do not favour
              us. Paybacker is not a pure aggregator. It does not track
              pensions, investments or property. It cannot import a CSV of your
              old transactions. Money Dashboard was free and we are not, beyond
              a free tier. All of that is on the page rather than in a footnote.
            </p>
            <p>
              We also do not criticise the apps that closed. Both were built by
              people who cared about them, both were used by hundreds of
              thousands of people, and running an aggregator costs real money
              every month. Neither closure reflects badly on the product or the
              team behind it.
            </p>
          </div>
        </div>
      </section>

      <section className="section-light sw-section">
        <div className="wrap">
          <div className="sw-narrow">
            <h2>The part no tracker did</h2>
            <p>
              Every app on this page was built to show you where the money
              went. None of them was built to do anything about it. That is the
              gap Paybacker is aimed at: reading your bank and your inbox to
              find the overcharge, drafting the letter that cites the actual
              statute or regulator rule with a link to the official source, and
              keeping the case moving to the ombudsman deadline if the provider
              ignores you.
            </p>
            <p>
              You keep every penny of anything that comes back. There is no
              success fee at any tier.
            </p>
          </div>
          <div className="soft-cta" style={{ marginTop: 26 }}>
            <p>
              Not ready to connect anything? The free case checker takes a
              description of one problem and returns the law that applies, the
              escalation route and a full draft letter, with no account.
            </p>
            <Link href="/check">Check a case free →</Link>
          </div>
          <div className="soft-cta" style={{ marginTop: 14 }}>
            <p>
              The free plan gives you two bank connections, one inbox and three
              letters a month, and it does not need a card.
            </p>
            <Link href={SIGNUP_HREF}>Start free →</Link>
          </div>
        </div>
      </section>

      <section className="section-light sw-section" style={{ paddingTop: 0, paddingBottom: 76 }}>
        <div className="wrap">
          <p className="sw-disclaimer">
            Paybacker is not a law firm and nothing on these pages is legal
            advice. It is general guidance about UK consumer law. Paybacker is
            not affiliated with, endorsed by or connected to any of the
            companies named here. Facts about each closure are drawn from the
            source linked on the relevant page. If something is wrong, email{' '}
            <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a> and
            we will correct it.
          </p>
        </div>
      </section>
    </main>
  );
}
