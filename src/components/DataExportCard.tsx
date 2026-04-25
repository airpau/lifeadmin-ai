'use client'
// src/components/DataExportCard.tsx
// One-shot CSV / Excel downloads for the user's full transaction history.
// Sits alongside GoogleSheetsConnect — that card is for live sync, this card
// is for users who just want a file.
//
// Usage:
//   import DataExportCard from '@/components/DataExportCard'
//   <DataExportCard />

import { useState } from 'react'

type Format = 'csv' | 'xlsx'

export default function DataExportCard() {
  const [downloading, setDownloading] = useState<Format | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload(format: Format) {
    setDownloading(format)
    setError(null)
    try {
      const res = await fetch(`/api/export/${format}`, { method: 'GET' })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(body || `Export failed (${res.status})`)
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url

      // Prefer the filename the server suggested.
      const disposition = res.headers.get('content-disposition') ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/i)
      a.download = match?.[1] ?? `paybacker-transactions.${format}`

      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Download failed'
      setError(msg)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          {/* Download icon */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E75B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Download your data</h3>
          <p className="text-xs text-gray-500">
            Grab every transaction as a file — no sync, no setup.
          </p>
        </div>
      </div>

      <ul className="text-xs text-gray-500 space-y-1 pl-1 mb-3">
        <li className="flex items-center gap-2">
          <span className="text-green-500">✓</span> Full history across every connected bank
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500">✓</span> Matches the Google Sheets column layout
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500">✓</span> Excel version includes a separate tab per account
        </li>
      </ul>

      <div className="flex gap-2">
        <button
          onClick={() => handleDownload('csv')}
          disabled={downloading !== null}
          className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors rounded-lg py-2.5 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {downloading === 'csv' ? (
            <>
              <svg className="animate-spin h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="42" strokeDashoffset="0" />
              </svg>
              Preparing…
            </>
          ) : (
            <>Download CSV</>
          )}
        </button>
        <button
          onClick={() => handleDownload('xlsx')}
          disabled={downloading !== null}
<<<<<<< HEAD
          className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-slate-900 bg-[#0F7B6C] hover:bg-[#0b6357] transition-colors rounded-lg py-2.5 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {downloading === 'xlsx' ? (
            <>
              <svg className="animate-spin h-4 w-4 text-slate-900" viewBox="0 0 24 24" fill="none">
=======
          className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-[#0F7B6C] hover:bg-[#0b6357] transition-colors rounded-lg py-2.5 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {downloading === 'xlsx' ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
>>>>>>> 6ed4f978 (feat: managed agents with memory + finance-analyst, decommission legacy executives, hardened MCP v2.1.0)
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="42" strokeDashoffset="0" />
              </svg>
              Preparing…
            </>
          ) : (
            <>Download Excel (.xlsx)</>
          )}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 mt-3">{error}</p>
      )}

      <p className="text-[11px] text-gray-400 text-center mt-3">
        Large accounts may take a few seconds to build the file.
      </p>
    </div>
  )
}
