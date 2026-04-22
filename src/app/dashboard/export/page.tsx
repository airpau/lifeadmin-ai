'use client'
// src/app/dashboard/export/page.tsx
// Export destinations page — send Paybacker data to third-party tools.
// Currently live: Google Sheets sync, CSV + Excel one-shot download.
// Coming soon: Notion, YNAB, Actual Budget.

import Link from 'next/link'
import GoogleSheetsConnect from '@/components/GoogleSheetsConnect'
import DataExportCard from '@/components/DataExportCard'

type ComingSoonDestination = {
  name: string
  blurb: string
  icon: React.ReactNode
  iconBg: string
}

const comingSoon: ComingSoonDestination[] = [
  {
    name: 'Notion',
    blurb: 'Sync transactions into a Notion database',
    iconBg: 'bg-slate-100',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" fill="#0f172a"/>
        <path d="M7 7h2l4 7V7h2v10h-2l-4-7v7H7z" fill="#ffffff"/>
      </svg>
    ),
  },
  {
    name: 'YNAB',
    blurb: 'Push transactions straight into your YNAB budget',
    iconBg: 'bg-blue-500/10',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="4" fill="#3b82f6"/>
        <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">Y</text>
      </svg>
    ),
  },
  {
    name: 'Actual Budget',
    blurb: 'Send transactions to your self-hosted Actual instance',
    iconBg: 'bg-amber-500/10',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" fill="#f59e0b"/>
        <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0f172a">A</text>
      </svg>
    ),
  },
]

export default function ExportPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Export</h1>
        <p className="mt-2 text-sm text-slate-600 max-w-2xl">
          Send your Paybacker data to the tools you already use. Connect a destination once and
          we&rsquo;ll keep it in sync automatically.
        </p>
      </div>

      {/* Live destinations */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Available now
        </h2>
        <div className="grid grid-cols-1 gap-4">
          <GoogleSheetsConnect />
          <DataExportCard />
        </div>
      </section>

      {/* Coming soon */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Coming soon
          </h2>
          <Link
            href="mailto:hello@paybacker.co.uk?subject=Destination%20request"
            className="text-xs text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Request a destination →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {comingSoon.map((d) => (
            <div
              key={d.name}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 opacity-80"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${d.iconBg} flex items-center justify-center flex-shrink-0`}>
                  {d.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900 text-sm">{d.name}</h3>
                    <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full text-slate-600 bg-slate-100">
                      Soon
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{d.blurb}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Privacy footer */}
      <div className="text-xs text-slate-500 pt-2">
        Paybacker only writes to destinations you connect yourself. You can disconnect any time
        — your existing sheets and exports aren&rsquo;t deleted.
      </div>
    </div>
  )
}
