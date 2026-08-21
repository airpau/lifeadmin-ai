// src/app/api/google-sheets/sync-now/route.ts
//
// User-triggered sync. Called from the Sync Now button on the Export page.
//
// Behaviour:
//   - If last_synced_at is null → full_export: true (backfill all history).
//   - Otherwise → full_export: false (incremental — only new transactions
//     since last_synced_timestamp).
//
// Unlike the fire-and-forget triggerSheetsExport helper, this endpoint
// AWAITS the export call and returns rows_written so the UI can show a
// "Synced N rows" confirmation. Still uses the internal-key flow against
// /api/google-sheets/export under the hood.
//
// Session-authed (cookies). Works for the logged-in user only.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  // Google Sheets export is Pro-only per plan-limits.ts — same gate as
  // /api/auth/google-sheets, /api/export/csv and /api/export/xlsx. Without
  // this, a downgraded user could keep syncing indefinitely.
  // isAtLeastPro, not !== 'pro' — Household is entitled to this too.
  const { getEffectiveTier } = await import('@/lib/plan-limits')
  const { isAtLeastPro } = await import('@/lib/tier-rank')
  const tier = await getEffectiveTier(user.id)
  if (!isAtLeastPro(tier)) {
    return NextResponse.json(
      {
        error: 'Google Sheets export is available on the Pro plan.',
        upgradeUrl: '/pricing',
      },
      { status: 403 },
    )
  }

  // Is a sheet connected? If so, decide full vs incremental.
  const { data: conn } = await supabase
    .from('google_sheets_connections')
    .select('last_synced_at')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!conn) {
    return NextResponse.json(
      { error: 'No Google Sheet connected. Connect one first.' },
      { status: 400 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const internalKey = process.env.INTERNAL_API_KEY

  if (!appUrl || !internalKey) {
    console.error('sync-now: missing NEXT_PUBLIC_APP_URL or INTERNAL_API_KEY')
    return NextResponse.json(
      { error: 'Server misconfigured — please contact support.' },
      { status: 500 }
    )
  }

  // First sync ever? Do a full history backfill. Otherwise incremental.
  const fullExport = conn.last_synced_at === null

  try {
    const res = await fetch(`${appUrl}/api/google-sheets/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': internalKey,
      },
      body: JSON.stringify({
        user_id: user.id,
        full_export: fullExport,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`sync-now: export returned ${res.status}`, text)
      return NextResponse.json(
        { error: `Export failed (${res.status}). Please try again shortly.` },
        { status: 502 }
      )
    }

    const data = await res.json()
    const result = data?.results?.[0]
    const rows = result?.rows_written ?? 0
    // Propagate the per-user diagnostics. Previously only rows_written was
    // read, so token_expired / sheets_metadata_read_failed / no_bank_connections
    // / skipped tabs all rendered to the user as "All caught up".
    const syncError: string | null = result?.error ?? null
    const skippedTabs: number = result?.skipped_tabs ?? 0

    if (syncError) {
      console.error(
        `sync-now: export reported "${syncError}" for user ${user.id} (rows=${rows}, skipped_tabs=${skippedTabs})`
      )
    }

    return NextResponse.json({
      ok: !syncError,
      rows_written: rows,
      full_export: fullExport,
      sync_error: syncError,
      skipped_tabs: skippedTabs,
      recreated_spreadsheet: result?.recreated_spreadsheet === true,
    })
  } catch (err) {
    console.error('sync-now: fetch failed', err)
    return NextResponse.json(
      { error: 'Could not reach the export service. Please try again.' },
      { status: 502 }
    )
  }
}
