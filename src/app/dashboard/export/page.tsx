'use client'
// src/app/dashboard/export/page.tsx
// Export destinations page — send Paybacker data to third-party tools.
// Live: Google Sheets sync, CSV + Excel one-shot download.
//
// The "Coming soon" block for Notion / YNAB / Actual Budget was removed
// on 2026-08-21. Three greyed cards with a "Notify me" mailto added no
// value and made a working export tool read as unfinished, which is
// exactly how it was misread. If those integrations get built they can
// be added to the live list.
//
// Pro-only per the tier matrix in src/lib/plan-limits.ts. Free + Essential
// users see the lock screen; the page surface is otherwise identical so
// upgrade re-enables instantly without a re-render shuffle.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import GoogleSheetsConnect from '@/components/GoogleSheetsConnect'
import DataExportCard from '@/components/DataExportCard'
import UpgradeLock from '@/components/UpgradeLock'
import { createClient } from '@/lib/supabase/client'
import { isAtLeastPro, type PlanTier } from '@/lib/tier-rank'

export default function ExportPage() {
  const [tier, setTier] = useState<PlanTier | null>(null);
  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setTier('free'); return; }
      sb.from('profiles').select('subscription_tier').eq('id', user.id).single()
        .then(({ data }) => setTier((data?.subscription_tier as PlanTier) ?? 'free'));
    });
  }, []);

  // Pro-only feature per CLAUDE.md tier matrix. Until tier loads, show a
  // lightweight skeleton (no flash of unlocked content for free users).
  // isAtLeastPro, not !== 'pro' — Household and Dispute Pro include export.
  // A null tier (still loading) fails the check, so the lock still shows first.
  if (!isAtLeastPro(tier)) {
    return (
      <div className="max-w-5xl">
        <div className="page-title-row" style={{ marginBottom: 14 }}>
          <div>
            <h1 className="page-title">Export</h1>
            <p className="page-sub">
              Send your Paybacker data to Google Sheets, or download it as CSV or Excel.
            </p>
          </div>
        </div>
        <UpgradeLock
          feature="Data export"
          requiredTier="pro"
          size="panel"
        />
        <p className="text-xs text-slate-500 mt-3 text-center">
          Your data is kept either way. Pro re-enables one-click sync to the tools above.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Variant A header (batch5 ExportHub) */}
      <div className="page-title-row" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Export</h1>
          <p className="page-sub">
            Send your Paybacker data to the tools you already use. Connect once and we export new data automatically, one way only. Anything you change in the destination stays there, it is not read back into Paybacker. You always own your data — revoke anytime.
          </p>
        </div>
        <Link
          href="mailto:hello@paybacker.co.uk?subject=Destination%20request"
          className="cta-ghost"
        >
          Request a destination →
        </Link>
      </div>

      {/* Live destinations */}
      <div className="grid grid-cols-1 gap-3 mb-6">
        <GoogleSheetsConnect />
        <DataExportCard />
      </div>

      {/* Privacy footer */}
      <div
        style={{
          marginTop: 18,
          padding: '10px 14px',
          background: '#F9FAFB',
          border: '1px solid var(--divider)',
          borderRadius: 10,
          fontSize: 11.5,
          color: 'var(--text-3)',
        }}
      >
        Paybacker only writes to destinations you connect yourself, and only ever writes — we never
        read your edits back. You can disconnect any time — your existing sheets, exports and Notion
        databases aren&rsquo;t deleted.
      </div>
    </div>
  )
}
