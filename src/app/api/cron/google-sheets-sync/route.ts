// src/app/api/cron/google-sheets-sync/route.ts
// Daily cron — appends new transactions to every connected user's Google Sheet.
// Schedule: add to vercel.json — "0 6 * * *" (6am UTC daily, after bank sync runs at 5am)
//
// Add to vercel.json:
// { "path": "/api/cron/google-sheets-sync", "schedule": "0 6 * * *" }

import { NextResponse } from 'next/server'

// Fans out across every connected user; the downstream export makes many
// Sheets API calls per user, so give it room rather than being killed midway.
export const runtime = 'nodejs'
export const maxDuration = 300

type ExportResult = {
  user_id: string
  rows_written: number
  skipped_tabs?: number
  error?: string
  recreated_spreadsheet?: boolean
}

export async function GET(req: Request) {
  // Vercel cron auth
  const authHeader = req.headers ? (req as any).headers.get('authorization') : null
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  // Delegate to export endpoint (no user_id = all connected users, incremental mode)
  const res = await fetch(`${baseUrl}/api/google-sheets/export`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': process.env.INTERNAL_API_KEY ?? '',
    },
    body: JSON.stringify({ full_export: false }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[google-sheets-sync cron] export returned ${res.status}: ${text.slice(0, 500)}`)
    return NextResponse.json(
      { ok: false, error: `export_http_${res.status}` },
      { status: 502 },
    )
  }

  const result = await res.json()
  const results: ExportResult[] = result?.results ?? []

  // Count per-user hard failures. Previously this always returned ok:true, so a
  // run in which every single user failed looked identical to a clean run.
  const failures = results.filter((r) => !!r.error)
  const skipped = results.filter((r) => !r.error && (r.skipped_tabs ?? 0) > 0)

  const failuresByReason: Record<string, number> = {}
  for (const f of failures) {
    const reason = f.error ?? 'unknown'
    failuresByReason[reason] = (failuresByReason[reason] ?? 0) + 1
  }

  const summary = {
    ...result,
    ok: failures.length === 0,
    users_processed: results.length,
    users_failed: failures.length,
    users_partially_written: skipped.length,
    rows_written: results.reduce((sum, r) => sum + (r.rows_written ?? 0), 0),
    failures_by_reason: failuresByReason,
  }

  if (failures.length > 0) {
    console.error('[google-sheets-sync cron] failures', failuresByReason)
  }
  console.log('[google-sheets-sync cron]', {
    users_processed: summary.users_processed,
    users_failed: summary.users_failed,
    rows_written: summary.rows_written,
  })

  return NextResponse.json(summary)
}
