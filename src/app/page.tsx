import Link from 'next/link';
import HomeNav from '@/components/home/HomeNav';
import HomeHero from '@/components/home/HomeHero';
import HomeFeaturesTab from '@/components/home/HomeFeaturesTab';
import HomeFAQ from '@/components/home/HomeFAQ';
import HomeTestimonials from '@/components/home/HomeTestimonials';
import AnimInit from '@/components/home/AnimInit';

const HOMEPAGE_CSS = `
  /* Override dark body background for the homepage — body has navy from globals.css */
  body:has([data-homepage="true"]) {
    background: #ffffff;
  }
  [data-homepage="true"] {
    --hp-hero-bg: #111318;
    --hp-body-bg: #ffffff;
    --hp-surface: #f8fafc;
    --hp-card-dark: #1e2330;
    --hp-text: #0f172a;
    --hp-muted: #64748b;
    --hp-mint: #34d399;
    --hp-amber: #f59e0b;
    --hp-amber-h: #d97706;
    font-family: var(--font-plus-jakarta), system-ui, sans-serif;
    /* White base so gaps between sections never expose the dark body */
    background: #ffffff;
    /* Dark base text — overrides body { color: #e2e8f0 } from globals.css.
       Elements with explicit inline color styles are unaffected (inline > CSS). */
    color: #1e293b;
  }
  /* Reinforce dark text for light sections — excludes dark-bg sections (#trust, #cta)
     which need white text. footer is also excluded since it has its own dark bg. */
  [data-homepage="true"] section:not(#hero):not(#trust):not(#cta) {
    color: #1e293b;
  }
  [data-homepage="true"] section:not(#hero):not(#trust):not(#cta) h1,
  [data-homepage="true"] section:not(#hero):not(#trust):not(#cta) h2,
  [data-homepage="true"] section:not(#hero):not(#trust):not(#cta) h3,
  [data-homepage="true"] section:not(#hero):not(#trust):not(#cta) h4,
  [data-homepage="true"] section:not(#hero):not(#trust):not(#cta) p {
    color: #1e293b;
  }
  /* Dark sections and footer use white text */
  [data-homepage="true"] #trust,
  [data-homepage="true"] #cta,
  [data-homepage="true"] footer {
    color: #ffffff;
  }
  /* Entrance animations removed — were causing sections to be invisible
     until IntersectionObserver fired. hp-reveal is kept as a no-op class
     so markup doesn't need changing if animations are re-enabled later. */
  [data-homepage="true"] .hp-reveal {
    opacity: 1;
    transform: none;
  }
  @keyframes hp-fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @media (max-width: 768px) {
    [data-homepage="true"] .hp-nav-links { display: none !important; }
    [data-homepage="true"] .hp-nav-login { display: none !important; }
    [data-homepage="true"] .hp-hamburger { display: flex !important; }
    [data-homepage="true"] .hp-features-grid { grid-template-columns: 1fr !important; }
    [data-homepage="true"] .hp-scroll-tabs { display: none !important; }
    [data-homepage="true"] .hp-trust-grid { grid-template-columns: 1fr 1fr !important; }
    [data-homepage="true"] .hp-stats-row { grid-template-columns: 1fr !important; }
    [data-homepage="true"] .hp-highlight-grid { grid-template-columns: 1fr !important; }
    [data-homepage="true"] .hp-footer-grid { grid-template-columns: 1fr 1fr !important; }
  }
`;

