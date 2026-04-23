'use client';
// src/app/dashboard/money-hub/UpcomingWidget.tsx
//
// "Next 7 days" widget rendered on the Money Hub home page.
// Net incoming − outgoing total, "tomorrow" highlight strip when any
// confirmed incoming is expected, and a link into the full timeline.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Calendar, TrendingDown, TrendingUp, Sparkles } from 'lucide-react';
import type { UpcomingApiResponse, UpcomingPaymentRow } from '@/app/api/money-hub/upcoming/route';

function formatGBP(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function isTomorrow(dateIso: string): boolean {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10) === dateIso;
}

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

  // Tomorrow's confirmed incoming — headline row, this is the "HSBC
  // told me there's a payment arriving tomorrow" moment Emma copied.
  const tomorrowIncoming: UpcomingPaymentRow[] = (data?.groups || [])
    .filter((g) => isTomorrow(g.date))
    .flatMap((g) => g.items)
    .filter(
      (i) =>
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

  if (!data || (data.totals.incoming === 0 && data.totals.outgoing === 0)) {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="k-label">
          <Calendar className="h-3.5 w-3.5" /> Next 7 days
        </div>
        <Link
          href="/dashboard/money-hub/upcoming"
          style={{ fontSize: 12, color: 'var(--mint-deep)', fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          Full timeline <ArrowRight style={{ width: 12, height: 12 }} />
        </Link>
      </div>

      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.02em', color: net >= 0 ? 'var(--mint-deep)' : 'var(--rose-deep)' }}>
        {net >= 0 ? '+' : ''}{formatGBP(net)}
      </div>
      <div className="k-delta" style={{ display: 'flex', gap: 14, marginTop: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <TrendingUp style={{ width: 12, height: 12, color: 'var(--mint-deep)' }} />
          {formatGBP(data.totals.incoming)} in
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <TrendingDown style={{ width: 12, height: 12, color: 'var(--rose-deep)' }} />
          {formatGBP(data.totals.outgoing)} out
        </span>
      </div>

      {tomorrowIncoming.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: '10px 12px',
            background: 'var(--mint-wash)',
            border: '1px solid #86EFAC',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Sparkles style={{ width: 16, height: 16, color: 'var(--mint-deep)', flexShrink: 0 }} />
          <div style={{ fontSize: 12.5, color: 'var(--mint-deep)', lineHeight: 1.4 }}>
            <strong>Arriving tomorrow:</strong> {formatGBP(tomorrowIncoming.reduce((s, i) => s + Number(i.amount), 0))}
            {tomorrowIncoming.length === 1 && tomorrowIncoming[0].counterparty
              ? ` from ${tomorrowIncoming[0].counterparty}`
              : ` across ${tomorrowIncoming.length} incoming payment${tomorrowIncoming.length === 1 ? '' : 's'}`}
            .
          </div>
        </div>
      )}

      {data.totals.predictedCount > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 10 }}>
          {data.totals.confirmedCount} confirmed · {data.totals.predictedCount} predicted
        </div>
      )}
    </div>
  );
}
