'use client';

import Link from 'next/link';
import { Clock } from 'lucide-react';

/**
 * Post-scan depth notice for capped (free-tier) inbox scans.
 *
 * Mirrors `ScanWindowNotice` from src/lib/email-scan-window.ts, which is
 * where the copy is generated. This component renders it and adds
 * nothing — deliberately. If you want to change what it says, change the
 * builder, not this file, so the API response and the UI can never drift
 * apart.
 *
 * Returns null when `notice` is null, which is what every paid tier gets.
 * A paying customer must never see an upsell after a scan they paid for.
 */
export interface ScanWindowNoticeData {
  scannedDays: number;
  fullWindowDays: number;
  scannedLabel: string;
  fullWindowLabel: string;
  sinceISO: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

export default function ScanWindowNotice({
  notice,
  compact = false,
}: {
  notice: ScanWindowNoticeData | null | undefined;
  compact?: boolean;
}) {
  if (!notice) return null;

  const sinceLabel = (() => {
    const d = new Date(notice.sinceISO);
    return Number.isFinite(d.getTime())
      ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
  })();

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        margin: compact ? '8px 0 10px' : '10px 0 14px',
        padding: compact ? '10px 12px' : '14px 16px',
        borderRadius: 12,
        background: 'var(--amber-wash, #FFFBEB)',
        border: '1px solid #FCD34D',
        color: '#78350F',
        fontSize: compact ? 12.5 : 13.5,
        lineHeight: 1.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 700, marginBottom: 5 }}>
        <Clock className="h-4 w-4" aria-hidden="true" />
        <span>{notice.headline}</span>
      </div>
      <p style={{ margin: '0 0 8px' }}>{notice.body}</p>
      {sinceLabel && (
        <p style={{ margin: '0 0 8px', fontSize: compact ? 11.5 : 12.5, opacity: 0.85 }}>
          Oldest email included in this scan: {sinceLabel}.
        </p>
      )}
      <Link
        href={notice.ctaHref}
        style={{
          display: 'inline-block',
          padding: '6px 12px',
          borderRadius: 999,
          background: '#78350F',
          color: '#FFFBEB',
          fontWeight: 700,
          fontSize: compact ? 12 : 12.5,
          textDecoration: 'none',
        }}
      >
        {notice.ctaLabel}
      </Link>
    </div>
  );
}
