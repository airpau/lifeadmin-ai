import Link from 'next/link';
import { SIGNUP_HREF } from '@/app/blog/_shared';
import { SWITCH_BASE, type SwitchSummary } from '../_data/switches';

/**
 * Presentational shell for a /switch/<service> migration page.
 *
 * Deliberately data-driven, in the same spirit as
 * `src/components/LandingPage.tsx`, so the editorial judgement lives in
 * each page's data object and the markup, the JSON-LD and the
 * disclaimers stay identical across pages.
 *
 * Two rules this component enforces structurally, because they are the
 * ones easiest to lose when someone edits copy in a hurry:
 *
 *   1. The FAQPage JSON-LD is built from the same `faqs` array that is
 *      rendered on the page, so a question can never appear in structured
 *      data without being answered in the visible HTML. Google treats
 *      that mismatch as a manual-action risk and it is also just
 *      dishonest.
 *   2. The "what Paybacker does not replace" column is required by the
 *      type. There is no way to render one of these pages without
 *      stating what the reader is losing.
 */

export type SwitchFaq = { q: string; a: string[] };

export type SwitchPageData = {
  /** Registry entry for the closing service. */
  meta: SwitchSummary;
  /** Hero headline. */
  h1: string;
  /** Hero paragraphs, rendered in order. */
  intro: string[];
  /** The factual closure notice. */
  closure: {
    heading: string;
    body: string[];
    /** Explains what kind of source the link is. Keep it precise. */
    sourceIntro: string;
  };
  /** Honest account of the overlap. */
  honest: {
    heading: string;
    lead: string[];
    replaces: string[];
    doesNotReplace: string[];
    /** The blunt paragraph after the two columns. */
    footer: string[];
  };
  /** Feature-by-feature comparison. Accurate, not flattering. */
  comparison: {
    heading: string;
    lead: string;
    theirLabel: string;
    rows: ReadonlyArray<{ feature: string; them: string; us: string }>;
    note: string;
  };
  /** What Paybacker adds that the closing service did not do. */
  adds: {
    heading: string;
    lead: string;
    items: ReadonlyArray<{ title: string; body: string }>;
  };
  /** Getting set up. */
  setup: {
    heading: string;
    lead: string;
    steps: ReadonlyArray<{ title: string; body: string }>;
    note: string;
  };
  /** What this particular audience specifically needs to know. */
  needs: {
    heading: string;
    lead: string;
    items: ReadonlyArray<{ title: string; body: string }>;
  };
  faqs: ReadonlyArray<SwitchFaq>;
  cta: { title: string; body: string };
};

