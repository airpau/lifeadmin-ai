import type { Metadata } from 'next';
import Link from 'next/link';
import { SIGNUP_HREF } from '@/app/blog/_shared';
import { TOOLS, TOOLS_BASE } from './_data/tools';

/**
 * Free tools hub.
 *
 * Note for whoever maintains this next: two URLs currently seeded in the
 * `legal_references` table were found returning HTTP 404 when the
 * sources for these pages were verified on 2026-08-16:
 *
 *   ofcom.org.uk/phones-and-broadband/making-changes/mid-contract-price-rises
 *   ofgem.gov.uk/check-if-energy-price-is-fair/understand-your-energy-bill/back-billing
 *
 * The tools use live replacements (see _data/sources.ts). The stored
 * rows should be put through the normal `legal_ref_corrections` flow
 * rather than edited directly.
 */

export const metadata: Metadata = {
  title: 'Free UK Consumer Rights Tools — No Signup Required | Paybacker',
  description:
    'Free calculators and checkers for UK consumer rights: flight delay compensation, section 75 claims, parking appeals, energy overcharges, broadband price rises and council tax bands. No account, no email, nothing stored.',
  keywords: [
    'free consumer rights tools UK',
    'flight delay compensation calculator',
    'section 75 checker',
    'parking appeal checker',
    'energy overcharge checker',
    'council tax band checker',
  ],
  openGraph: {
    title: 'Free UK Consumer Rights Tools — No Signup Required',
    description:
      'Six free checkers covering flights, credit card claims, parking, energy, broadband and council tax. Every one cites the actual statute or regulator. No account needed.',
    url: TOOLS_BASE,
    type: 'website',
    siteName: 'Paybacker',
  },
  alternates: { canonical: TOOLS_BASE },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://paybacker.co.uk' },
        { '@type': 'ListItem', position: 2, name: 'Free tools', item: TOOLS_BASE },
      ],
    },
    {
      '@type': 'ItemList',
      name: 'Free UK consumer rights tools',
      itemListElement: TOOLS.map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: t.name,
        description: t.oneLiner,
        url: `${TOOLS_BASE}/${t.slug}`,
      })),
    },
  ],
};

export default function ToolsHubPage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="section-light">
        <div className="wrap">
          <div className="tool-hero">
            <div className="tool-breadcrumb">
              <Link href="/">Home</Link>
              <span>/</span>
              <span>Free tools</span>
            </div>
            <div className="tool-free-badge">Free · no account · nothing stored</div>
            <h1>Free UK consumer rights tools</h1>
            <p className="tool-intro">
              Six checkers that give you a straight answer about where you
              stand, with the statute or regulator cited and linked. Every one
              runs in your browser. No sign-up, no email capture, no
              bait-and-switch at the end.
            </p>
          </div>
        </div>
      </section>

      <section className="section-light tool-section" style={{ paddingTop: 28 }}>
        <div className="wrap">
          <div className="tool-grid">
            {TOOLS.map((t) => (
              <Link key={t.slug} className="tool-tile" href={`/tools/${t.slug}`}>
                <div className="tool-tile-meta">
                  <span className="tool-chip">{t.category}</span>
                  <span className="tool-chip is-neutral">{t.basis}</span>
                </div>
                <h3>{t.name}</h3>
                <p>{t.oneLiner}</p>
                <div className="tool-tile-go">Open the tool →</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-light tool-section">
        <div className="wrap">
          <div className="tool-narrow">
            <h2>How these tools are built</h2>
            <p>
              Every answer is worked out from rules we can point to. Each tool
              lists the legislation, government guidance or regulator page it
              relies on, with a link to the official source, and those sources
              are restricted to primary legislation, GOV.UK, statutory
              regulators such as Ofcom, Ofgem, the Civil Aviation Authority and
              the Valuation Office, and statutory ombudsmen. We do not cite
              comparison sites, trade bodies, news articles or law-firm blogs.
              A citation is only as good as its source.
            </p>
            <p>
              The calculations are deliberately conservative. Where a rule has
              conditions or exceptions, the tool says so rather than rounding
              up in your favour. Where the honest answer is that you have no
              claim, it says that too. Telling someone they are owed £520 when
              the correct figure is £260, or that they can leave a contract
              when they cannot, does not help them, it just means they get
              knocked back by a company that knows the rules better than they
              do.
            </p>
            <p>
              None of these tools will quote you a success rate or promise an
              outcome. Outcomes turn on evidence and facts that a web form
              cannot see, and anyone claiming otherwise is guessing.
            </p>
          </div>
        </div>
      </section>

      <section className="section-light tool-section">
        <div className="wrap">
          <div className="tool-narrow">
            <h2>Why they are free</h2>
            <p>
              Knowing where you stand is the easy half. The hard half is
              writing a letter that cites the right provision, sending it to
              the right place, keeping a record of what you sent and when,
              running the eight-week clock, and knowing the moment the
              ombudsman route opens. That is what Paybacker does, and that is
              what we charge for.
            </p>
            <p>
              These tools stay free and open whether or not you ever sign up.
              There is no gate at the end, no email required to see your
              result, and nothing you enter is sent to us or stored anywhere.
            </p>
          </div>
          <div className="soft-cta" style={{ marginTop: 28 }}>
            <p>
              Want the letter drafted and the response tracked? The free plan
              includes three letters a month and does not need a card.
            </p>
            <Link href={SIGNUP_HREF}>Start free →</Link>
          </div>
        </div>
      </section>

      <section className="section-light tool-section" style={{ paddingTop: 0, paddingBottom: 72 }}>
        <div className="wrap">
          <p className="tool-disclaimer">
            Paybacker is not a law firm and these tools do not give legal
            advice. They provide general guidance about UK consumer law applied
            to the answers you give. Rules change and the outcome of any
            dispute depends on facts and evidence we cannot see from a form.
            For complex or high-value disputes, court proceedings, or anything
            you are unsure about, consult a qualified solicitor or Citizens
            Advice.
          </p>
        </div>
      </section>
    </main>
  );
}
