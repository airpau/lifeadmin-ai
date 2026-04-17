'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const SCREENS = [
  {
    label: 'Money Hub',
    color: '#34d399',
    content: (
      <div style={{ padding: '24px' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Money Hub</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
          {[
            { label: 'Income', value: '£3,450', color: '#34d399' },
            { label: 'Outgoings', value: '£2,120', color: '#f87171' },
            { label: 'Savings', value: '£1,330', color: '#34d399' },
            { label: 'Savings rate', value: '38.5%', color: '#f59e0b' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '10px', marginBottom: '3px' }}>{s.label}</p>
              <p style={{ color: s.color, fontWeight: 700, fontSize: '16px' }}>{s.value}</p>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(52,211,153,0.1)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(52,211,153,0.2)' }}>
          <p style={{ color: '#34d399', fontSize: '12px', fontWeight: 600 }}>You are saving 38% of income this month</p>
        </div>
      </div>
    ),
  },
  {
    label: 'Subscriptions',
    color: '#f59e0b',
    content: (
      <div style={{ padding: '24px' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Subscription Scanner</p>
        {[
          { name: 'Netflix', cost: '£15.99/mo', badge: 'Active', badgeColor: '#34d399' },
          { name: 'Spotify', cost: '£10.99/mo', badge: 'Active', badgeColor: '#34d399' },
          { name: 'Sky Broadband', cost: '£32.00/mo', badge: 'Renews 14d', badgeColor: '#f59e0b' },
          { name: 'Gym', cost: '£45.00/mo', badge: 'Cancel?', badgeColor: '#f87171' },
        ].map(s => (
          <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: '#fff', fontSize: '13px' }}>{s.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{s.cost}</span>
              <span style={{ color: s.badgeColor, fontSize: '10px', fontWeight: 600 }}>{s.badge}</span>
            </div>
          </div>
        ))}
        <p style={{ color: '#34d399', fontSize: '12px', fontWeight: 700, marginTop: '10px' }}>Total: £103.98/mo</p>
      </div>
    ),
  },
  {
    label: 'Disputes',
    color: '#818cf8',
    content: (
      <div style={{ padding: '24px' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dispute Manager</p>
        <div style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '8px', padding: '12px', marginBottom: '10px' }}>
          <p style={{ color: '#818cf8', fontSize: '11px', fontWeight: 600, marginBottom: '4px' }}>AI Letter Generated</p>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '11px', lineHeight: 1.5 }}>Dear Sir/Madam, I am writing to formally dispute my energy bill under the Consumer Rights Act 2015...</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['Energy', 'Broadband', 'Flights', 'Parking'].map(t => (
            <span key={t} style={{ background: 'rgba(129,140,248,0.1)', color: '#818cf8', borderRadius: '99px', padding: '3px 8px', fontSize: '10px', fontWeight: 600 }}>{t}</span>
          ))}
        </div>
      </div>
    ),
  },
  {
    label: 'Insights',
    color: '#f59e0b',
    content: (
      <div style={{ padding: '24px' }}>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AI Insights</p>
        {[
          { icon: '⚡', text: 'Virgin Media raised your bill by £8 — draft dispute?', color: '#f87171' },
          { icon: '🔔', text: 'Energy contract ends in 14 days — compare deals?', color: '#f59e0b' },
          { icon: '✅', text: 'You saved £147 this month vs last month', color: '#34d399' },
        ].map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <span style={{ fontSize: '14px' }}>{item.icon}</span>
            <p style={{ color: item.color, fontSize: '12px', lineHeight: 1.4 }}>{item.text}</p>
          </div>
        ))}
      </div>
    ),
  },
];

