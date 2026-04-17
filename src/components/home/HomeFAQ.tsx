'use client';

import { useState } from 'react';

const FAQS = [
  {
    q: 'Is Paybacker free?',
    a: 'Yes. The free plan gives you 3 AI complaint letters per month, manual subscription tracking, one-time bank and email scans, and access to Pocket Agent — all with no credit card required. Paid plans (Essential £4.99/mo, Pro £9.99/mo) unlock unlimited letters, daily bank sync, and full spending intelligence.',
  },
  {
    q: 'Which UK banks are supported?',
    a: 'We currently support 14 UK banks via Open Banking, including Barclays, HSBC, Lloyds, Natwest, Santander, Monzo, Starling, Halifax, TSB, First Direct, Co-op Bank, Metro Bank, Virgin Money, and Nationwide. We\'re adding more regularly.',
  },
  {
    q: 'Is my financial data safe?',
    a: 'Absolutely. We connect to your bank using TrueLayer, a regulated Open Banking provider, which means we only ever have read-only access to your transaction data. We never see your login credentials, and your data is encrypted at rest and in transit with 256-bit AES encryption. We are GDPR compliant and ICO registered.',
  },
  {
    q: 'What is Open Banking?',
    a: 'Open Banking is a UK regulation that lets you securely share read-only access to your bank transactions with authorised providers like Paybacker. Your bank still handles all your money — we can only read your transaction history. It\'s the same technology used by major financial apps like Monzo and Revolut.',
  },
  {
    q: 'Can I cancel subscriptions through Paybacker?',
    a: 'Yes. On Essential and Pro plans, we generate AI-drafted cancellation emails that cite the relevant UK consumer law for any subscription or contract. Automated cancellations (handled directly by Paybacker on your behalf) are coming soon.',
  },
  {
    q: 'Do you store my bank login details?',
    a: 'Never. We use Open Banking, which means you authenticate directly with your bank — Paybacker never sees, stores, or processes your bank username or password. The connection is established securely through TrueLayer, an FCA-regulated provider.',
  },
];

export default function HomeFAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      style={{
        background: '#ffffff',
        padding: 'clamp(64px, 8vw, 96px) 24px',
      }}
    >
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <p style={{ color: '#34d399', fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
            FAQs
          </p>
          <h2 style={{
            fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
            fontSize: 'clamp(28px, 5vw, 40px)',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.03em',
          }}>
            Have questions?
          </h2>
        </div>

        {/* Accordion items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {FAQS.map((faq, i) => {
            const isOpen = open === i;
            return (
              <div
                key={i}
                style={{
                  borderTop: '1px solid #e2e8f0',
                  ...(i === FAQS.length - 1 ? { borderBottom: '1px solid #e2e8f0' } : {}),
                }}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '20px 0',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    gap: '16px',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif',
                    fontWeight: 600,
                    fontSize: '16px',
                    color: '#0f172a',
                    lineHeight: 1.4,
                  }}>
                    {faq.q}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      flexShrink: 0,
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: isOpen ? '#34d399' : '#f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: 700,
                      color: isOpen ? '#0f172a' : '#64748b',
                      transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                      transition: 'background 0.2s, transform 0.2s',
                    } as React.CSSProperties}
                  >
                    +
                  </span>
                </button>

                {isOpen && (
                  <div style={{ paddingBottom: '20px' }}>
                    <p style={{ color: '#64748b', fontSize: '15px', lineHeight: 1.7 }}>
                      {faq.a}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
