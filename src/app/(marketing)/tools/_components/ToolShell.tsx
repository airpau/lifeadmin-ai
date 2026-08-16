import Link from 'next/link';
import type { ReactNode } from 'react';
import { SIGNUP_HREF } from '@/app/blog/_shared';
import { TOOLS_BASE, otherTools } from '../_data/tools';
import type { FilingRoute, LegalSource } from '../_data/sources';

export type ToolExplainer = {
  heading: string;
  paragraphs: string[];
};

export type ToolFaq = { q: string; a: string };

export type ToolShellProps = {
  slug: string;
  h1: string;
  intro: string;
  /** The interactive part. A client component. */
  calculator: ReactNode;
  /** Prose that helps the page rank and helps the reader. */
  explainers: ToolExplainer[];
  /**
   * The thing we are being honest about that a competitor would gloss
   * over. Rendered as a prominent amber note directly under the tool.
   */
  honesty?: { title: string; paragraphs: string[] };
  sources: ReadonlyArray<LegalSource>;
  filing: ReadonlyArray<FilingRoute>;
  faqs: ToolFaq[];
  cta: { title: string; body: string };
  /**
   * Overrides the closing disclaimer. The default wording is about
   * legal advice, which is right for the consumer rights checkers. The
   * money calculators need to disclaim financial advice instead, so
   * they pass their own. Optional, so existing pages are untouched.
   */
  disclaimer?: string;
};

const DEFAULT_DISCLAIMER =
  'Paybacker is not a law firm and this tool does not give legal advice. It is general guidance about UK consumer law, applied to the answers you gave. Rules change, and the outcome of any individual dispute depends on facts and evidence we cannot see from a form. For complex or high-value disputes, court proceedings, or anything where you are unsure, consult a qualified solicitor or Citizens Advice. We never state or imply a guaranteed outcome.';

/** Shared closing wording for the personal finance calculators. */
export const MONEY_DISCLAIMER =
  'Paybacker is not authorised to give financial advice and this calculator does not give any. It is arithmetic applied to the figures you entered, using published tax-year rates that are stated on the page. It takes no account of your circumstances, your other commitments, your existing contracts or your goals, and nothing here is a personal recommendation to take or refrain from any financial action. Tax treatment depends on individual circumstances and can change. For advice on your own position, speak to a regulated financial adviser. For free impartial guidance, MoneyHelper and Citizens Advice are the usual starting points.';

export default function ToolShell({
  slug,
  h1,
  intro,
  calculator,
  explainers,
  honesty,
  sources,
  filing,
  faqs,
  cta,
  disclaimer,
}: ToolShellProps) {
  const canonical = `${TOOLS_BASE}/${slug}`;

  // FAQPage is genuine here: every question below is answered in full on
  // the page. BreadcrumbList mirrors the visible breadcrumb. We do not
  // emit HowTo — these are eligibility checks, not step-by-step tasks.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://paybacker.co.uk' },
          { '@type': 'ListItem', position: 2, name: 'Free tools', item: TOOLS_BASE },
          { '@type': 'ListItem', position: 3, name: h1, item: canonical },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  const related = otherTools(slug).slice(0, 4);

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
              <Link href="/tools">Free tools</Link>
            </div>
            <div className="tool-free-badge">Free · no account · nothing to sign up for</div>
            <h1>{h1}</h1>
            <p className="tool-intro">{intro}</p>
          </div>
        </div>
      </section>

      <section className="section-light tool-section" style={{ paddingTop: 28 }}>
        <div className="wrap">
          {calculator}
          {honesty ? (
            <div className="tool-note">
              <strong>{honesty.title}</strong>
              {honesty.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {explainers.map((block) => (
        <section key={block.heading} className="section-light tool-section">
          <div className="wrap">
            <div className="tool-narrow">
              <h2>{block.heading}</h2>
              {block.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="section-light tool-section">
        <div className="wrap">
          <div className="tool-narrow">
            <h2>The law this tool relies on</h2>
            <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
              Every source below is primary legislation, government guidance, a
              statutory regulator or a statutory ombudsman. We do not cite
              comparison sites, trade bodies or news articles, because a
              citation is only as good as its source.
            </p>
          </div>
          <div className="tool-sources" style={{ marginTop: 24 }}>
            {sources.map((s) => (
              <div key={s.url} className="tool-source">
                <p className="tool-source-name">
                  {s.lawName}
                  {s.inLegalRefStore ? (
                    <span className="tool-source-flag">· in our verified citation index</span>
                  ) : null}
                </p>
                {s.section ? <p className="tool-source-section">{s.section}</p> : null}
                <p>{s.establishes}</p>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  Read the official source
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {filing.length > 0 ? (
        <section className="section-light tool-section">
          <div className="wrap">
            <div className="tool-narrow">
              <h2>Where you actually file</h2>
              <p style={{ fontSize: 15, color: 'var(--text-secondary)' }}>
                These are the scheme and tribunal websites, not legal sources.
                Check which scheme the company belongs to before you file, as
                sending an appeal to the wrong one wastes the deadline.
              </p>
            </div>
            <div className="tool-filing" style={{ marginTop: 22 }}>
              {filing.map((f) => (
                <div key={f.url} className="tool-filing-row">
                  <a href={f.url} target="_blank" rel="noopener noreferrer">
                    {f.name}
                  </a>
                  <span>{f.note}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section-light tool-section">
        <div className="wrap">
          <div className="tool-narrow">
            <h2>Questions people ask</h2>
          </div>
          <div className="faq-grid" style={{ marginTop: 20 }}>
            {faqs.map((f) => (
              <div key={f.q} className="faq-card">
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-light tool-section">
        <div className="wrap">
          <div className="final-cta">
            <h2>{cta.title}</h2>
            <p>{cta.body}</p>
            <Link className="btn btn-mint btn-lg" href={SIGNUP_HREF}>
              Start free
            </Link>
            <p style={{ fontSize: 13, marginTop: 18, marginBottom: 0 }}>
              Free plan includes 3 letters a month. No card needed. The tool
              above stays free and open either way.
            </p>
          </div>
        </div>
      </section>

      <section className="section-light tool-section" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="tool-narrow" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22 }}>Other free tools</h2>
          </div>
          <div className="tool-crosslinks">
            {related.map((t) => (
              <Link key={t.slug} className="tool-crosslink" href={`/tools/${t.slug}`}>
                <strong>{t.name}</strong>
                <span>{t.oneLiner}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section-light tool-section" style={{ paddingTop: 0, paddingBottom: 72 }}>
        <div className="wrap">
          <p className="tool-disclaimer">{disclaimer ?? DEFAULT_DISCLAIMER}</p>
        </div>
      </section>
    </main>
  );
}