export default function HomeHero() {
  const [activeScreen, setActiveScreen] = useState(0);
  const triggerRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const observers: IntersectionObserver[] = [];

    triggerRefs.current.forEach((el, i) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveScreen(i);
        },
        { threshold: 0.5 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach(o => o.disconnect());
  }, []);

  return (
    <>
      {/* Hero — 100svh above-the-fold */}
      <section
        id="hero"
        style={{
          height: '100svh',
          background: '#111318',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Radial glow */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(52,211,153,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div style={{ maxWidth: '720px', position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(52,211,153,0.1)',
            border: '1px solid rgba(52,211,153,0.2)',
            borderRadius: '9999px',
            padding: '6px 16px',
            marginBottom: '32px',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 1L8.5 5H13L9.5 7.5L11 11L7 8.5L3 11L4.5 7.5L1 5H5.5L7 1Z" fill="#34d399" />
            </svg>
            <span style={{ color: '#34d399', fontSize: '13px', fontWeight: 600 }}>No credit card required</span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
            fontSize: 'clamp(40px, 8vw, 72px)',
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: '-0.03em',
            color: '#ffffff',
            marginBottom: '24px',
          }}>
            Stop overpaying.{' '}
            <br />
            Start{' '}
            <span style={{ color: '#34d399' }}>saving.</span>
          </h1>

          {/* Subheadline */}
          <p style={{
            fontSize: '18px',
            lineHeight: 1.6,
            color: '#94a3b8',
            maxWidth: '560px',
            margin: '0 auto 40px',
          }}>
            Paybacker connects to your UK bank accounts, spots wasteful spending, and helps you fight back against unfair charges.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center', marginBottom: '32px' }}>
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
                transition: 'background-color 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
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
                transition: 'border-color 0.2s, color 0.2s',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(52,211,153,0.4)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; }}
            >
              See how it works
              <span aria-hidden="true">↓</span>
            </a>
          </div>

          {/* Trust row */}
          <p style={{ color: '#475569', fontSize: '13px', letterSpacing: '0.01em' }}>
            🔒 TrueLayer regulated &nbsp;·&nbsp; 256-bit encryption &nbsp;·&nbsp; No credit card required
          </p>
        </div>
      </section>

      {/* Scroll-pinned mockup section */}
      <section
        style={{
          position: 'relative',
          height: '400vh',
          background: '#111318',
        }}
      >
        {/* Sticky container */}
        <div style={{
          position: 'sticky',
          top: '15vh',
          height: '70vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '48px',
          padding: '0 24px',
          maxWidth: '1000px',
          margin: '0 auto',
        }}>
          {/* Tab labels */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            flexShrink: 0,
          }} className="hp-scroll-tabs">
            {SCREENS.map((s, i) => (
              <button
                key={s.label}
                onClick={() => setActiveScreen(i)}
                style={{
                  background: i === activeScreen ? '#fff' : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${i === activeScreen ? s.color : 'rgba(255,255,255,0.1)'}`,
                  color: i === activeScreen ? '#0f172a' : 'rgba(255,255,255,0.4)',
                  fontWeight: i === activeScreen ? 700 : 500,
                  fontSize: '14px',
                  padding: '10px 16px',
                  borderRadius: '0 8px 8px 0',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.3s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Mockup frame */}
          <div style={{
            flex: 1,
            maxWidth: '420px',
            background: '#1e2330',
            borderRadius: '20px',
            border: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          }}>
            {/* Browser chrome */}
            <div style={{
              background: '#16202e',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(248,113,113,0.6)' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(251,191,36,0.6)' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'rgba(74,222,128,0.6)' }} />
              <div style={{
                flex: 1,
                marginLeft: '8px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '4px',
                padding: '3px 10px',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '11px',
              }}>
                app.paybacker.co.uk
              </div>
            </div>

            {/* Screen content — transitions on change */}
            <div
              key={activeScreen}
              style={{
                minHeight: '280px',
                opacity: 1,
                transition: 'opacity 0.4s ease',
                animation: 'hp-fade-in 0.4s ease',
              }}
            >
              {SCREENS[activeScreen].content}
            </div>

            {/* Screen indicator dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '12px' }}>
              {SCREENS.map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === activeScreen ? '18px' : '6px',
                    height: '6px',
                    borderRadius: '9999px',
                    background: i === activeScreen ? SCREENS[i].color : 'rgba(255,255,255,0.2)',
                    transition: 'all 0.3s ease',
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* IntersectionObserver trigger divs */}
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            ref={el => { triggerRefs.current[i] = el; }}
            style={{
              position: 'absolute',
              top: `${i * 100}vh`,
              left: 0,
              right: 0,
              height: '100vh',
              pointerEvents: 'none',
            }}
          />
        ))}
      </section>
    </>
  );
}
