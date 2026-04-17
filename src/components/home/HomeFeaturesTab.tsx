'use client';

import { useState } from 'react';

const TABS = [
  {
    id: 'money-hub',
    title: 'Money Hub',
    desc: 'Full picture of income, spending, and budgets in one place',
    detail: 'Connect your bank and see every pound categorised automatically. Track budgets, set goals, and understand your spending like never before.',
    color: '#34d399',
    preview: {
      title: 'Money Hub',
      items: [
        { label: 'Monthly income', value: '£3,450', color: '#34d399' },
        { label: 'Total outgoings', value: '£2,120', color: '#f87171' },
        { label: 'Net savings', value: '£1,330', color: '#34d399' },
        { label: 'Top spend: Food', value: '£420', color: '#f59e0b' },
      ],
    },
  },
  {
    id: 'subscription-scanner',
    title: 'Subscription Scanner',
    desc: 'Automatically spots subscriptions and flags ones you might want to cancel',
    detail: 'Our AI scans your bank and email to find every recurring charge — even the ones you forgot about. Then helps you cancel the ones you no longer use.',
    color: '#f59e0b',
    preview: {
      title: 'Subscription Scanner',
      items: [
        { label: 'Netflix', value: '£15.99/mo', color: '#fff' },
        { label: 'Spotify', value: '£10.99/mo', color: '#fff' },
        { label: 'Sky Sports', value: '£25.00/mo', color: '#f87171', flag: 'Cancel?' },
        { label: 'Gym (unused)', value: '£45.00/mo', color: '#f87171', flag: 'Cancel?' },
      ],
    },
  },
  {
    id: 'dispute-manager',
    title: 'Dispute Manager',
    desc: 'AI helps you write professional dispute letters in seconds',
    detail: 'Choose your issue, describe the problem, and receive a formal complaint letter citing the exact UK legislation that applies to your case. Ready to send in 30 seconds.',
    color: '#818cf8',
    preview: {
      title: 'Dispute Manager',
      items: [
        { label: 'Energy bill dispute', value: 'Letter ready', color: '#34d399' },
        { label: 'Broadband overcharge', value: 'Letter ready', color: '#34d399' },
        { label: 'Flight delay', value: 'Up to £520', color: '#f59e0b' },
        { label: 'Parking charge', value: 'Appeal drafted', color: '#34d399' },
      ],
    },
  },
];

export default function HomeFeaturesTab() {
  const [active, setActive] = useState(0);
  const tab = TABS[active];

  return (
    <section
      id="features"
      style={{
        background: '#f8fafc',
        padding: 'clamp(64px, 8vw, 96px) 24px',
      }}
    >
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: '56px' }}>
          <p style={{ color: '#34d399', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            Features
          </p>
          <h2 style={{
            fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
            fontSize: 'clamp(32px, 5vw, 48px)',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
          }}>
            Everything your bank app should do
          </h2>
        </div>

        {/* Tab layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '40px', alignItems: 'center' }} className="hp-features-grid">
          {/* Left: tabs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {TABS.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setActive(i)}
                style={{
                  textAlign: 'left',
                  background: i === active ? '#ffffff' : 'transparent',
                  border: 'none',
                  borderLeft: `3px solid ${i === active ? t.color : 'transparent'}`,
                  borderRadius: '0 12px 12px 0',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: i === active ? '0 2px 12px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                <p style={{
                  fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
                  fontWeight: 700,
                  fontSize: '16px',
                  color: i === active ? '#0f172a' : '#64748b',
                  marginBottom: '4px',
                }}>
                  {t.title}
                </p>
                <p style={{ fontSize: '14px', color: '#64748b', lineHeight: 1.4 }}>
                  {t.desc}
                </p>
              </button>
            ))}
          </div>

          {/* Right: preview */}
          <div style={{
            background: '#1e2330',
            borderRadius: '20px',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {/* Browser chrome */}
            <div style={{
              background: '#16202e',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(248,113,113,0.6)' }} />
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(251,191,36,0.6)' }} />
              <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'rgba(74,222,128,0.6)' }} />
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '11px', marginLeft: '8px' }}>paybacker.co.uk/dashboard</span>
            </div>

            {/* Content */}
            <div style={{ padding: '24px', minHeight: '240px' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: `${tab.color}18`,
                border: `1px solid ${tab.color}30`,
                borderRadius: '9999px',
                padding: '4px 12px',
                marginBottom: '16px',
              }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tab.color }} />
                <span style={{ color: tab.color, fontSize: '12px', fontWeight: 600 }}>{tab.preview.title}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tab.preview.items.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px' }}>{item.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {'flag' in item && item.flag && (
                        <span style={{ color: '#f87171', fontSize: '10px', fontWeight: 700, background: 'rgba(248,113,113,0.1)', padding: '2px 6px', borderRadius: '99px' }}>
                          {item.flag}
                        </span>
                      )}
                      <span style={{ color: item.color, fontWeight: 700, fontSize: '13px' }}>{item.value}</span>
                    </div>
                  </div>
                ))}
              </div>

              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '16px', lineHeight: 1.5 }}>
                {tab.detail}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