export default function SwitchPage({ data }: { data: SwitchPageData }) {
  const { meta } = data;
  const pageUrl = `${SWITCH_BASE}/${meta.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://paybacker.co.uk' },
          { '@type': 'ListItem', position: 2, name: 'Switching', item: SWITCH_BASE },
          { '@type': 'ListItem', position: 3, name: meta.service, item: pageUrl },
        ],
      },
      {
        // Built from the rendered `faqs` array — see the component
        // docblock. Every question here is answered in the visible HTML
        // below.
        '@type': 'FAQPage',
        mainEntity: data.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a.join(' ') },
        })),
      },
    ],
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ---------- Hero ---------- */}
      <section className="section-light">
        <div className="wrap">
          <div className="sw-hero">
            <div className="sw-breadcrumb">
              <Link href="/">Home</Link>
              <span>/</span>
              <Link href="/switch">Switching</Link>
              <span>/</span>
              <span>{meta.service}</span>
            </div>
            <span className="sw-status-chip">
              {meta.service} closed {meta.closedOn}
            </span>
            <h1>{data.h1}</h1>
            {data.intro.map((p) => (
              <p key={p} className="sw-intro">
                {p}
              </p>
            ))}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
              <Link className="btn btn-mint" href={SIGNUP_HREF}>
                Start free →
              </Link>
              <Link className="btn btn-ghost" href="/check">
                Check a case without an account →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- The closure, factually ---------- */}
      <section className="section-light sw-section" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sw-narrow">
            <h2>{data.closure.heading}</h2>
          </div>
          <div className="sw-notice">
            {data.closure.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="sw-source">
              {data.closure.sourceIntro}{' '}
              <a href={meta.sourceUrl} target="_blank" rel="noreferrer noopener">
                {meta.sourceLabel}
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Honest overlap ---------- */}
      <section className="section-light sw-section">
        <div className="wrap">
          <div className="sw-narrow">
            <h2>{data.honest.heading}</h2>
            {data.honest.lead.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
          <div className="sw-split" style={{ marginTop: 22 }}>
            <div className="sw-split-card is-yes">
              <div className="sw-split-label">What Paybacker does cover</div>
              <ul className="sw-list">
                {data.honest.replaces.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="sw-split-card is-no">
              <div className="sw-split-label">
                What Paybacker does not replace
              </div>
              <ul className="sw-list is-no">
                {data.honest.doesNotReplace.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="sw-narrow" style={{ marginTop: 22 }}>
            {data.honest.footer.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Comparison ---------- */}
      <section className="section-light sw-section">
        <div className="wrap">
          <div className="sw-narrow">
            <h2>{data.comparison.heading}</h2>
            <p>{data.comparison.lead}</p>
          </div>
          <div className="sw-table-wrap" style={{ marginTop: 20 }}>
            <table className="sw-table">
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">{data.comparison.theirLabel}</th>
                  <th scope="col" className="is-us">
                    Paybacker
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.comparison.rows.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row">{row.feature}</th>
                    <td>{row.them}</td>
                    <td className="is-us">{row.us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sw-table-note">{data.comparison.note}</p>
        </div>
      </section>

      {/* ---------- What Paybacker adds ---------- */}
      <section className="section-light sw-section">
        <div className="wrap">
          <div className="sw-narrow">
            <h2>{data.adds.heading}</h2>
            <p>{data.adds.lead}</p>
          </div>
          <div className="sw-adds" style={{ marginTop: 20 }}>
            {data.adds.items.map((item) => (
              <div key={item.title} className="sw-add">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Getting set up ---------- */}
      <section className="section-light sw-section">
        <div className="wrap">
          <div className="sw-narrow">
            <h2>{data.setup.heading}</h2>
            <p>{data.setup.lead}</p>
          </div>
          <div className="sw-steps" style={{ marginTop: 20 }}>
            {data.setup.steps.map((step, i) => (
              <div key={step.title} className="sw-step">
                <div className="sw-step-num">{i + 1}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
          <p className="sw-table-note">{data.setup.note}</p>
        </div>
      </section>

      {/* ---------- What this audience needs ---------- */}
      <section className="section-light sw-section">
        <div className="wrap">
          <div className="sw-narrow">
            <h2>{data.needs.heading}</h2>
            <p>{data.needs.lead}</p>
          </div>
          <div className="sw-adds" style={{ marginTop: 20 }}>
            {data.needs.items.map((item) => (
              <div key={item.title} className="sw-add">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="section-light sw-section">
        <div className="wrap">
          <div className="sw-faq">
            <h2>Questions {meta.service} users are asking</h2>
            {data.faqs.map((f) => (
              <div key={f.q} className="sw-faq-item">
                <h3>{f.q}</h3>
                {f.a.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- CTA + disclaimer ---------- */}
      <section className="section-light sw-section" style={{ paddingBottom: 76 }}>
        <div className="wrap">
          <div className="soft-cta">
            <p>
              <strong>{data.cta.title}</strong> {data.cta.body}
            </p>
            <Link href={SIGNUP_HREF}>Start free →</Link>
          </div>

          <p className="sw-disclaimer" style={{ marginTop: 30 }}>
            Paybacker is not a law firm and nothing on this page is legal
            advice. It is general guidance about UK consumer law. The outcome
            of any dispute depends on facts and evidence we cannot see, and we
            make no promise about what a company or an ombudsman will decide.
            For complex or high-value disputes, court proceedings, or anything
            you are unsure about, speak to a qualified solicitor or Citizens
            Advice.
          </p>
          <p className="sw-disclaimer" style={{ borderTop: 'none', paddingTop: 10 }}>
            Paybacker is not affiliated with, endorsed by or connected to{' '}
            {meta.service}. This page is written for people looking for
            somewhere to go after the closure. Every fact about {meta.service}{' '}
            here is drawn from the source linked above, and we would rather
            correct an error than leave it standing: email{' '}
            <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
