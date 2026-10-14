// src/app/api/export/csv/route.ts
//
// User-triggered CSV download of all the user's bank transactions, matching
// the column set used by the Google Sheets sync (Date, Description, Merchant,
// Amount, Category, Type, Recurring, Transaction ID).
//
// One row per transaction. The Account column is added so multi-account users
// can still split/filter by account inside their spreadsheet app.
//
// Auth: authenticated Supabase session (cookies).
// Response: text/csv attachment, UTF-8 with BOM so Excel opens pound signs cleanly.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { buildCsv, buildAccountMap, type BankConnLike, type ExportTx } from '@/lib/export/transactions-export'

// PostgREST caps a plain select at 1000 rows. Paginate by this size, otherwise
// anyone with more than 1000 transactions silently gets only their OLDEST 1000.
const DB_PAGE_SIZE = 1000

export async function GET(_req: NextRequest) {
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

  // CSV export is Pro-only per plan-limits.ts. Previously the route only
  // gated on auth, so any authenticated user with the URL could download
  // their full ledger regardless of tier.
  // isAtLeastPro, not !== 'pro' — Household is entitled to this too.
  const { getEffectiveTier } = await import('@/lib/plan-limits')
  const { isAtLeastPro } = await import('@/lib/tier-rank')
  const tier = await getEffectiveTier(user.id)
  if (!isAtLeastPro(tier)) {
    return NextResponse.json(
      { error: 'CSV export is available on the Pro plan.' },
      { status: 403 },
    )
  }

  // Every bank connection, whatever its state, so history that sits under a
  // revoked or replaced connection still gets its bank and account name.
  const { data: bankConns } = await supabase
    .from('bank_connections')
    .select('bank_name, account_ids, account_display_names, status')
    .eq('user_id', user.id)
  const accounts = buildAccountMap((bankConns ?? []) as BankConnLike[])

  // All the user's live transactions, oldest first, pending included (marked
  // in the Type column) so the file matches the dashboard and the Sheet.
  //
  // Ordered by timestamp THEN id. Ordering by timestamp alone is not stable
  // when many rows share a timestamp (banks often stamp a whole day at
  // 00:00), so offset pages could skip some rows and repeat others.
  const transactions: ExportTx[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('id, transaction_id, account_id, timestamp, description, merchant_name, amount, category, user_category, income_type, is_recurring, is_pending')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + DB_PAGE_SIZE - 1)

    if (error) {
      console.error('CSV export query failed:', error)
      return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }
    if (!data || data.length === 0) break
    transactions.push(...(data as ExportTx[]))
    if (data.length < DB_PAGE_SIZE) break
    from += DB_PAGE_SIZE
  }

  const body = buildCsv(transactions, accounts)

  const filename = `paybacker-transactions-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
