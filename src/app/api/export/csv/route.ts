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

const HEADERS = [
  'Date',
  'Description',
  'Merchant',
  'Amount (£)',
  'Category',
  'Type',
  'Recurring',
  'Bank',
  'Account',
  'Transaction ID',
]

// PostgREST caps a plain select at 1000 rows. Paginate by this size, otherwise
// anyone with more than 1000 transactions silently gets only their OLDEST 1000.
const DB_PAGE_SIZE = 1000

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Neutralise spreadsheet formula injection: any cell whose first char is
  // =, +, -, @, tab or CR could be parsed as a formula by Excel / Numbers /
  // Sheets. Prefix a single quote to defang it. Merchant and description
  // strings come straight from the bank feed, so they are untrusted input.
  // Numbers are exempt — a negative amount must stay a number.
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  // Always quote; escape embedded quotes by doubling.
  return '"' + s.replace(/"/g, '""') + '"'
}

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
  // isAtLeastPro, not !== 'pro' — Dispute Pro and Household are entitled to this.
  const { getEffectiveTier } = await import('@/lib/plan-limits')
  const { isAtLeastPro } = await import('@/lib/tier-rank')
  const tier = await getEffectiveTier(user.id)
  if (!isAtLeastPro(tier)) {
    return NextResponse.json(
      { error: 'CSV export is available on the Pro plan.' },
      { status: 403 },
    )
  }

  // Pull the user's bank connections so we can map account_id -> bank/account name.
  const { data: bankConns } = await supabase
    .from('bank_connections')
    .select('bank_name, account_ids, account_display_names')
    .eq('user_id', user.id)

  const accountMap = new Map<string, { bank: string; account: string }>()
  for (const bank of bankConns ?? []) {
    const ids: string[] = bank.account_ids ?? []
    const names: string[] = bank.account_display_names ?? []
    for (let i = 0; i < ids.length; i++) {
      accountMap.set(ids[i], {
        bank: bank.bank_name ?? '',
        account: names[i] ?? '',
      })
    }
  }

  // Pull all the user's non-pending transactions, oldest first.
  //
  // Paginated: a plain .select() is capped at 1000 rows by PostgREST and
  // returns the oldest first, so every user with a real transaction history
  // was silently downloading a truncated ledger.
  type CsvTx = {
    transaction_id: string | null
    account_id: string | null
    timestamp: string
    description: string | null
    merchant_name: string | null
    amount: number | null
    category: string | null
    user_category: string | null
    income_type: string | null
    is_recurring: boolean | null
  }

  const transactions: CsvTx[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('transaction_id, account_id, timestamp, description, merchant_name, amount, category, user_category, income_type, is_recurring')
      .eq('user_id', user.id)
      .eq('is_pending', false)
      .is('deleted_at', null)
      .order('timestamp', { ascending: true })
      .range(from, from + DB_PAGE_SIZE - 1)

    if (error) {
      console.error('CSV export query failed:', error)
      return NextResponse.json({ error: 'Export failed' }, { status: 500 })
    }
    if (!data || data.length === 0) break
    transactions.push(...(data as CsvTx[]))
    if (data.length < DB_PAGE_SIZE) break
    from += DB_PAGE_SIZE
  }

  // Build CSV body.
  const lines: string[] = []
  lines.push(HEADERS.map(csvEscape).join(','))

  for (const tx of transactions) {
    const dateRaw = tx.timestamp ? new Date(tx.timestamp) : null
    const date = dateRaw ? dateRaw.toLocaleDateString('en-GB') : ''
    const amount = typeof tx.amount === 'number' ? Number(tx.amount.toFixed(2)) : ''
    const category = tx.user_category ?? tx.category ?? ''
    const type = tx.income_type ?? (typeof tx.amount === 'number' && tx.amount > 0 ? 'Income' : 'Expense')
    const recurring = tx.is_recurring ? 'Yes' : 'No'
    const acct = accountMap.get(tx.account_id ?? '') ?? { bank: '', account: '' }

    lines.push([
      csvEscape(date),
      csvEscape(tx.description ?? ''),
      csvEscape(tx.merchant_name ?? ''),
      csvEscape(amount),
      csvEscape(category),
      csvEscape(type),
      csvEscape(recurring),
      csvEscape(acct.bank),
      csvEscape(acct.account),
      csvEscape(tx.transaction_id ?? ''),
    ].join(','))
  }

  // UTF-8 BOM so Excel on Windows renders £ correctly.
  const body = '\uFEFF' + lines.join('\r\n') + '\r\n'

  const filename = `paybacker-transactions-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
