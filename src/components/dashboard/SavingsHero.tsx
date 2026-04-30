'use client';

/**
 * SavingsHero — the "£X recovered with Paybacker" hero card on the dashboard.
 *
 * Wired to the existing GET /api/disputes/summary endpoint which returns
 * { total_open, total_resolved, total_disputed_amount, total_recovered }.
 *
 * Designed for the 14-day launch sprint per Paul Graham framework finding
 * #4 ("action rate, not detection rate, is the real product"). Surfaces
 * the cumulative recovered amount so users see the proof of value every
 * time they open the dashboard — the same psychology that the £2,000+
 * the founder has personally recovered demonstrates externally.
 *
 * Empty state explicitly avoids defeating the purpose with a £0 — instead
 * frames it as opportunity ("most users find £400+ in their first scan").
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, ArrowRight, Sparkles, Target } from 'lucide-react';
import { formatGBP } from '@/lib/format';

interface SummaryResponse {
  total_open: number;
  total_resolved: number;
  total_disputed_amount: number;
  total_recovered: number;
}

interface SavingsHeroProps {
  /** Optional: pre-fetched summary (lets the parent SSR-render and skip the loader). */
  initialSummary?: SummaryResponse;
}

export default function SavingsHero({ initialSummary }: SavingsHeroProps) {
  const [summary, setSummary] = useState<SummaryResponse | null>(
    initialSummary ?? null,
  );
  const [loading, setLoading] = useState(!initialSummary);

  useEffect(() => {
    if (initialSummary) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/disputes/summary', { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data: SummaryResponse = await res.json();
        if (!cancelled) {
          setSummary(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSummary]);

  if (loading) {
    return (
      <div
        className="card"
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, var(--mint-wash) 0%, #fff 100%)',
          borderColor: '#BBF7D0',
          minHeight: 110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--mint-deep)',
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        Loading your recovery total…
      </div>
    );
  }

  const recovered = summary?.total_recovered ?? 0;
  const wins = summary?.total_resolved ?? 0;
  const inFlight = summary?.total_open ?? 0;

  // EMPTY STATE — never show £0; convert to opportunity framing.
  if (recovered <= 0 && wins === 0) {
    return (
      <div
        className="card"
        style={{
          marginBottom: 16,
          background: 'linear-gradient(135deg, #FFF7ED 0%, #FFFDFA 100%)',
          borderColor: '#FED7AA',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              background: '#FED7AA',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Target size={24} color="#C2410C" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#9A3412',
                textTransform: 'uppercase',
                letterSpacing: 0.4,
                marginBottom: 4,
              }}
            >
              Find your first overcharge
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--ink-strong)',
                lineHeight: 1.25,
                marginBottom: 6,
              }}
            >
              Connect your bank or email to start spotting overcharges
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              Paybacker scans for price increases, sneaky renewals, and
              double-charges, then drafts the dispute letter citing the exact
              UK law. The £ recovered shows here as soon as you log your first win.
            </div>
          </div>
          <Link
            href="/dashboard/profile"
            style={{
              padding: '10px 16px',
              background: '#F97316',
              color: '#fff',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              alignSelf: 'center',
            }}
          >
            Connect now <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    );
  }

  // WIN STATE — show the actual £ recovered with a celebratory tone.
  const milestoneHit = recovered >= 100 && recovered < 1000;
  const bigWinHit = recovered >= 1000;

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        background: 'linear-gradient(135deg, var(--mint-wash) 0%, #fff 100%)',
        borderColor: '#BBF7D0',
      }}
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 48,
            height: 48,
            background: '#BBF7D0',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {bigWinHit ? (
            <Sparkles size={24} color="var(--mint-deep)" />
          ) : (
            <TrendingUp size={24} color="var(--mint-deep)" />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--mint-deep)',
              textTransform: 'uppercase',
              letterSpacing: 0.4,
              marginBottom: 4,
            }}
          >
            You&apos;ve recovered with Paybacker
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: 'var(--ink-strong)',
              lineHeight: 1.1,
              marginBottom: 6,
            }}
          >
            {formatGBP(recovered)}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
            {wins} dispute{wins === 1 ? '' : 's'} won
            {inFlight > 0 && (
              <>
                {' · '}
                <Link
                  href="/dashboard/disputes"
                  style={{ color: 'var(--mint-deep)', fontWeight: 600 }}
                >
                  {inFlight} in flight
                </Link>
              </>
            )}
            {milestoneHit && ' · You\u2019re paying for the year already'}
            {bigWinHit && ' · You\u2019re in the top 5% of users'}
          </div>
        </div>
        <Link
          href="/dashboard/disputes"
          style={{
            padding: '10px 16px',
            background: 'var(--mint-deep)',
            color: '#fff',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'center',
          }}
        >
          See breakdown <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
