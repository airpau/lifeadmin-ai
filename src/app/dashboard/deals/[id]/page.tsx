'use client';
// src/app/dashboard/deals/[id]/page.tsx
// Deal Detail (batch7 DealDetail) — ported onto the affiliate_deals row shape
// from /api/deals. Shows a single-deal hero + comparison strip + right rail.

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ExternalLink, Loader2 } from 'lucide-react';

interface Deal {
  id: string;
  provider: string;
  category: string;
  plan_name: string;
  price_monthly: number;
  price_promotional: number | null;
  promotional_period: string | null;
  contract_length: string | null;
  setup_fee: number | null;
  affiliate_url: string | null;
  last_verified_at: string | null;
  is_active: boolean;
  promo_code: string | null;
  promo_code_discount: string | null;
  speed_mbps: number | null;
  data_allowance: string | null;
  highlights?: string[] | null;
  description?: string | null;
}

const CATEGORY_TONE: Record<string, { bg: string; eyebrow: string; tone: 'amber' | 'mint' | 'blue' | 'rose' }> = {
  energy: { bg: 'linear-gradient(135deg,#FEF3C7,#FCD34D)', eyebrow: '#78350F', tone: 'amber' },
  broadband: { bg: 'linear-gradient(135deg,#DBEAFE,#BFDBFE)', eyebrow: '#1E40AF', tone: 'blue' },
  mobile: { bg: 'linear-gradient(135deg,#FCE7F3,#FBCFE8)', eyebrow: '#BE185D', tone: 'rose' },
  insurance: { bg: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', eyebrow: '#065F46', tone: 'mint' },
  banking: { bg: 'linear-gradient(135deg,#DCFCE7,#BBF7D0)', eyebrow: '#065F46', tone: 'mint' },
  streaming: { bg: 'linear-gradient(135deg,#E9D5FF,#D8B4FE)', eyebrow: '#6D28D9', tone: 'blue' },
};

function freshnessBadge(lastVerified: string | null) {
  if (!lastVerified) return { text: 'Verification pending', tone: 'amber' as const };
  const days = Math.floor((Date.now() - new Date(lastVerified).getTime()) / 86_400_000);
  if (days <= 7) return { text: 'Verified this week', tone: 'mint' as const };
  if (days <= 30) return { text: `Verified ${days}d ago`, tone: 'mint' as const };
  return { text: 'Prices may have changed', tone: 'amber' as const };
}

export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/deals');
        const data = await res.json();
        const match = (data.deals as Deal[] | undefined)?.find((d) => d.id === id);
        if (!match) {
          setNotFound(true);
        } else {
          setDeal(match);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: 'var(--text-3)' }} />
      </div>
    );
  }

  if (notFound || !deal) {
    return (
      <div className="max-w-2xl">
        <Link href="/dashboard/deals" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', textDecoration: 'none', marginBottom: 14, fontSize: 13 }}>
          <ChevronLeft style={{ width: 14, height: 14 }} /> Back to Deals
        </Link>
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Deal not found</h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13.5, margin: 0 }}>
            This deal may have been withdrawn. Head back to deals for everything live this week.
          </p>
        </div>
      </div>
    );
  }

  const effectivePrice = deal.price_promotional ?? deal.price_monthly;
  const tone = CATEGORY_TONE[deal.category.toLowerCase()] || CATEGORY_TONE.mobile;
  const fresh = freshnessBadge(deal.last_verified_at);
  const annualSaving = deal.price_promotional != null
    ? Math.max(0, Math.round((deal.price_monthly - deal.price_promotional) * 12))
    : 0;

  return (
    <div className="max-w-6xl">
      <Link href="/dashboard/deals" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-2)', textDecoration: 'none', marginBottom: 12, fontSize: 13 }}>
        <ChevronLeft style={{ width: 14, height: 14 }} /> Back to Deals
      </Link>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }} className="deal-grid">
        <div>
          {/* Hero */}
          <div
            style={{
              background: tone.bg,
              borderRadius: 16,
              padding: '32px 36px',
              marginBottom: 20,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                padding: '5px 10px',
                background: '#fff',
                borderRadius: 999,
                color: tone.eyebrow,
              }}
            >
              {fresh.text}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                color: tone.eyebrow,
                marginBottom: 8,
              }}
            >
              ● {deal.category}
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.02em', margin: '0 0 10px', lineHeight: 1.1 }}>
              {deal.provider} — {deal.plan_name}
            </h1>
            {deal.description && (
              <p style={{ fontSize: 15, color: tone.eyebrow, margin: 0, maxWidth: 620, lineHeight: 1.55 }}>
                {deal.description}
              </p>
            )}
          </div>

          {/* Comparison */}
          <div className="card" style={{ padding: 24, marginBottom: 20 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', margin: '0 0 14px' }}>
              What this deal costs
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }} className="compare-row">
              <div
                style={{
                  padding: '16px 18px',
                  background: 'var(--mint-wash)',
                  borderRadius: 12,
                  border: '1px solid #BBF7D0',
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3)',
                    marginBottom: 6,
                  }}
                >
                  Monthly
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.015em', color: 'var(--mint-deep)' }}>
                  £{effectivePrice.toFixed(2)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {deal.price_promotional != null
                    ? `${deal.promotional_period || 'intro'} then £${deal.price_monthly.toFixed(2)}/mo`
                    : 'rolling price'}
                </div>
              </div>
              <div
                style={{
                  padding: '16px 18px',
                  background: '#FEF3C7',
                  borderRadius: 12,
                  border: '1px solid #FCD34D',
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3)',
                    marginBottom: 6,
                  }}
                >
                  Annual cost
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.015em', color: '#B45309' }}>
                  £{(effectivePrice * 12).toFixed(0)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  excl. setup {deal.setup_fee ? `· £${deal.setup_fee} fee` : '· no setup fee'}
                </div>
              </div>
              <div
                style={{
                  padding: '16px 18px',
                  background: '#F9FAFB',
                  borderRadius: 12,
                  border: '1px solid var(--divider)',
                }}
              >
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-3)',
                    marginBottom: 6,
                  }}
                >
                  Contract
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                  {deal.contract_length || 'Rolling'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                  {deal.contract_length && /no exit|rolling/i.test(deal.contract_length)
                    ? 'leave any time'
                    : 'exit fees may apply'}
                </div>
              </div>
            </div>

            {(deal.speed_mbps || deal.data_allowance) && (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: '1px solid var(--divider)',
                  display: 'flex',
                  gap: 20,
                  flexWrap: 'wrap',
                  fontSize: 13,
                  color: 'var(--text-2)',
                }}
              >
                {deal.speed_mbps && (
                  <div>
                    <strong style={{ color: 'var(--text)' }}>{deal.speed_mbps}Mbps</strong> download
                  </div>
                )}
                {deal.data_allowance && (
                  <div>
                    <strong style={{ color: 'var(--text)' }}>{deal.data_allowance}</strong> data
                  </div>
                )}
              </div>
            )}

            {deal.highlights && deal.highlights.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '18px 0 10px' }}>What's included</h3>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.75, color: 'var(--text-2)' }}>
                  {deal.highlights.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* Fine print */}
          <div
            style={{
              background: '#F9FAFB',
              border: '1px solid var(--divider)',
              borderRadius: 14,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
                color: 'var(--text-3)',
                marginBottom: 8,
              }}
            >
              Fine print
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
              Prices verified{' '}
              {deal.last_verified_at
                ? new Date(deal.last_verified_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : 'recently'}
              . Actual pricing at checkout may reflect regional variations or promotional eligibility. Paybacker may
              receive a referral fee from some switches — this never changes the price you pay and never influences
              which deals we rank first.
            </p>
          </div>
        </div>

        {/* Right rail */}
        <aside className="deal-rail">
          <div className="card" style={{ padding: 22, position: 'sticky', top: 80 }}>
            {annualSaving > 0 && (
              <>
                <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.02em', color: 'var(--mint-deep)', lineHeight: 1 }}>
                  £{annualSaving}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, marginBottom: 20 }}>
                  off in year one vs the standard rate
                </div>
              </>
            )}
            {deal.affiliate_url ? (
              <a
                href={deal.affiliate_url}
                target="_blank"
                rel="noopener noreferrer"
                className="cta"
                style={{
                  display: 'flex',
                  width: '100%',
                  padding: '14px',
                  fontSize: 14.5,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 10,
                }}
              >
                Switch with {deal.provider}
                <ExternalLink style={{ width: 14, height: 14 }} />
              </a>
            ) : (
              <button
                disabled
                className="cta"
                style={{ width: '100%', padding: '14px', fontSize: 14.5, opacity: 0.6, cursor: 'not-allowed' }}
              >
                Switch link coming soon
              </button>
            )}
            {deal.promo_code && (
              <div
                style={{
                  marginTop: 10,
                  padding: '10px 12px',
                  background: 'var(--mint-wash)',
                  border: '1px dashed var(--mint-deep)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--mint-deep)',
                  fontWeight: 600,
                  textAlign: 'center',
                }}
              >
                Use code <strong style={{ fontFamily: 'monospace' }}>{deal.promo_code}</strong>
                {deal.promo_code_discount && ` · ${deal.promo_code_discount}`}
              </div>
            )}

            <div
              style={{
                marginTop: 20,
                paddingTop: 16,
                borderTop: '1px solid var(--divider)',
                fontSize: 12,
                color: 'var(--text-3)',
                lineHeight: 1.6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Category</span>
                <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{deal.category}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>Freshness</span>
                <strong style={{ color: fresh.tone === 'mint' ? 'var(--mint-deep)' : '#B45309' }}>{fresh.text}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Setup fee</span>
                <strong style={{ color: 'var(--text)' }}>
                  {deal.setup_fee ? `£${deal.setup_fee}` : 'None'}
                </strong>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          :global(.deal-grid) { grid-template-columns: 1fr !important; }
          :global(.deal-rail .card) { position: static !important; }
          :global(.compare-row) { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
