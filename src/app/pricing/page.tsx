import type { Metadata } from 'next';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import './styles.css';

/**
 * /pricing — marketing redesign.
 *
 * Design source: design-zip/redesign/batch6.jsx::PricingRecap
 * Tokens: aliased onto globals.css Tailwind v4 theme in styles.css
 *
 * Scoped under `.m-pricing-root` so styles can't leak onto other routes.
 * Pricing copy pinned to redesign/CONTENT_SOURCES_OF_TRUTH.md — three
 * tiers only (Free £0 / Essential £4.99 / Pro £9.99) with 0% success fee.
 */

export const metadata: Metadata = {
  title: 'Pricing — Free forever, paid from £4.99/mo. 0% success fee, ever.',
  description:
    'Three tiers: Free forever for occasional disputes, Essential £4.99/mo for unlimited letters and bank sync, Pro £9.99/mo for the full sweep. No tier ever takes a cut of your refund.',
  alternates: { canonical: 'https://paybacker.co.uk/pricing' },
  openGraph: {
    title: 'Paybacker pricing — Free forever, paid from £4.99/mo',
    description:
      'Three tiers. 0% success fee, ever. £4.99/mo for unlimited UK dispute letters and Yapily bank sync (2 accounts). £9.99/mo for unlimited.',
    url: 'https://paybacker.co.uk/pricing',
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
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
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

// "On a typical £216 refund" math table — figures pre-computed from the
// percentage ranges so we don't claim anything stronger than the
// 15–30% band that's already on the homepage.
const MATH_ROWS: ReadonlyArray<{
  label: string;
  keep: string;
  note: string;
  highlight: boolean;
}> = [
  { label: 'Competitor A (30%)', keep: '£151.20', note: 'lost £64.80', highlight: false },
  { label: 'Competitor B (25%)', keep: '£162.00', note: 'lost £54.00', highlight: false },
  { label: 'Competitor C (15–20%)', keep: '£172–183', note: 'lost £32–43', highlight: false },
  { label: 'Paybacker (0%)', keep: '£216.00', note: 'you keep £216', highlight: true },
];

const COMPARE_ROWS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['AI dispute letters', '3 / month', 'Unlimited', 'Unlimited'],
  ['Bank accounts (read-only, FCA via Yapily)', '2', '3', 'Unlimited'],
  ['Email inboxes (Watchdog reply monitoring)', '1', '3', 'Unlimited'],
  ['Subscription tracker', 'Unlimited', 'Unlimited', 'Unlimited'],
  ['Pocket Agent in Telegram', '•', '•', '•'],
  ['AI chatbot', '•', '•', '•'],
  ['Spending intelligence', 'Top 5 categories', 'All 20+ categories', 'All 20+ categories'],
  ['AI cancellation emails with legal context', '—', '•', '•'],
  ['Renewal reminders (30/14/7 days)', '—', '•', '•'],
  ['Money Hub budgets + savings goals', '—', '•', '•'],
  ['Price-increase alerts by email', '—', '•', '•'],
  ['Contract end-date tracking', '—', '•', '•'],
  ['Money Hub top merchants', '—', '—', '•'],
  ['Full transaction-level analysis', '—', '—', '•'],
  ['Price-increase alerts via Telegram (instant)', '—', '—', '•'],
  ['Export (CSV / PDF)', '—', '—', '•'],
  ['Paybacker MCP (Claude Desktop)', '—', '—', '•'],
  ['On-demand bank sync', '—', '—', '•'],
  ['Priority support', '—', '—', '•'],
  ['Success fee on refunds', '0%', '0%', '0%'],
];

const FAQS: ReadonlyArray<readonly [string, string]> = [
  [
    'What does "Founding Member · locked-in forever" actually mean?',
    'If you join on Essential (£4.99) or Pro (£9.99), that price is guaranteed for as long as you stay subscribed — even after we raise prices for new customers. Cancel and resubscribe later, you go to the then-current price.',
  ],
  [
    'How do you make money if you don\u2019t take a cut of refunds?',
    'Flat subscription revenue. We\u2019re deliberately small and deliberately cheap — we\u2019d rather grow slowly and keep the incentives clean than take 25% of your refund like everyone else.',
  ],
  [
    'Is my bank data safe?',
    'We use Yapily (FCA-authorised) for read-only bank sync. We never see your password. We never initiate payments. Full audit log in Settings \u2192 Connected accounts. ICO registered, UK-based, GDPR compliant.',
  ],
  [
    'Can I cancel anytime?',
    'Yes — one click, no "are you sure" theatre, no 30-day notice. You keep access until the end of your current month.',
  ],
  [
    'What if a dispute letter doesn\u2019t get me a refund?',
    'Most letters do succeed. When they don\u2019t, we provide next-step guidance (Ombudsman, CMA, small-claims) and all the evidence logged. You never pay per-dispute.',
  ],
];

export default function PricingPage() {
  return (
    <div className="m-pricing-root">
      <MarkNav active="Pricing" />

      {/* HERO */}
      <section
        className="section-light glow-wrap"
        style={{ '--glow-opacity': 0.18, paddingTop: 140, paddingBottom: 60 } as CSSVarProperties}
      >
        <div className="wrap" style={{ textAlign: 'center' }}>
          <span className="eyebrow" style={{ color: 'var(--accent-orange-deep)' }}>
            ● Three tiers — Founding rates locked in forever
          </span>
          <h1
            style={{
              fontSize: 'var(--fs-display)',
              lineHeight: 0.96,
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              margin: '18px auto 24px',
              maxWidth: 1040,
            }}
          >
            <span style={{ display: 'block', color: 'var(--text-primary)' }}>Free forever.</span>
            <span style={{ display: 'block', color: 'var(--accent-mint-deep)' }}>Paid from £4.99/mo.</span>
            <span style={{ display: 'block', color: 'var(--accent-orange-deep)' }}>We never take a cut.</span>
          </h1>
          <p
            style={{
              fontSize: 19,
              color: 'var(--text-secondary)',
              maxWidth: 700,
              lineHeight: 1.5,
              margin: '0 auto 32px',
            }}
          >
            Start free for occasional disputes. Pay £4.99/mo when you want unlimited letters and bank sync. £9.99/mo for the full sweep across every account. No tier ever charges a success fee on your refund.
          </p>
        </div>
      </section>

      {/* PRICING GRID */}
      <section className="pricing-section" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <div className="pricing-grid">
            <div className="price-card">
              <div className="tier">Free</div>
              <div className="price">
                £0<span className="per">/forever</span>
              </div>
              <div className="founding" style={{ visibility: 'hidden' }}>—</div>
              <ul>
                <li>3 AI dispute letters / month</li>
                <li>2 bank accounts · daily auto-sync</li>
                <li>1 email inbox · Watchdog reply monitoring</li>
                <li>Unlimited subscription tracker</li>
                <li>Basic spending overview (top 5 categories)</li>
                <li>Pocket Agent in Telegram + AI chatbot</li>
              </ul>
              <Link className="btn btn-ghost cta" href={SIGNUP_HREF} style={{ justifyContent: 'center' }}>
                Start free →
              </Link>
            </div>

            <div className="price-card featured">
              <span className="ribbon">Most popular</span>
              <div className="tier">Essential</div>
              <div className="price">
                £4.99<span className="per">/month</span>
              </div>
              <div className="founding">or £44.99/yr · Founding rate locked-in forever</div>
              <ul>
                <li>Unlimited AI dispute letters</li>
                <li>3 bank accounts · daily auto-sync</li>
                <li>3 email inboxes · Watchdog reply monitoring</li>
                <li>AI cancellation emails with legal context</li>
                <li>Full spending intelligence (20+ categories)</li>
                <li>Budgets + savings goals</li>
                <li>Renewal reminders (30/14/7 days)</li>
                <li>Price-increase alerts by email</li>
              </ul>
              <Link className="btn btn-mint cta" href={SIGNUP_HREF} style={{ justifyContent: 'center' }}>
                Get Essential →
              </Link>
            </div>

            <div className="price-card">
              <div className="tier">Pro</div>
              <div className="price">
                £9.99<span className="per">/month</span>
              </div>
              <div className="founding">or £94.99/yr · Founding rate locked-in forever</div>
              <ul>
                <li>Everything in Essential</li>
                <li>Unlimited bank &amp; email connections</li>
                <li>Money Hub top merchants + transaction analysis</li>
                <li>Price-increase alerts via Telegram (instant)</li>
                <li>Export to CSV &amp; PDF</li>
                <li>Paybacker MCP (Claude Desktop integration)</li>
                <li>On-demand bank sync</li>
                <li>Priority support</li>
              </ul>
              <Link className="btn btn-ghost cta" href={SIGNUP_HREF} style={{ justifyContent: 'center' }}>
                Go Pro →
              </Link>
            </div>
          </div>
          <p className="compare-link">
            <a href="#compare">See the full feature comparison ↓</a>
          </p>
        </div>
      </section>

      {/* THE MATH */}
      <section style={{ padding: '120px 0', background: 'var(--accent-mint-wash)' }}>
        <div className="wrap">
          <div
            className="math-grid"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 56, alignItems: 'center' }}
          >
            <div>
              <span className="eyebrow">The math</span>
              <h2
                style={{
                  fontSize: 'var(--fs-h2)',
                  fontWeight: 700,
                  letterSpacing: 'var(--track-tight)',
                  margin: '12px 0 16px',
                  lineHeight: 1.05,
                }}
              >
                Three tiers. Zero success fees.
              </h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>
                Whichever tier you pick, we never take a cut of your refund. Competitors charge 15–30% on a successful dispute — on a typical £216 refund, that&apos;s up to £65 out of your pocket. Our revenue comes from the flat subscription, so the incentive stays clean: the more we help you, the longer you stay.
              </p>
            </div>
            <div
              style={{
                background: '#fff',
                borderRadius: 'var(--r-card)',
                border: '1px solid var(--divider)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid var(--divider)',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: 'var(--track-eyebrow)',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                }}
              >
                On a typical £216 refund
              </div>
              {MATH_ROWS.map((row) => (
                <div
                  key={row.label}
                  style={{
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--divider)',
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1fr 1.3fr',
                    gap: 14,
                    alignItems: 'center',
                    background: row.highlight ? 'var(--accent-mint-wash)' : '#fff',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: row.highlight ? 700 : 500 }}>{row.label}</div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      letterSpacing: '-.01em',
                      color: row.highlight ? 'var(--accent-mint-deep)' : 'var(--text-primary)',
                    }}
                  >
                    {row.keep}
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: row.highlight ? 'var(--accent-mint-deep)' : 'var(--text-tertiary)',
                      fontWeight: row.highlight ? 700 : 400,
                    }}
                  >
                    {row.note}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section id="compare" style={{ padding: '120px 0' }}>
        <div className="wrap">
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span className="eyebrow">Full comparison</span>
            <h2
              style={{
                fontSize: 'var(--fs-h2)',
                fontWeight: 700,
                letterSpacing: 'var(--track-tight)',
                margin: '12px 0 0',
                lineHeight: 1.05,
              }}
            >
              What&apos;s actually included.
            </h2>
          </div>
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--divider)',
              borderRadius: 'var(--r-card)',
              overflow: 'hidden',
            }}
          >
            <div
              className="compare-table-head"
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr',
                background: 'var(--surface-base)',
                padding: '18px 28px',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 'var(--track-eyebrow)',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
              }}
            >
              <div>Feature</div>
              <div style={{ textAlign: 'center' }}>Free</div>
              <div style={{ textAlign: 'center', color: 'var(--accent-mint-deep)' }}>Essential · £4.99</div>
              <div style={{ textAlign: 'center' }}>Pro · £9.99</div>
            </div>
            {COMPARE_ROWS.map((row) => (
              <div
                key={row[0]}
                className="compare-table-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr',
                  padding: '18px 28px',
                  borderTop: '1px solid var(--divider)',
                  fontSize: 14.5,
                  alignItems: 'center',
                }}
              >
                <div style={{ color: 'var(--text-primary)' }}>{row[0]}</div>
                {row.slice(1).map((value, j) => (
                  <div
                    key={j}
                    style={{
                      textAlign: 'center',
                      color:
                        value === '•'
                          ? 'var(--accent-mint-deep)'
                          : value === '—'
                          ? '#D1D5DB'
                          : 'var(--text-secondary)',
                      fontWeight: value === '•' ? 700 : 500,
                      fontSize: value === '•' ? 18 : 14,
                    }}
                  >
                    {value}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '0 0 120px' }}>
        <div className="wrap" style={{ maxWidth: 820 }}>
          <span className="eyebrow">Common questions</span>
          <h2
            style={{
              fontSize: 'var(--fs-h2)',
              fontWeight: 700,
              letterSpacing: 'var(--track-tight)',
              margin: '12px 0 32px',
              lineHeight: 1.05,
            }}
          >
            Things people ask first.
          </h2>
          {FAQS.map(([question, answer]) => (
            <details
              key={question}
              style={{ padding: '22px 24px', borderBottom: '1px solid var(--divider)', cursor: 'pointer' }}
            >
              <summary
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: '-.01em',
                  listStyle: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  color: 'var(--text-primary)',
                }}
              >
                {question}
                <span style={{ fontSize: 22, color: 'var(--text-tertiary)', fontWeight: 400, marginLeft: 16 }}>+</span>
              </summary>
              <p style={{ fontSize: 15.5, lineHeight: 1.65, color: 'var(--text-secondary)', margin: '14px 0 0' }}>
                {answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section
        className="final-cta section-ink glow-wrap"
        style={{ '--glow-opacity': 0.14, padding: '120px 0' } as CSSVarProperties}
      >
        <div className="wrap">
          <h2 style={{ fontSize: 'clamp(48px,6vw,72px)' }}>
            Stop overpaying.
            <br />
            Start <span className="mint">fighting</span> back.
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-on-ink-dim)', marginTop: 24, fontSize: 17 }}>
            Free forever tier. Paid plans from £4.99/mo. Keep 100% of your refunds, every tier.
          </p>
          <div
            style={{
              textAlign: 'center',
              marginTop: 36,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link className="btn btn-mint" href={SIGNUP_HREF}>
              Start free →
            </Link>
            <Link
              className="btn btn-ghost on-ink"
              style={{ color: 'var(--accent-mint)', borderColor: 'rgba(52,211,153,.3)' }}
              href={SIGNUP_HREF}
            >
              Try Essential 14 days free →
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
