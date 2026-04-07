// src/app/api/cron/google-sheets-sync/route.ts
// Daily cron — appends new transactions to every connected user's Google Sheet.
// Schedule: add to vercel.json — "0 6 * * *" (6am UTC daily, after bank sync runs at 5am)
//
// Add to vercel.json:
// { "path": "/api/cron/google-sheets-sync", "schedule": "0 6 * * *" }

import { NextResponse } from 'next/server'

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

  const result = await res.json()
  console.log('[google-sheets-sync cron]', result)

  return NextResponse.json({ ok: true, ...result })
}
