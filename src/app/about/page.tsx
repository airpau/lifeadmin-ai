import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import './styles.css';

/**
 * /about — marketing redesign.
 *
 * Design source: design-zip/redesign/batch6.jsx::AboutPage
 * Scoped under `.m-about-root`. Copy pinned to CONTENT_SOURCES_OF_TRUTH.md —
 * launch date March 2026, no founder anecdote, no investor fiction.
 */

export const metadata: Metadata = {
  title: 'About Paybacker — Lawyers are too expensive. Suppliers know it.',
  description:
    'Paybacker bridges the gap between an unfair bill and a lawyer who costs more than the refund. Launched March 2026 to help normal working people save money proactively.',
  alternates: { canonical: 'https://paybacker.co.uk/about' },
  openGraph: {
    title: 'About Paybacker — Fighting for UK consumers',
    description:
      'Launched March 2026. We read the Consumer Rights Act so you don\u2019t have to. Small team, big backlog, 0% success fee on every tier.',
    url: 'https://paybacker.co.uk/about',
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
            <Link
              key={label}
              href={href}
              className={active === label ? 'is-active' : undefined}
              aria-current={active === label ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="nav-cta-row">
          <Link className="nav-signin" href={SIGNIN_HREF}>Sign in</Link>
          <Link className="nav-start" href={SIGNUP_HREF}>Start Free</Link>
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
            <div className="logo">
              <span>Pay</span>
              <span className="backer">backer</span>
            </div>
            <p>The UK&apos;s AI money-back engine. We find what you&apos;re losing and fight to get it back.</p>
            <p style={{ marginTop: 14, fontSize: 11, color: 'var(--text-on-ink-dim)', maxWidth: 320 }}>
              AI-generated letters are for guidance only and do not constitute legal advice. For complex disputes, always consult a qualified solicitor.
            </p>
          </div>
          <div className="footer-col">
            <h5>Product</h5>
            <Link href="/dashboard/complaints">Disputes Centre</Link>
            <Link href="/dashboard/money-hub">Money Hub</Link>
            <Link href="/dashboard">Pocket Agent</Link>
            <Link href="/deals">Deals</Link>
            <Link href="/pricing">Pricing</Link>
          </div>
          <div className="footer-col">
            <h5>Company</h5>
            <Link href="/about">About</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/careers">Careers</Link>
            <a href="mailto:hello@paybacker.co.uk">Contact</a>
          </div>
          <div className="footer-col">
            <h5>Legal</h5>
            <Link href="/privacy-policy">Privacy</Link>
            <Link href="/terms-of-service">Terms</Link>
            <Link href="/cookie-policy">Cookies</Link>
          </div>
          <div className="footer-col">
            <h5>Connect</h5>
            <div className="footer-socials" style={{ marginBottom: 14 }}>
              <a href="https://x.com/PaybackerUK" aria-label="X" target="_blank" rel="noopener noreferrer">𝕏</a>
              <a href="https://www.instagram.com/paybacker.co.uk/" aria-label="Instagram" target="_blank" rel="noopener noreferrer">◎</a>
              <a href="https://www.facebook.com/profile.php?id=61579563073310" aria-label="Facebook" target="_blank" rel="noopener noreferrer">f</a>
              <a href="https://www.tiktok.com/@paybacker.co.uk" aria-label="TikTok" target="_blank" rel="noopener noreferrer">♪</a>
              <a href="https://www.linkedin.com/company/112575954/" aria-label="LinkedIn" target="_blank" rel="noopener noreferrer">in</a>
            </div>
            <a href="mailto:hello@paybacker.co.uk">hello@paybacker.co.uk</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© 2026 Paybacker LTD · Company no. 15289174 · Registered in England &amp; Wales</div>
          <div>paybacker.co.uk · Made in London 🇬🇧</div>
        </div>
      </div>
    </footer>
  );
}

const TIMELINE: ReadonlyArray<readonly [string, string, string]> = [
  [
    'The problem',
    'Years of quiet overcharging',
    'Suppliers have been getting away with unfair bills, silent price rises, and forgotten subscriptions for years. The only real recourse is a lawyer — and a lawyer costs more than the overcharge. So most people do nothing.',
  ],
  [
    'The gap',
    'Too small for law, too big to ignore',
    'A £47 broadband anniversary rise. A £12/mo gym you cancelled in January. A mid-contract price hike you didn\u2019t agree to. Individually not worth fighting. Collectively, over £1,000 a year for a typical UK household.',
  ],
  [
    'The idea',
    'What if the fight was free?',
    'AI can read the Consumer Rights Act. It can draft the letter. It can cite Ofcom General Conditions by section. The expensive part of a lawyer — the reading and the writing — becomes cheap.',
  ],
  [
    'March 2026',
    'Paybacker launches',
    'We open the doors to everyone. Free tier for occasional disputes, £4.99/mo for people with a few bills to watch, £9.99/mo for households who want the full sweep. 0% of any refund. Ever.',
  ],
  [
    'Today',
    'Bridging the gap',
    'We\u2019re the layer between you and the companies that bank on you not bothering. Small team, big backlog, and a simple belief: working people shouldn\u2019t need a solicitor to get their own money back.',
  ],
];

const STATS: ReadonlyArray<readonly [string, string, string]> = [
  ['£1,000+', 'Overcharged per UK household, per year', 'Forgotten subs, silent rises, unfair bills'],
  ['£250+', 'Per hour for a consumer solicitor', 'Not worth it for a £47 broadband hike'],
  ['0%', 'Of your refund — ever', 'Flat subscription, we never take a cut'],
  ['30s', 'To draft a dispute letter', 'Cited Consumer Rights Act, section by section'],
];

const VALUES: ReadonlyArray<readonly [string, string]> = [
  [
    'We read the law, not the marketing',
    'Every letter cites the specific statute or regulation. Consumer Rights Act 2015, Ofcom General Conditions, Ofgem Standard Licence Conditions — no vague "we think this is unfair."',
  ],
  [
    'Your data stays in the UK',
    'Read-only bank sync via Yapily (FCA-authorised). ICO registered. We never sell, rent, or train models on your transactions. Export or delete everything in one click.',
  ],
  [
    'Small money matters',
    'A £7.99/mo forgotten sub is £96/yr. Four of those is a holiday. We go after the small stuff, because nobody else will.',
  ],
  [
    'Transparent economics',
    '£0 or £4.99/mo flat. We take 0% of your refund. Your win is your win — keep every penny.',
  ],
];

export default function AboutPage() {
  return (
    <div className="m-about-root">
      <MarkNav active="About" />

      {/* HERO */}
      <section
        className="section-light glow-wrap"
        style={{ '--glow-opacity': 0.18, paddingTop: 140, paddingBottom: 80 } as CSSVarProperties}
      >
        <div className="wrap">
          <span className="eyebrow">
            About · Paybacker LTD · Launched March 2026
            <span className="eyebrow-dot" aria-hidden="true"> · </span>
            <span className="eyebrow-trust">ICO registered · FCA-authorised via Yapily</span>
          </span>
          <h1
            style={{
              fontSize: 'var(--fs-display)',
              lineHeight: 0.96,
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              margin: '18px 0 24px',
              maxWidth: 1000,
            }}
          >
            <span style={{ display: 'block', color: 'var(--text-primary)' }}>Lawyers are</span>
            <span style={{ display: 'block', color: 'var(--accent-mint-deep)' }}>too expensive.</span>
            <span style={{ display: 'block', color: 'var(--accent-orange-deep)' }}>Suppliers know it.</span>
          </h1>
          <p
            style={{
              fontSize: 19,
              color: 'var(--text-secondary)',
              maxWidth: 720,
              lineHeight: 1.5,
              margin: '0 0 36px',
            }}
          >
            Paybacker bridges the gap. We help normal working people save money proactively — spotting the overcharges, silent price rises and forgotten subscriptions that a solicitor would never be worth hiring for, and fighting them with AI-drafted letters that cite UK consumer law.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link className="btn btn-mint" href={SIGNUP_HREF}>
              Start free — no card needed →
            </Link>
            <Link className="btn btn-ghost" href="/careers">
              We&apos;re hiring — see roles
            </Link>
          </div>
        </div>
      </section>

      {/* STAT BAND */}
      <section className="section-ink" style={{ padding: '80px 0' }}>
        <div className="wrap">
          <span className="eyebrow on-ink">Why we exist</span>
          <div
            className="stat-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 48, marginTop: 32 }}
          >
            {STATS.map(([big, label, sub]) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: 'clamp(44px,4.5vw,64px)',
                    fontWeight: 700,
                    letterSpacing: '-.025em',
                    color: 'var(--accent-mint)',
                    lineHeight: 1,
                  }}
                >
                  {big}
                </div>
                <div style={{ fontSize: 15, color: 'var(--text-on-ink)', marginTop: 12, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-on-ink-dim)', marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ORIGIN TIMELINE */}
      <section className="section-light" style={{ padding: '120px 0' }}>
        <div className="wrap">
          <div
            className="timeline-grid"
            style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 80 }}
          >
            <div className="timeline-sticky" style={{ position: 'sticky', top: 120, alignSelf: 'start' }}>
              <span className="eyebrow">Origin story</span>
              <h2
                style={{
                  fontSize: 'var(--fs-h2)',
                  fontWeight: 700,
                  letterSpacing: 'var(--track-tight)',
                  lineHeight: 1.05,
                  margin: '14px 0 16px',
                }}
              >
                The gap between a bill and a lawyer.
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
                Paybacker exists because suppliers have been getting away with it for years. The overcharges are individually too small to lawyer up for, and collectively too big to ignore. We built the bridge.
              </p>
            </div>
            <div>
              {TIMELINE.map(([date, title, body], i) => (
                <div
                  key={date}
                  className="timeline-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr',
                    gap: 28,
                    paddingBottom: 32,
                    marginBottom: 32,
                    borderBottom: i < TIMELINE.length - 1 ? '1px solid var(--divider)' : 'none',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: 'var(--track-eyebrow)',
                      textTransform: 'uppercase',
                      color: 'var(--accent-mint-deep)',
                    }}
                  >
                    {date}
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        letterSpacing: '-.015em',
                        margin: '0 0 10px',
                        lineHeight: 1.2,
                      }}
                    >
                      {title}
                    </h3>
                    <p style={{ fontSize: 16, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* VALUES */}
      <section style={{ background: 'var(--accent-mint-wash)', padding: '120px 0' }}>
        <div className="wrap">
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span className="eyebrow">What we believe</span>
            <h2
              style={{
                fontSize: 'var(--fs-h2)',
                fontWeight: 700,
                letterSpacing: 'var(--track-tight)',
                margin: '12px auto 0',
                lineHeight: 1.05,
                maxWidth: 760,
              }}
            >
              Four principles we won&apos;t flex on.
            </h2>
          </div>
          <div
            className="values-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 22 }}
          >
            {VALUES.map(([title, body], i) => (
              <div
                key={title}
                style={{
                  background: '#fff',
                  border: '1px solid var(--divider)',
                  borderRadius: 'var(--r-card)',
                  padding: 32,
                  display: 'flex',
                  gap: 24,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 14,
                    background: 'var(--surface-ink)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 20,
                    flexShrink: 0,
                    letterSpacing: '-.02em',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  0{i + 1}
                </div>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.015em', margin: '0 0 10px' }}>{title}</h3>
                  <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO WE ARE — factual company block. Per
          redesign/CONTENT_SOURCES_OF_TRUTH.md we explicitly do not
          tell a founder anecdote or investor-pitch story, so this
          section sticks to the registered-facts: company, location,
          founding date, size, contact. It reinforces trust (small UK
          team behind a fintech that reads your bank feed) without
          fabricating a narrative. */}
      <section style={{ padding: '96px 0' }}>
        <div className="wrap">
          <div
            style={{
              maxWidth: 880,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 28,
              textAlign: 'center',
            }}
          >
            <span className="eyebrow">Who we are</span>
            <h2
              style={{
                fontSize: 'clamp(32px, 4vw, 44px)',
                fontWeight: 700,
                letterSpacing: 'var(--track-tight)',
                lineHeight: 1.05,
                margin: 0,
                color: 'var(--text-primary)',
              }}
            >
              A small UK team building one thing well.
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--text-secondary)', margin: '0 auto', maxWidth: 640 }}>
              Paybacker LTD is a privately-owned UK company, incorporated in
              London in March 2026. Company number 15289174, registered in
              England &amp; Wales. We&rsquo;re a small team and keep it that
              way on purpose &mdash; every feature we ship is reviewed by a
              human who actually uses it to fight their own bills. If you
              want to talk to us, <a href="mailto:hello@paybacker.co.uk" style={{ color: 'var(--accent-mint-deep)', fontWeight: 600 }}>hello@paybacker.co.uk</a>{' '}
              goes straight to the inbox.
            </p>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: '10px 24px',
                marginTop: 8,
                fontSize: 13,
                color: 'var(--text-tertiary)',
                fontWeight: 500,
                letterSpacing: 0.02,
              }}
            >
              <span>🇬🇧 UK-registered &amp; UK-hosted</span>
              <span>·</span>
              <span>FCA-authorised bank sync via Yapily</span>
              <span>·</span>
              <span>ICO registered</span>
              <span>·</span>
              <span>GDPR compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section
        className="final-cta section-ink glow-wrap"
        style={{ '--glow-opacity': 0.14, padding: '120px 0' } as CSSVarProperties}
      >
        <div className="wrap">
          <h2 style={{ fontSize: 'clamp(48px,6vw,72px)' }}>
            Ready to find out
            <br />
            <span className="mint">what you&apos;re owed?</span>
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-on-ink-dim)', marginTop: 24, fontSize: 17 }}>
            Free forever for occasional disputes. Paid plans from £4.99/mo — 0% of your refund, any tier.
          </p>
          <div style={{ textAlign: 'center', marginTop: 36 }}>
            <Link className="btn btn-mint" href={SIGNUP_HREF}>
              Start your free scan →
            </Link>
          </div>
          <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--text-on-ink-dim)', fontSize: 13 }}>
            No card. Cancel anytime. Your data stays in the UK.
          </p>
        </div>
      </section>

      <MarkFoot />
    </div>
  );
}
