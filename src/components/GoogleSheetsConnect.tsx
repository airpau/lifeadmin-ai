'use client'
// src/components/GoogleSheetsConnect.tsx
// Google Sheets destination card — rendered on /dashboard/export.
// Handles: not-connected → OAuth flow → connected state with sheet link,
// last-sync timestamp, Sync Now button, and Disconnect.

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import RotatingCaptionsLoader, { LoaderCaption } from './RotatingCaptionsLoader'

interface SheetsConnection {
  spreadsheet_url: string | null
  spreadsheet_id: string | null
  last_synced_at: string | null
  last_synced_timestamp: string | null
  email: string
}

// Captions shown while a sync is in flight. Full-history backfills are slow
// (thousands of rows → Sheets API batching), so we want the user to know
// the app hasn't frozen.
const SYNC_CAPTIONS: LoaderCaption[] = [
  { icon: '📥', text: 'Gathering your transactions…' },
  { icon: '🧮', text: 'Sorting by account and date…' },
  { icon: '📊', text: 'Writing rows to your Google Sheet…' },
  { icon: '🔗', text: 'Linking categories and merchants…' },
  { icon: '✨', text: 'Almost done — tidying the last tab…' },
]

export default function GoogleSheetsConnect() {
  const [connection, setConnection] = useState<SheetsConnection | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<
    { kind: 'success' | 'error'; text: string } | null
  >(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function loadConnection() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('google_sheets_connections')
      .select('spreadsheet_url, spreadsheet_id, last_synced_at, last_synced_timestamp, email')
      .eq('user_id', user.id)
      .maybeSingle()

    setConnection(data ?? null)
    setLoading(false)
  }

  useEffect(() => {
    loadConnection()

    // Check for success/error params after OAuth redirect
    const params = new URLSearchParams(window.location.search)
    if (params.get('sheets_connected') === 'true') {
      loadConnection()
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function handleDisconnect() {
    if (!confirm('Disconnect Google Sheets? Your existing sheet will not be deleted.')) return
    setDisconnecting(true)
    await fetch('/api/google-sheets/disconnect', { method: 'POST' })
    setConnection(null)
    setDisconnecting(false)
  }

  async function handleSyncNow() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch('/api/google-sheets/sync-now', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        setSyncMessage({
          kind: 'error',
          text: data?.error || 'Sync failed. Please try again.',
        })
      } else {
        const rows = data?.rows_written ?? 0
        const isBackfill = data?.full_export === true
        if (rows === 0) {
          setSyncMessage({
            kind: 'success',
            text: 'All caught up — no new transactions to sync.',
          })
        } else {
          setSyncMessage({
            kind: 'success',
            text: isBackfill
              ? `Backfill complete — ${rows.toLocaleString()} rows written.`
              : `Synced ${rows.toLocaleString()} new row${rows === 1 ? '' : 's'}.`,
          })
        }
        // Reload connection to pick up fresh last_synced_at
        await loadConnection()
      }
    } catch {
      setSyncMessage({
        kind: 'error',
        text: 'Could not reach the sync service. Please try again.',
      })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-navy-700/50 bg-navy-900 p-5 animate-pulse">
        <div className="h-5 w-40 bg-navy-800 rounded mb-2" />
        <div className="h-4 w-64 bg-navy-800 rounded" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-navy-700/50 bg-navy-900 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="2" width="18" height="20" rx="2" fill="#34A853" />
            <rect x="7" y="8" width="10" height="1.5" rx="0.75" fill="white" />
            <rect x="7" y="11.5" width="10" height="1.5" rx="0.75" fill="white" />
            <rect x="7" y="15" width="6" height="1.5" rx="0.75" fill="white" />
          </svg>
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-white text-sm">Google Sheets</h3>
          <p className="text-xs text-slate-400 truncate">
            {connection
              ? `Connected as ${connection.email}`
              : 'Sync every account to a Google Sheet, updated daily'}
          </p>
        </div>
        {connection && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            Live
          </span>
        )}
      </div>

      {connection ? (
        /* Connected state */
        <div className="space-y-3">
          <div className="rounded-lg bg-navy-800/60 p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-400 text-xs">Last synced</span>
              <span className="font-medium text-white text-xs">
                {connection.last_synced_at
                  ? new Date(connection.last_synced_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })
                  : 'Pending first sync…'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 text-xs">Newest transaction</span>
              <span className="font-medium text-white text-xs">
                {connection.last_synced_timestamp
                  ? new Date(connection.last_synced_timestamp).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })
                  : '—'}
              </span>
            </div>
          </div>

          {/* Sync progress / result */}
          {syncing && (
            <RotatingCaptionsLoader
              active={syncing}
              variant="card"
              heading={
                connection.last_synced_at
                  ? 'Syncing new transactions…'
                  : 'Backfilling your full history…'
              }
              captions={SYNC_CAPTIONS}
            />
          )}

          {!syncing && syncMessage && (
            <div
              className={
                'rounded-lg px-3 py-2 text-xs ' +
                (syncMessage.kind === 'success'
                  ? 'bg-green-500/10 text-green-300 border border-green-500/20'
                  : 'bg-red-500/10 text-red-300 border border-red-500/20')
              }
            >
              {syncMessage.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex-1 min-w-[140px] text-center text-sm font-semibold text-navy-950 bg-mint-400 hover:bg-mint-500 disabled:bg-mint-400/40 disabled:cursor-not-allowed transition-colors rounded-lg py-2.5"
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            {connection.spreadsheet_url && (
              <a
                href={connection.spreadsheet_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-[140px] text-center text-sm font-semibold text-white bg-green-600 hover:bg-green-500 transition-colors rounded-lg py-2.5"
              >
                Open Sheet ↗
              </a>
            )}
            <button
              onClick={handleDisconnect}
              disabled={disconnecting || syncing}
              className="text-sm text-slate-400 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-3 py-2 rounded-lg border border-navy-700 hover:border-red-400/50"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        /* Not connected state */
        <div className="space-y-3">
          <ul className="text-xs text-slate-400 space-y-1.5 pl-1">
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> One tab per bank account
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Full transaction history, growing daily
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Date, merchant, amount, category &amp; more
            </li>
          </ul>
          <a
            href="/api/auth/google-sheets"
            className="flex items-center justify-center gap-2 w-full text-sm font-semibold text-navy-950 bg-white hover:bg-slate-100 transition-colors rounded-lg py-2.5 shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Connect Google Sheets
          </a>
          <p className="text-[11px] text-slate-500 text-center">
            Your data stays in your Google account. Updated every morning at 6am.
          </p>
        </div>
      )}
    </div>
  )
}
