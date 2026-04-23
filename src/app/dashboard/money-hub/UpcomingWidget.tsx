'use client';
// src/app/dashboard/money-hub/UpcomingWidget.tsx
//
// Emma-style upcoming-payments card for the Money Hub home. Shows:
//   1. A headline strip with net direction for the next 7 days
//   2. A "Tomorrow" highlight row when a confirmed incoming is due
//   3. Up to 4 upcoming rows in a transaction-list layout
//   4. "View full timeline" link into /dashboard/money-hub/upcoming
//
// Chosen to mirror Emma's behaviour where upcoming items sit in the
// same visual vocabulary as transactions (same row styling), not in
// a separate widget. Gives the user a single place to scan what's
// happening in the next week.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Calendar,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  UpcomingApiResponse,
  UpcomingPaymentRow,
} from '@/app/api/money-hub/upcoming/route';

function formatGBP(n: number, digits = 2): string {
  return `£${Math.abs(n).toLocaleString('en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function isTomorrow(dateIso: string): boolean {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10) === dateIso;
}

function prettyDate(iso: string): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00Z');
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const SOURCE_LABEL: Record<UpcomingPaymentRow['source'], string> = {
  pending_credit: 'Pending',
  pending_debit: 'Pending',
  scheduled_payment: 'Scheduled',
  standing_order: 'Standing order',
  direct_debit: 'Direct debit',
  predicted_recurring: 'Predicted',
};

const SOURCE_TONE: Record<
  UpcomingPaymentRow['source'],
  { bg: string; color: string; border: string }
> = {
  pending_credit: { bg: 'var(--mint-wash)', color: 'var(--mint-deep)', border: '#86EFAC' },
  pending_debit: { bg: 'var(--mint-wash)', color: 'var(--mint-deep)', border: '#86EFAC' },
  scheduled_payment: { bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
  standing_order: { bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
  direct_debit: { bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
  predicted_recurring: { bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
};

export default function UpcomingWidget() {
  const [data, setData] = useState<UpcomingApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/money-hub/upcoming?days=7')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j as UpcomingApiResponse))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  // Flatten groups into a single chronologically-ordered list for
  // the Emma-style row display. Cap at 4 items on the home widget;
  // full list lives at /dashboard/money-hub/upcoming.
  const flat: UpcomingPaymentRow[] = (data?.groups || []).flatMap((g) => g.items);
  const preview = flat.slice(0, 4);
  const moreCount = Math.max(0, flat.length - preview.length);

  const tomorrowIncoming = flat.filter(
    (i) =>
      isTomorrow(i.expected_date) &&
      i.direction === 'incoming' &&
      (i.source === 'pending_credit' || i.source === 'scheduled_payment'),
  );

  if (loading) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="k-label" style={{ marginBottom: 8 }}>
          <Calendar className="h-3.5 w-3.5" /> Next 7 days
        </div>
        <div className="k-val" style={{ color: 'var(--text-3)' }}>—</div>
      </div>
    );
  }

  if (!data || flat.length === 0) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div className="k-label" style={{ marginBottom: 8 }}>
          <Calendar className="h-3.5 w-3.5" /> Next 7 days
        </div>
        <div className="k-val" style={{ color: 'var(--text-3)', fontSize: 16 }}>
          Nothing scheduled
        </div>
        <div className="k-delta">
          Connect your bank via Open Banking to track upcoming payments.
        </div>
      </div>
    );
  }

  const net = data.totals.net;

  return (
    <div className="card" style={{ padding: 18 }}>
      {/* Header: eyebrow + headline + full-timeline link */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="k-label">
          <Calendar className="h-3.5 w-3.5" /> Next 7 days
        </div>
        <Link
          href="/dashboard/money-hub/upcoming"
          style={{
            fontSize: 12,
            color: 'var(--mint-deep)',
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          Full timeline <ArrowRight style={{ width: 12, height: 12 }} />
        </Link>
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: '-.02em',
          color: net >= 0 ? 'var(--mint-deep)' : 'var(--rose-deep)',
        }}
      >
        {net >= 0 ? '+' : ''}
        {formatGBP(net, 0)}
      </div>
      <div
        className="k-delta"
        style={{ display: 'flex', gap: 14, marginTop: 4, marginBottom: 14 }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <TrendingUp style={{ width: 12, height: 12, color: 'var(--mint-deep)' }} />
          {formatGBP(data.totals.incoming, 0)} in
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <TrendingDown style={{ width: 12, height: 12, color: 'var(--rose-deep)' }} />
          {formatGBP(data.totals.outgoing, 0)} out
        </span>
      </div>

      {tomorrowIncoming.length > 0 && (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 12px',
            background: 'var(--mint-wash)',
            border: '1px solid #86EFAC',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Sparkles
            style={{ width: 16, height: 16, color: 'var(--mint-deep)', flexShrink: 0 }}
          />
          <div style={{ fontSize: 12.5, color: 'var(--mint-deep)', lineHeight: 1.4 }}>
            <strong>Arriving tomorrow:</strong>{' '}
            {formatGBP(
              tomorrowIncoming.reduce((s, i) => s + Number(i.amount), 0),
              0,
            )}
            {tomorrowIncoming.length === 1 && tomorrowIncoming[0].counterparty
              ? ` from ${tomorrowIncoming[0].counterparty}`
              : ` across ${tomorrowIncoming.length} incoming payment${
                  tomorrowIncoming.length === 1 ? '' : 's'
                }`}
            .
          </div>
        </div>
      )}

      {/* Emma-style inline list: upcoming items rendered in the same
          row vocabulary we'd use for real transactions. Keeps the
          user's mental model unified. */}
      <div
        style={{
          borderTop: '1px solid var(--divider)',
          marginLeft: -18,
          marginRight: -18,
        }}
      >
        {preview.map((item, i) => {
          const tone = SOURCE_TONE[item.source];
          return (
            <Link
              key={item.id}
              href="/dashboard/money-hub/upcoming"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 18px',
                borderBottom:
                  i < preview.length - 1 ? '1px solid var(--divider)' : 'none',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              {/* Amount direction icon */}
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background:
                    item.direction === 'incoming' ? 'var(--mint-wash)' : '#FEE2E2',
                  color:
                    item.direction === 'incoming' ? 'var(--mint-deep)' : 'var(--rose-deep)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {item.direction === 'incoming' ? (
                  <TrendingUp style={{ width: 14, height: 14 }} />
                ) : (
                  <TrendingDown style={{ width: 14, height: 14 }} />
                )}
              </div>

              {/* Counterparty + metadata */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 2,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {item.counterparty || 'Unknown'}
                  </div>
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: 700,
                      letterSpacing: '.04em',
                      textTransform: 'uppercase',
                      padding: '2px 5px',
                      background: tone.bg,
                      color: tone.color,
                      border: `1px solid ${tone.border}`,
                      borderRadius: 4,
                      flexShrink: 0,
                    }}
                  >
                    {SOURCE_LABEL[item.source]}
                    {item.source === 'predicted_recurring' && item.confidence !== null
                      ? ` ${Math.round(item.confidence * 100)}%`
                      : ''}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  {prettyDate(item.expected_date)}
                </div>
              </div>

              {/* Amount */}
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color:
                    item.direction === 'incoming' ? 'var(--mint-deep)' : 'var(--text)',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.direction === 'incoming' ? '+' : '−'}
                {formatGBP(Number(item.amount))}
              </div>
            </Link>
          );
        })}

        {moreCount > 0 && (
          <Link
            href="/dashboard/money-hub/upcoming"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 18px',
              fontSize: 12,
              color: 'var(--mint-deep)',
              fontWeight: 600,
              textDecoration: 'none',
              borderTop: '1px solid var(--divider)',
            }}
          >
            +{moreCount} more {moreCount === 1 ? 'item' : 'items'} this week{' '}
            <ArrowRight style={{ width: 12, height: 12 }} />
          </Link>
        )}
      </div>

      {data.totals.predictedCount > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
          {data.totals.confirmedCount} confirmed · {data.totals.predictedCount} predicted
        </div>
      )}
    </div>
  );
}
