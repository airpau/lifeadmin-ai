import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import CareersInterestForm from './CareersInterestForm';
import './styles.css';

/**
 * /careers — marketing redesign.
 *
 * Design source: design-zip/redesign/batch6.jsx::CareersPage
 * Scoped under `.m-careers-root`.
 *
 * IMPORTANT — content deviations from the design:
 *
 *   1. The design lists three specific open roles (Senior ML Engineer, Full-stack,
 *      Head of Growth) with specific salary bands (£110–140k, £85–115k, £120–150k).
 *      NONE of these roles are in CONTENT_SOURCES_OF_TRUTH.md and the user has not
 *      confirmed active hiring — the pre-edit checklist in that file forbids
 *      inventing roles, salaries, or team size. We therefore swap the "open roles"
 *      listing for a "not actively recruiting — pitch us" state. When real roles
 *      open, the block can be swapped back to the design pattern.
 *
 *   2. The "3 open roles · Small team, big mission" eyebrow becomes
 *      "Careers · Small team, big mission" — the "3 open roles" claim would be
 *      false until real roles ship.
 *
 *   3. Principles and perks are kept. They're aspirational policies that describe
 *      how Paybacker will work when hiring begins — they do not claim anyone is
 *      currently employed under these policies.
 *
 * The approved tricolour hero ("Work on the / consumer's side, / for once.") is
 * pinned verbatim to CONTENT_SOURCES_OF_TRUTH.md §Approved hero-headline pattern.
 */

export const metadata: Metadata = {
  title: 'Careers — Work on the consumer\'s side, for once. | Paybacker',
  description:
    'Most fintech optimises for the bank. Paybacker optimises for the human getting overcharged. Outcomes not hours, public salary bands, real equity. Small team building UK consumer-law AI.',
  alternates: { canonical: 'https://paybacker.co.uk/careers' },
  openGraph: {
    title: 'Careers at Paybacker — work on the consumer\'s side, for once.',
    description:
      'Outcomes not hours. Public salary bands. Real equity. Pitch us your role.',
    url: 'https://paybacker.co.uk/careers',
    siteName: 'Paybacker',
    type: 'website',
  },
};

type CSSVarProperties = CSSProperties & Record<`--${string}`, string | number>;

const SIGNUP_HREF = '/auth/signup';
const SIGNIN_HREF = '/auth/login';

function MarkNav({ active }: { active: 'About' | 'Pricing' | 'Blog' | 'Careers' }) {
  const links: ReadonlyArray<readonly [typeof active, string]> = [
    ['About', '/about'],
    ['Pricing', '/pricing'],
    ['Blog', '/blog'],
    ['Careers', '/careers'],
  ];
  return (
    <div className="nav-shell">
      <nav className="nav-pill" aria-label="Primary">
        <Link className="nav-logo" href="/">
          <span className="pay">Pay</span>
          <span className="backer">backer</span>
        </Link>
        <div className="nav-links">
          {links.map(([label, href]) => (
            <Link key={label} href={href} className={label === active ? 'is-active' : undefined}>
              {label}
            </Link>
          ))}
        </div>
        <div className="nav-cta-row">
          <Link className="nav-signin" href={SIGNIN_HREF}>Sign in</Link>
          <Link className="nav-start" href={SIGNUP_HREF}>Start free</Link>
        </div>
      </nav>
    </div>
  );
}