const mintCheck = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
    <circle cx="10" cy="10" r="10" fill="rgba(52,211,153,0.15)" />
    <path d="M6 10L9 13L14 7" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Home() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: HOMEPAGE_CSS }} />
      <AnimInit />
      <HomeNav />

      <main data-homepage="true">
        {/* Hero + scroll-pinned mockup */}
        <HomeHero />

        {/* Stats bar */}
        <section style={{ background: '#ffffff', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div
              className="hp-stats-row hp-reveal"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}
            >
              {[
                { top: '14', label: 'UK banks connected' },
                { top: 'Real-time', label: 'Bank sync' },
                { top: 'AI-powered', label: 'Insights & alerts' },
              ].map((s, i) => (
                <div
                  key={s.label}
                  className={`hp-delay-${i + 1}`}
                  style={{
                    background: '#1e2330',
                    borderRadius: '24px',
                    padding: 'clamp(24px, 4vw, 40px)',
                    textAlign: 'center',
                  }}
                >
                  <p style={{
                    fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
                    fontSize: 'clamp(36px, 5vw, 48px)',
                    fontWeight: 800,
                    color: '#34d399',
                    lineHeight: 1,
                    marginBottom: '8px',
                  }}>
                    {s.top}
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features tab section */}
        <HomeFeaturesTab />

        {/* Feature highlight A — Money Hub */}
        <section style={{ background: '#ffffff', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div
              className="hp-highlight-grid hp-reveal"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center' }}
            >
              <div>
                <p style={{ color: '#34d399', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>Money Hub</p>
                <h2 style={{
                  fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
                  fontSize: 'clamp(30px, 5vw, 48px)',
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                  marginBottom: '16px',
                }}>
                  Know exactly where every pound goes
                </h2>
                <p style={{ color: '#64748b', fontSize: '17px', lineHeight: 1.65, marginBottom: '28px' }}>
                  Connect your bank and your spending sorts itself. Categories, budgets, and monthly trends — all updated in real time.
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px', listStyle: 'none', padding: 0, margin: 0 }}>
                  {['Spending categorised automatically', 'Monthly budget tracking with alerts', 'Instant alerts when you go over'].map(b => (
                    <li key={b} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#334155', fontSize: '15px', marginBottom: '12px' }}>
                      {mintCheck}{b}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f59e0b', color: '#0f172a', fontWeight: 700, fontSize: '15px', padding: '12px 28px', borderRadius: '9999px', textDecoration: 'none' }}>
                  Try it free
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7H12M8 3L12 7L8 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </Link>
              </div>
              <div style={{ background: '#1e2330', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.12)', minHeight: '300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Money Hub — April 2026</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { cat: 'Housing', amount: '£950', pct: 85, color: '#818cf8' },
                    { cat: 'Food & Drink', amount: '£420', pct: 60, color: '#f59e0b' },
                    { cat: 'Transport', amount: '£180', pct: 35, color: '#34d399' },
                    { cat: 'Subscriptions', amount: '£104', pct: 20, color: '#f87171' },
                  ].map(c => (
                    <div key={c.cat} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>{c.cat}</span>
                        <span style={{ color: '#fff', fontWeight: 700, fontSize: '13px' }}>{c.amount}</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '9999px', height: '4px' }}>
                        <div style={{ background: c.color, width: `${c.pct}%`, height: '4px', borderRadius: '9999px' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: '10px', padding: '12px', marginTop: 'auto' }}>
                  <p style={{ color: '#34d399', fontSize: '13px', fontWeight: 600 }}>You are on track to save £1,330 this month</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature highlight B — Subscription Scanner (reversed) */}
        <section style={{ background: '#f8fafc', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div
              className="hp-highlight-grid hp-reveal"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center' }}
            >
              <div style={{ background: '#1e2330', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.12)', minHeight: '300px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Subscription Scanner</p>
                {[
                  { name: 'Netflix', cost: '£15.99/mo', status: 'Active', sc: '#34d399' },
                  { name: 'Spotify Premium', cost: '£10.99/mo', status: 'Active', sc: '#34d399' },
                  { name: 'Sky Sports', cost: '£25.00/mo', status: 'Unused — cancel?', sc: '#f87171' },
                  { name: 'Gym', cost: '£45.00/mo', status: 'Unused — cancel?', sc: '#f87171' },
                  { name: 'Adobe CC', cost: '£54.99/mo', status: 'Renews 3 May', sc: '#f59e0b' },
                ].map(s => (
                  <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px 12px' }}>
                    <div>
                      <p style={{ color: '#fff', fontSize: '13px', fontWeight: 500 }}>{s.name}</p>
                      <p style={{ color: s.sc, fontSize: '11px' }}>{s.status}</p>
                    </div>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontFamily: 'monospace' }}>{s.cost}</span>
                  </div>
                ))}
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', padding: '10px 12px', marginTop: 'auto' }}>
                  <p style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 600 }}>Total: £151.97/mo — £1,823.64/yr</p>
                </div>
              </div>
              <div>
                <p style={{ color: '#f59e0b', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>Subscription Scanner</p>
                <h2 style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif', fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '16px' }}>
                  Cancel the subscriptions bleeding you dry
                </h2>
                <p style={{ color: '#64748b', fontSize: '17px', lineHeight: 1.65, marginBottom: '28px' }}>
                  The average UK household wastes £624 a year on subscriptions they forgot about. Paybacker finds every single one — even the ones hiding in your email.
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px', listStyle: 'none', padding: 0, margin: 0 }}>
                  {['Auto-detects subscriptions from bank and email', 'Flags unused or suspicious recurring charges', 'AI drafts cancellation emails citing UK law'].map(b => (
                    <li key={b} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#334155', fontSize: '15px', marginBottom: '12px' }}>
                      {mintCheck}{b}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f59e0b', color: '#0f172a', fontWeight: 700, fontSize: '15px', padding: '12px 28px', borderRadius: '9999px', textDecoration: 'none' }}>
                  Find my subscriptions
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7H12M8 3L12 7L8 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Feature highlight C — Dispute Manager */}
        <section style={{ background: '#ffffff', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div
              className="hp-highlight-grid hp-reveal"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center' }}
            >
              <div>
                <p style={{ color: '#818cf8', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>Dispute Manager</p>
                <h2 style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif', fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '16px' }}>
                  Fight unfair charges.{' '}
                  <span style={{ color: '#818cf8' }}>We&apos;ll draft the letter.</span>
                </h2>
                <p style={{ color: '#64748b', fontSize: '17px', lineHeight: 1.65, marginBottom: '16px' }}>
                  UK law is on your side. The Consumer Rights Act 2015, Ofgem billing rules, UK261 for flight delays — the tools to fight back exist.
                </p>
                <p style={{ color: '#64748b', fontSize: '17px', lineHeight: 1.65, marginBottom: '28px' }}>
                  Paybacker generates a professional, legally-referenced complaint letter in 30 seconds. Energy, broadband, parking, flights, debt, HMRC — all covered.
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px', listStyle: 'none', padding: 0, margin: 0 }}>
                  {['Cites Consumer Rights Act 2015, UK261, Ofcom, Ofgem', 'Covers 10+ dispute categories', '3 letters free per month — unlimited on Essential+'].map(b => (
                    <li key={b} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#334155', fontSize: '15px', marginBottom: '12px' }}>
                      {mintCheck}{b}
                    </li>
                  ))}
                </ul>
                <Link href="/auth/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#f59e0b', color: '#0f172a', fontWeight: 700, fontSize: '15px', padding: '12px 28px', borderRadius: '9999px', textDecoration: 'none' }}>
                  Generate a free letter
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7H12M8 3L12 7L8 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </Link>
              </div>
              <div style={{ background: '#1e2330', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.06)', padding: '24px', boxShadow: '0 20px 50px rgba(0,0,0,0.12)' }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(248,113,113,0.6)' }} />
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(251,191,36,0.6)' }} />
                  <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(74,222,128,0.6)' }} />
                </div>
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginBottom: '3px' }}>Category</p>
                  <p style={{ color: '#fff', fontSize: '13px' }}>Energy Bill Dispute — British Gas</p>
                </div>
                <div style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.15)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <p style={{ color: '#818cf8', fontSize: '11px', fontWeight: 600 }}>AI Letter — Ready to send</p>
                    <span style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px' }}>8s</span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', lineHeight: 1.6 }}>Dear British Gas Customer Services,</p>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px', lineHeight: 1.6, marginTop: '6px' }}>
                    I write formally to dispute my energy bill dated 12 March 2026. The 34% increase applied without written notice violates Ofgem Standard Licence Condition 23 and my rights under the Consumer Rights Act 2015, Section 50...
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px', marginTop: '10px' }}>[Sign up to see the full letter]</p>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '14px' }}>
                  {['Energy', 'Broadband', 'Flights', 'Parking', 'Debt', 'HMRC'].map(cat => (
                    <span key={cat} style={{ background: 'rgba(129,140,248,0.1)', color: '#818cf8', fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '99px', border: '1px solid rgba(129,140,248,0.2)' }}>{cat}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust block */}
        <section id="trust" style={{ background: '#111318', padding: 'clamp(64px, 8vw, 96px) 24px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: '48px' }} className="hp-reveal">
              <p style={{ color: '#34d399', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>Security</p>
              <h2 style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif', fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                Built for UK consumers
              </h2>
            </div>
            <div
              className="hp-trust-grid hp-reveal"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}
            >
              {[
                { icon: '🛡️', title: 'Open Banking via TrueLayer', desc: 'FCA-regulated, read-only access. We never see your login credentials.' },
                { icon: '📋', title: 'GDPR Compliant', desc: 'ICO registered. Your data is yours — delete it any time.' },
                { icon: '🏦', title: '14 UK Banks Supported', desc: 'Barclays, HSBC, Lloyds, Monzo, Starling and more.' },
                { icon: '🤖', title: 'AI-Powered, Human Reviewed', desc: 'Letters are AI-generated and reviewed for accuracy before delivery.' },
              ].map((card, i) => (
                <div key={card.title} className={`hp-delay-${i + 1}`} style={{ background: '#1e2330', borderRadius: '20px', padding: '28px', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '28px', marginBottom: '14px' }}>{card.icon}</div>
                  <p style={{ color: '#ffffff', fontWeight: 700, fontSize: '15px', marginBottom: '6px' }}>{card.title}</p>
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', lineHeight: 1.5 }}>{card.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <HomeTestimonials />

        {/* FAQ */}
        <HomeFAQ />

        {/* CTA Banner */}
        <section id="cta" style={{ background: '#111318', padding: 'clamp(64px, 8vw, 96px) 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto' }} className="hp-reveal">
            <h2 style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '32px' }}>
              Stop losing money to forgotten subscriptions.
            </h2>
            <Link href="/auth/signup" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', background: '#f59e0b', color: '#0f172a', fontWeight: 700, fontSize: '17px', padding: '16px 40px', borderRadius: '9999px', textDecoration: 'none', marginBottom: '20px' }}>
              Get started — it&apos;s free
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </Link>
            <p style={{ color: '#475569', fontSize: '14px', marginTop: '16px' }}>
              No credit card &nbsp;·&nbsp; Cancel anytime &nbsp;·&nbsp; UK banks only
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer style={{ background: '#0f172a', padding: '72px 24px 32px' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div className="hp-footer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '40px', marginBottom: '56px' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif', fontWeight: 800, fontSize: '20px', color: '#ffffff', marginBottom: '12px', letterSpacing: '-0.5px' }}>Paybacker</p>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', lineHeight: 1.6 }}>AI-powered savings platform for UK consumers. Stop overpaying on bills, subscriptions, and more.</p>
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Product</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[{ label: 'Features', href: '/#features' }, { label: 'Pricing', href: '/pricing' }, { label: 'Deals', href: '/deals' }, { label: 'Sign up free', href: '/auth/signup' }].map(({ label, href }) => (
                    <li key={label}><Link href={href} style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', textDecoration: 'none' }}>{label}</Link></li>
                  ))}
                </ul>
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Legal</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[{ label: 'Privacy Policy', href: '/privacy-policy' }, { label: 'Terms of Service', href: '/terms-of-service' }, { label: 'Blog', href: '/blog' }, { label: 'About', href: '/about' }].map(({ label, href }) => (
                    <li key={label}><Link href={href} style={{ color: 'rgba(255,255,255,0.45)', fontSize: '14px', textDecoration: 'none' }}>{label}</Link></li>
                  ))}
                </ul>
              </div>
              <div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>Connect</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[{ label: 'hello@paybacker.co.uk', href: 'mailto:hello@paybacker.co.uk' }, { label: 'support@paybacker.co.uk', href: 'mailto:support@paybacker.co.uk' }].map(({ label, href }) => (
                    <li key={label}><a href={href} style={{ color: 'rgba(255,255,255,0.45)', fontSize: '13px', textDecoration: 'none' }}>{label}</a></li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>&copy; 2026 Paybacker Ltd &nbsp;·&nbsp; FCA regulated via TrueLayer</p>
              <div style={{ display: 'flex', gap: '16px', color: 'rgba(255,255,255,0.25)', fontSize: '12px' }}>
                <span>🇬🇧 Made in the UK</span>
                <span>🛡️ ICO Registered</span>
                <span>🔒 GDPR Compliant</span>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
