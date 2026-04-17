'use client';

import Link from 'next/link';

/* -----------------------------------------------------------------------
 * Static dashboard mockup — shown alongside headline on desktop
 * ----------------------------------------------------------------------- */
function DashboardMockup() {
  return (
    <div style={{
      background: '#1e2330',
      borderRadius: '20px',
      border: '1px solid rgba(255,255,255,0.1)',
      overflow: 'hidden',
      boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
      width: '100%',
      maxWidth: '440px',
      maxHeight: 'calc(100svh - 80px)',
    }}>
      {/* Browser chrome */}
      <div style={{
        background: '#16202e',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(248,113,113,0.55)' }} />
        <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(251,191,36,0.55)' }} />
        <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(74,222,128,0.55)' }} />
        <div style={{ flex: 1, marginLeft: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '3px 10px', color: 'rgba(255,255,255,0.25)', fontSize: '11px' }}>
          app.paybacker.co.uk
        </div>
      </div>

      {/* Mint accent stripe */}
      <div style={{ height: '3px', background: 'linear-gradient(90deg, #34d399 0%, rgba(52,211,153,0.2) 100%)' }} />

      <div style={{ padding: '18px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: '14px' }}>Money Hub</p>
          <span style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '99px', border: '1px solid rgba(52,211,153,0.2)' }}>
            Live sync
          </span>
        </div>

        {/* Stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
          {[
            { label: 'Income', value: '£3,450', color: '#34d399' },
            { label: 'Outgoings', value: '£2,120', color: '#f87171' },
            { label: 'Net savings', value: '£1,330', color: '#34d399' },
            { label: 'Savings rate', value: '38.5%', color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '10px 12px' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '10px', marginBottom: '3px' }}>{s.label}</p>
              <p style={{ color: s.color, fontWeight: 700, fontSize: '15px' }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Action rows */}
        {[
          { icon: '⚡', text: 'British Gas bill up £12 — dispute?', badge: 'Action', badgeColor: '#f87171' },
          { icon: '🔔', text: 'Sky contract ends in 14 days', badge: 'Renewing', badgeColor: '#f59e0b' },
          { icon: '✅', text: 'Saved £147 vs last month', badge: 'Insight', badgeColor: '#34d399' },
        ].map((row, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 0',
              borderTop: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ fontSize: '14px', flexShrink: 0 }}>{row.icon}</span>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', flex: 1 }}>{row.text}</p>
            <span style={{
              color: row.badgeColor,
              fontSize: '10px',
              fontWeight: 600,
              background: `${row.badgeColor}18`,
              padding: '2px 7px',
              borderRadius: '99px',
              flexShrink: 0,
            }}>
              {row.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------
 * Hero — 100svh, two-column on desktop, text-only on mobile
 * ----------------------------------------------------------------------- */
export default function HomeHero() {
  return (
    <>
      {/* Scoped responsive rules for the hero layout */}
      <style dangerouslySetInnerHTML={{ __html: `
        [data-homepage="true"] .hp-hero-inner {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 56px;
          width: 100%;
          max-width: 1100px;
          max-height: 100%;
          padding: 0 48px;
          overflow: hidden;
        }
        [data-homepage="true"] .hp-hero-text {
          flex: 1;
          text-align: left;
        }
        [data-homepage="true"] .hp-hero-ctas {
          justify-content: flex-start;
        }
        [data-homepage="true"] .hp-hero-trust {
          text-align: left;
        }
        [data-homepage="true"] .hp-hero-mockup {
          flex: 0 0 auto;
          display: flex;
          justify-content: flex-end;
          align-self: center;
          max-height: calc(100svh - 80px);
          overflow: hidden;
        }
        @media (max-width: 900px) {
          [data-homepage="true"] .hp-hero-inner {
            flex-direction: column;
            text-align: center;
            padding: 0 24px;
          }
          [data-homepage="true"] .hp-hero-text {
            text-align: center;
          }
          [data-homepage="true"] .hp-hero-ctas {
            justify-content: center;
          }
          [data-homepage="true"] .hp-hero-trust {
            text-align: center;
          }
          [data-homepage="true"] .hp-hero-mockup {
            display: none;
          }
        }
      ` }} />

      <section
        id="hero"
        style={{
          height: '100svh',
          background: '#111318',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Centered radial glow — gives depth, visually distinct from old flat navy */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(52,211,153,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="hp-hero-inner">
          {/* ── Left: text ── */}
          <div className="hp-hero-text">
            {/* Badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(52,211,153,0.1)',
              border: '1px solid rgba(52,211,153,0.2)',
              borderRadius: '9999px',
              padding: '6px 16px',
              marginBottom: '28px',
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <circle cx="6" cy="6" r="3" fill="#34d399" />
                <circle cx="6" cy="6" r="5" fill="none" stroke="#34d399" strokeWidth="1" opacity="0.4" />
              </svg>
              <span style={{ color: '#34d399', fontSize: '13px', fontWeight: 600 }}>No credit card required</span>
            </div>

            {/* Headline */}
            <h1 style={{
              fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
              fontSize: 'clamp(36px, 5vw, 64px)',
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: '-0.03em',
              color: '#ffffff',
              marginBottom: '20px',
            }}>
              Stop overpaying.
              <br />
              Start{' '}
              <span style={{ color: '#34d399' }}>saving.</span>
            </h1>

            {/* Subheadline */}
            <p style={{
              fontSize: '18px',
              lineHeight: 1.6,
              color: '#94a3b8',
              maxWidth: '480px',
              marginBottom: '36px',
            }}>
              Paybacker connects to your UK bank accounts, spots wasteful spending, and helps you fight back against unfair charges.
            </p>

            {/* CTAs */}
            <div
              className="hp-hero-ctas"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}
            >
              <Link
                href="/auth/signup"
                style={{
                  background: '#f59e0b',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: '16px',
                  padding: '14px 32px',
                  borderRadius: '9999px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#d97706')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#f59e0b')}
              >
                Get started free
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 8H13M9 4L13 8L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <a
                href="#features"
                style={{
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'rgba(255,255,255,0.8)',
                  fontWeight: 600,
                  fontSize: '16px',
                  padding: '14px 32px',
                  borderRadius: '9999px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'border-color 0.2s, color 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(52,211,153,0.4)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
              >
                See how it works ↓
              </a>
            </div>

            {/* Trust row */}
            <p className="hp-hero-trust" style={{ color: '#475569', fontSize: '13px' }}>
              🔒 TrueLayer regulated &nbsp;·&nbsp; 256-bit encryption &nbsp;·&nbsp; No credit card required
            </p>
          </div>

          {/* ── Right: static dashboard mockup ── */}
          <div className="hp-hero-mockup">
            <DashboardMockup />
          </div>
        </div>
      </section>
    </>
  );
}
