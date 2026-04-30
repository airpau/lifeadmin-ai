'use client';

import Link from 'next/link';
import { TrendingDown, ArrowRight, ExternalLink } from 'lucide-react';
import { formatGBP } from '@/lib/format';
import { isDealValid } from '@/lib/savings-utils';

interface DealComparison {
  subscriptionName: string;
  currentPrice: number;
  dealProvider: string;
  dealPrice: number;
  annualSaving: number;
  dealUrl: string;
  category: string;
}

interface SavingsOpportunityWidgetProps {
  totalSaving: number;
  count: number;
  deals?: DealComparison[];
}

export default function SavingsOpportunityWidget({ totalSaving, count, deals }: SavingsOpportunityWidgetProps) {
  if (totalSaving <= 0 || count <= 0) return null;

  // Filter out excluded categories, null categories, and unrealistic savings (>80%)
  const filteredDeals = (deals || []).filter(isDealValid);

  const filteredTotal = filteredDeals.reduce((sum, d) => sum + d.annualSaving, 0);
  const filteredCount = filteredDeals.length;
  if (filteredTotal <= 0 || filteredCount <= 0) return null;

  const topDeals = filteredDeals.sort((a, b) => b.annualSaving - a.annualSaving).slice(0, 3);

  return (
    <div
      className="card"
      style={{
        background: 'linear-gradient(135deg, var(--mint-wash) 0%, #fff 100%)',
        borderColor: '#BBF7D0',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 44,
            height: 44,
            background: 'var(--mint-wash)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--mint-deep)',
            flexShrink: 0,
          }}
        >
          <TrendingDown className="h-5 w-5" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: 'var(--mint-deep)',
              fontWeight: 700,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}
          >
            Better deals found
          </p>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 24,
              fontWeight: 800,
              color: 'var(--text)',
              letterSpacing: '-.02em',
              lineHeight: 1.1,
            }}
          >
            Save {formatGBP(filteredTotal)}
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-3)' }}>/year</span>
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--text-2)' }}>
            {filteredCount} subscription{filteredCount !== 1 ? 's' : ''} with cheaper alternatives
          </p>
        </div>
      </div>

      {topDeals.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {topDeals.map((deal, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#fff',
                border: '1px solid var(--divider)',
                borderRadius: 10,
                padding: '10px 14px',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                  {deal.subscriptionName}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-3)' }}>
                  {formatGBP(deal.currentPrice)}/mo →{' '}
                  <span style={{ color: 'var(--mint-deep)', fontWeight: 600 }}>
                    {formatGBP(deal.dealPrice)}/mo
                  </span>{' '}
                  with {deal.dealProvider}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: 'var(--mint-deep)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Save {formatGBP(deal.annualSaving)}/yr
                </span>
                <a
                  href={deal.dealUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'var(--mint-wash)',
                    color: 'var(--mint-deep)',
                    padding: 7,
                    borderRadius: 8,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textDecoration: 'none',
                  }}
                  title={`Switch to ${deal.dealProvider}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/dashboard/subscriptions"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--mint-deep)',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        View all comparisons <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
