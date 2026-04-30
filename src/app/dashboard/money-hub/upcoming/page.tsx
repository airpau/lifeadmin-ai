'use client';
// src/app/dashboard/money-hub/upcoming/page.tsx
//
// Full upcoming-payments timeline: day-by-day feed over 7/14/30 days
// with filters for account + a toggle for predicted rows. Reads from
// /api/money-hub/upcoming.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar, TrendingDown, TrendingUp } from 'lucide-react';
import type { UpcomingApiResponse, UpcomingPaymentRow } from '@/app/api/money-hub/upcoming/route';

type Window = 7 | 14 | 30;

function formatGBP(n: number): string {
  return `£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function prettyDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

const BADGE: Record<
  UpcomingPaymentRow['source'],
  { label: string; bg: string; color: string; border: string }
> = {
  pending_credit: { label: 'Confirmed', bg: 'var(--mint-wash)', color: 'var(--mint-deep)', border: '#86EFAC' },
  pending_debit: { label: 'Confirmed', bg: 'var(--mint-wash)', color: 'var(--mint-deep)', border: '#86EFAC' },
  scheduled_payment: { label: 'Scheduled', bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
  standing_order: { label: 'Scheduled', bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
  direct_debit: { label: 'Scheduled', bg: '#DBEAFE', color: '#1E40AF', border: '#93C5FD' },
  predicted_recurring: { label: 'Predicted', bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
};

export default function UpcomingPaymentsPage() {
  const [win, setWin] = useState<Window>(14);
  const [includePredicted, setIncludePredicted] = useState(true);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [data, setData] = useState<UpcomingApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      days: String(win),
      predicted: includePredicted ? '1' : '0',
    });
    fetch(`/api/money-hub/upcoming?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j as UpcomingApiResponse))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [win, includePredicted]);

  const accounts = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.groups.forEach((g) => g.items.forEach((i) => set.add(i.account_id)));
    return Array.from(set);
  }, [data]);

  const filteredGroups = useMemo(() => {
    if (!data) return [];
    if (accountFilter === 'all') return data.groups;
    return data.groups
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => i.account_id === accountFilter),
      }))
      .filter((g) => g.items.length);
  }, [data, accountFilter]);

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/money-hub"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--text-2)',
          textDecoration: 'none',
          marginBottom: 12,
          fontSize: 13,
        }}
      >
        <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Money Hub
      </Link>

      <div className="page-title-row" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Upcoming payments</h1>
          <p className="page-sub">
            Scheduled payments, standing orders, direct debits and predicted recurring charges — all the money moving in and out over the next {win} days.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {[7, 14, 30].map((w) => (
          <button
            key={w}
            onClick={() => setWin(w as Window)}
            style={{
              padding: '6px 12px',
              fontSize: 12.5,
              fontWeight: 600,
              background: win === w ? 'var(--text)' : '#fff',
              color: win === w ? '#fff' : 'var(--text-2)',
              border: '1px solid',
              borderColor: win === w ? 'var(--text)' : 'var(--divider)',
              borderRadius: 999,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Next {w} days
          </button>
        ))}
        {accounts.length > 1 && (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              fontSize: 12.5,
              border: '1px solid var(--divider)',
              borderRadius: 999,
              background: '#fff',
              color: 'var(--text)',
              fontFamily: 'inherit',
            }}
          >
            <option value="all">All accounts</option>
            {accounts.map((a) => (
              <option key={a} value={a}>{`Account ${a.slice(-6)}`}</option>
            ))}
          </select>
        )}
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            fontSize: 12.5,
            color: 'var(--text-2)',
            border: '1px solid var(--divider)',
            borderRadius: 999,
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={includePredicted}
            onChange={(e) => setIncludePredicted(e.target.checked)}
            style={{ accentColor: '#059669' }}
          />
          Include predicted
        </label>
      </div>

      {/* Totals strip */}
      {data && (
        <div className="kpi-row c3" style={{ marginBottom: 14 }}>
          <div className="kpi-card">
            <div className="k-label"><TrendingUp className="h-3.5 w-3.5" /> Coming in</div>
            <div className="k-val green">{formatGBP(data.totals.incoming)}</div>
            <div className="k-delta">Across the next {win} days</div>
          </div>
          <div className="kpi-card">
            <div className="k-label"><TrendingDown className="h-3.5 w-3.5" /> Going out</div>
            <div className="k-val red">{formatGBP(data.totals.outgoing)}</div>
            <div className="k-delta">Scheduled + predicted</div>
          </div>
          <div className="kpi-card">
            <div className="k-label"><Calendar className="h-3.5 w-3.5" /> Net</div>
            <div
              className="k-val"
              style={{ color: data.totals.net >= 0 ? 'var(--mint-deep)' : 'var(--rose-deep)' }}
            >
              {data.totals.net >= 0 ? '+' : '-'}{formatGBP(Math.abs(data.totals.net))}
            </div>
            <div className="k-delta">
              {data.totals.confirmedCount} confirmed · {data.totals.predictedCount} predicted
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          Loading…
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🗓️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>
            Nothing scheduled yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>
            As soon as we pick up a standing order, direct debit or pending payment on your connected bank, it'll show up here.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filteredGroups.map((g) => (
            <div key={g.date}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: 6,
                  padding: '0 4px',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                  {prettyDate(g.date)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {g.incoming > 0 && (
                    <span style={{ color: 'var(--mint-deep)', marginRight: 10 }}>
                      +{formatGBP(g.incoming)}
                    </span>
                  )}
                  {g.outgoing > 0 && (
                    <span style={{ color: 'var(--rose-deep)' }}>
                      −{formatGBP(g.outgoing)}
                    </span>
                  )}
                </div>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {g.items.map((item, i) => {
                  const badge = BADGE[item.source];
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 18px',
                        borderBottom: i < g.items.length - 1 ? '1px solid var(--divider)' : 'none',
                      }}
                    >
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: item.direction === 'incoming' ? 'var(--mint-wash)' : '#FEE2E2',
                          color: item.direction === 'incoming' ? 'var(--mint-deep)' : 'var(--rose-deep)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {item.direction === 'incoming'
                          ? <TrendingUp style={{ width: 16, height: 16 }} />
                          : <TrendingDown style={{ width: 16, height: 16 }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.counterparty || 'Unknown counterparty'}
                          </div>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: '.04em',
                              textTransform: 'uppercase',
                              padding: '2px 6px',
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              borderRadius: 4,
                            }}
                          >
                            {badge.label}
                            {item.source === 'predicted_recurring' && item.confidence !== null
                              ? ` · ${Math.round(item.confidence * 100)}%`
                              : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                          {describeSource(item.source)} · Acct •••{item.account_id.slice(-4)}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: item.direction === 'incoming' ? 'var(--mint-deep)' : 'var(--text)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.direction === 'incoming' ? '+' : '−'}
                        {formatGBP(Number(item.amount))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 18, lineHeight: 1.5 }}>
        Updated daily at 06:00. Confirmed items come from your bank's Open Banking feed (Yapily, FCA-authorised, read-only). Predicted items come from our recurrence detector — we only emit a prediction once we've seen a pattern at least three times.
      </p>
    </div>
  );
}

function describeSource(s: UpcomingPaymentRow['source']): string {
  switch (s) {
    case 'pending_credit': return 'Pending incoming';
    case 'pending_debit': return 'Pending outgoing';
    case 'scheduled_payment': return 'Scheduled payment';
    case 'standing_order': return 'Standing order';
    case 'direct_debit': return 'Direct debit';
    case 'predicted_recurring': return 'Predicted recurring';
  }
}