function MarkFoot() {
  return (
    <footer>
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="logo">Pay<span className="backer">backer</span></div>
            <p>Find hidden overcharges. Fight unfair bills. Get your money back. Paybacker LTD, registered in England &amp; Wales (company no. 15289174).</p>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/deals">Deals</Link>
            <Link href="/templates">Letter templates</Link>
          </div>
          <div className="footer-col">
            <h5>Company</h5>
            <Link href="/about">About</Link>
            <Link href="/careers">Careers</Link>
            <Link href="/blog">Blog</Link>
            <a href="mailto:hello@paybacker.co.uk">Contact</a>
          </div>
          <div className="footer-col">
            <h5>Legal</h5>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/cookies">Cookies</Link>
            <Link href="/ico-notice">ICO notice</Link>
          </div>
          <div className="footer-col">
            <h5>Connect</h5>
            <div className="footer-socials" aria-label="Social links">
              <a href="https://x.com/PaybackerUK" aria-label="X (Twitter)">𝕏</a>
              <a href="https://www.linkedin.com/company/112575954/" aria-label="LinkedIn">in</a>
              <a href="https://www.instagram.com/paybacker.co.uk/" aria-label="Instagram">ig</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© 2026 Paybacker LTD · Launched March 2026</div>
          <div>Paybacker helps you exercise your rights under UK consumer law (Consumer Rights Act 2015, Ofcom General Conditions, Ofgem Standard Licence Conditions). We are not a law firm.</div>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------
// Content

const PRINCIPLES: ReadonlyArray<readonly [string, string]> = [
  [
    'Outcomes, not hours',
    'We measure what shipped, not what time you got here. Core hours 11am–3pm UK; the rest is yours.',
  ],
  [
    'Salary bands are public',
    'Every band is on an internal sheet every hire can read. No negotiation theatre — you get the top of your level.',
  ],
  [
    'Real equity',
    'Share options with a standard 4-year vest and 1-year cliff. Ranges scale with level and are transparent on each role page.',
  ],
  [
    'Grown-up leave',
    '28 days + bank holidays + Christmas shutdown. 6 months full-pay parental leave for any parent. Unlimited sick.',
  ],
];

const PERKS: ReadonlyArray<readonly [string, string, string]> = [
  ['💷', 'Top-of-band salary', 'No haggling. Public ladder.'],
  ['📈', 'Real equity', 'Share options, 4-year vest, 1-year cliff'],
  ['🏖️', '28 days + banks', 'Plus Christmas–New Year shutdown'],
  ['👶', '6 months parental', 'Full pay, any parent'],
  ['💻', '£2,500 kit budget', 'MacBook, monitor, chair — your call'],
  ['🧠', '£1,500/yr L&D', 'Books, courses, conferences'],
  ['🏥', 'Private healthcare', 'Family-inclusive cover'],
  ['🚴', 'Remote stipend', 'Monthly contribution to your home setup'],
];

const COLLAGE: ReadonlyArray<{ t: number; l: number; s: string; bg: string; lbl: string }> = [
  { t: 26,  l: 0,   s: '🐕', bg: '#FEF3C7',                 lbl: 'Biscuit · Chief Morale' },
  { t: 86,  l: 168, s: '💻', bg: 'var(--accent-mint-wash)', lbl: 'Typing sprint' },
  { t: 214, l: 46,  s: '⚖️', bg: '#EDE9FE',                 lbl: 'Statute readings' },
  { t: 286, l: 200, s: '☕', bg: '#EFF6FF',                 lbl: '11am flat white' },
  { t: 140, l: 296, s: '📬', bg: '#FEE2E2',                 lbl: 'Letters out: daily' },
];

// ---------------------------------------------------------------------

export default function CareersPage() {
  return (
    <div className="m-careers-root">
      <MarkNav active="Careers" />

      {/* Hero ------------------------------------------------------- */}
      <section
        className="section-light glow-wrap"
        style={{ '--glow-opacity': 0.16, paddingTop: 140, paddingBottom: 80 } as CSSVarProperties}
      >
        <div className="wrap">
          <div className="hero-grid">
            <div>
              <span className="eyebrow" style={{ color: 'var(--accent-orange-deep)' } as CSSProperties}>
                ● Careers · Small team, big mission
              </span>
              <h1 className="hero-headline">
                <span className="line-1">Work on the</span>
                <span className="line-2">consumer&rsquo;s side,</span>
                <span className="line-3">for once.</span>
              </h1>
              <p className="hero-sub">
                Most fintech optimises for the bank. Paybacker optimises for the human getting overcharged. It&rsquo;s a more interesting problem — and a far better reason to build.
              </p>
              <div className="cta-row">
                <a className="btn btn-mint" href="#pitch">Pitch us your role →</a>
                <a className="btn btn-ghost" href="#principles">How we work</a>
              </div>
            </div>
            <div className="collage" aria-hidden="true">
              {COLLAGE.map((c, i) => (
                <div
                  key={i}
                  className="collage-card"
                  style={{
                    top: c.t,
                    left: c.l,
                    background: c.bg,
                    transform: `rotate(${(i % 2 ? 1 : -1) * (2 + i)}deg)`,
                  } as CSSProperties}
                >
                  <div className="emoji">{c.s}</div>
                  <div className="label">{c.lbl}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Principles ------------------------------------------------- */}
      <section id="principles" className="section-mint" style={{ padding: '120px 0' } as CSSProperties}>
        <div className="wrap">
          <span className="eyebrow">How we work</span>
          <h2
            style={{
              fontSize: 'var(--fs-h2)',
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              margin: '12px 0 48px',
              maxWidth: 780,
              lineHeight: 1.05,
            } as CSSProperties}
          >
            No ping-pong, no &ldquo;family&rdquo;, no unlimited PTO that no one takes.
          </h2>
          <div className="principles-grid">
            {PRINCIPLES.map(([t, b]) => (
              <div key={t} className="principle-card">
                <h3>{t}</h3>
                <p>{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Register your interest (replaces invented "open roles" listing) */}
      <section id="pitch" className="section-ink" style={{ padding: '120px 0' } as CSSProperties}>
        <div className="wrap">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.3fr',
              gap: 64,
              alignItems: 'start',
            } as CSSProperties}
            className="register-grid"
          >
            <div>
              <span className="eyebrow on-ink">Hiring</span>
              <h2
                style={{
                  fontSize: 'var(--fs-h2)',
                  fontWeight: 700,
                  letterSpacing: 'var(--track-tight)',
                  margin: '12px 0 18px',
                  lineHeight: 1.05,
                  color: 'var(--text-on-ink)',
                } as CSSProperties}
              >
                Not actively recruiting — yet.
              </h2>
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.65,
                  color: 'var(--text-on-ink-dim)',
                  margin: '0 0 24px',
                  maxWidth: 420,
                } as CSSProperties}
              >
                We launched in March 2026 and we&rsquo;re a small team. We aren&rsquo;t running a live recruitment funnel, but we always read expressions of interest — especially from people working at the edge of AI, UK consumer law, or growth for consumer products.
              </p>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--text-on-ink-dim)',
                  margin: 0,
                  maxWidth: 420,
                } as CSSProperties}
              >
                The &ldquo;How we work&rdquo; block above is the contract we&rsquo;ll hold ourselves to when we hire. Leave your details and we&rsquo;ll email the moment we start.
              </p>
            </div>
            <div>
              <CareersInterestForm />
            </div>
          </div>
        </div>
      </section>

      {/* Perks ------------------------------------------------------ */}
      <section className="section-ink" style={{ padding: '120px 0' } as CSSProperties}>
        <div className="wrap">
          <span className="eyebrow on-ink">The details</span>
          <h2
            style={{
              fontSize: 'var(--fs-h2)',
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              margin: '12px 0 48px',
              lineHeight: 1.05,
              color: 'var(--text-on-ink)',
            } as CSSProperties}
          >
            What you&rsquo;ll get, beyond salary.
          </h2>
          <div className="perks-grid">
            {PERKS.map(([e, t, b]) => (
              <div key={t} className="perk">
                <div className="emoji">{e}</div>
                <div className="title">{t}</div>
                <div className="sub">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <MarkFoot />
    </div>
  );
}
