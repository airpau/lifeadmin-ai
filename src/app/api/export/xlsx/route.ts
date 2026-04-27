// src/app/api/export/xlsx/route.ts
//
// User-triggered .xlsx download. Workbook layout mirrors the Google Sheets sync:
// one worksheet per bank account, headered with
// Date | Description | Merchant | Amount (£) | Category | Type | Recurring | Transaction ID.
// A summary sheet "All transactions" is added first for users who want one view.
//
// Auth: authenticated Supabase session (cookies).
// Response: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet attachment.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import ExcelJS from 'exceljs'

// Force Node runtime — exceljs is not edge-compatible.
export const runtime = 'nodejs'
// These can be large; allow longer processing on Vercel Pro.
export const maxDuration = 60

const COLUMNS: Array<{ header: string; key: string; width: number }> = [
  { header: 'Date',           key: 'date',        width: 12 },
  { header: 'Description',    key: 'description', width: 40 },
  { header: 'Merchant',       key: 'merchant',    width: 26 },
  { header: 'Amount (£)',     key: 'amount',      width: 14 },
  { header: 'Category',       key: 'category',    width: 20 },
  { header: 'Type',           key: 'type',        width: 12 },
  { header: 'Recurring',      key: 'recurring',   width: 11 },
  { header: 'Transaction ID', key: 'ref',         width: 28 },
]

const ALL_COLUMNS: Array<{ header: string; key: string; width: number }> = [
  ...COLUMNS.slice(0, 7),
  { header: 'Bank',    key: 'bank',    width: 18 },
  { header: 'Account', key: 'account', width: 22 },
  COLUMNS[7],
]

type Tx = {
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

function rowFromTx(tx: Tx) {
  const dateRaw = tx.timestamp ? new Date(tx.timestamp) : null
  const amount = typeof tx.amount === 'number' ? Number(tx.amount.toFixed(2)) : null
  const category = tx.user_category ?? tx.category ?? ''
  const type =
    tx.income_type ??
    (typeof tx.amount === 'number' && tx.amount > 0 ? 'Income' : 'Expense')
  const recurring = tx.is_recurring ? 'Yes' : 'No'

  return {
    date: dateRaw,
    description: tx.description ?? '',
    merchant: tx.merchant_name ?? '',
    amount,
    category,
    type,
    recurring,
    ref: tx.transaction_id ?? '',
  }
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2E75B6' }, // Paybacker blue
  }
  row.alignment = { vertical: 'middle' }
  row.height = 20
}

function sanitiseSheetName(raw: string): string {
  // Excel forbids these characters in sheet names and limits to 31 chars.
  return (raw || 'Account')
    .replace(/[\\\/\*\[\]\?:]/g, ' ')
    .trim()
    .slice(0, 31) || 'Account'
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

  // XLSX export is Pro-only per plan-limits.ts. Previously the route
  // only gated on auth, so any authenticated user with the URL could
  // download their full ledger regardless of tier.
  const { getEffectiveTier } = await import('@/lib/plan-limits')
  const tier = await getEffectiveTier(user.id)
  if (tier !== 'pro') {
    return NextResponse.json(
      { error: 'XLSX export is available on the Pro plan.' },
      { status: 403 },
    )
  }

  // Load bank connections + build account_id -> {bank, account} map.
  const { data: bankConns } = await supabase
    .from('bank_connections')
    .select('bank_name, account_ids, account_display_names')
    .eq('user_id', user.id)

  const accountMap = new Map<string, { bank: string; account: string; tabName: string }>()
  for (const bank of bankConns ?? []) {
    const ids: string[] = bank.account_ids ?? []
    const names: string[] = bank.account_display_names ?? []
    for (let i = 0; i < ids.length; i++) {
      const bankName = bank.bank_name ?? 'Bank'
      const accountName = names[i] ?? ''
      const tabName = accountName ? `${bankName} — ${accountName}` : bankName
      accountMap.set(ids[i], {
        bank: bankName,
        account: accountName,
        tabName: sanitiseSheetName(tabName),
      })
    }
  }

  // Load transactions.
  const { data: transactions, error } = await supabase
    .from('bank_transactions')
    .select('transaction_id, account_id, timestamp, description, merchant_name, amount, category, user_category, income_type, is_recurring')
    .eq('user_id', user.id)
    .eq('is_pending', false)
    .order('timestamp', { ascending: true })

  if (error) {
    console.error('xlsx export query failed:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Paybacker'
  workbook.created = new Date()
  workbook.lastModifiedBy = 'Paybacker'

  // Summary sheet — all transactions across every account.
  const allSheet = workbook.addWorksheet('All transactions', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  allSheet.columns = ALL_COLUMNS
  styleHeader(allSheet.getRow(1))

  // Group transactions by account for the per-account tabs.
  const perAccount = new Map<string, Tx[]>()
  for (const tx of (transactions ?? []) as Tx[]) {
    const key = tx.account_id ?? 'unknown'
    const list = perAccount.get(key) ?? []
    list.push(tx)
    perAccount.set(key, list)

    const acct = accountMap.get(tx.account_id ?? '') ?? { bank: '', account: '', tabName: 'Account' }
    allSheet.addRow({ ...rowFromTx(tx), bank: acct.bank, account: acct.account })
  }

  // Format amount and date columns on the All sheet.
  allSheet.getColumn('amount').numFmt = '£#,##0.00;[Red]-£#,##0.00'
  allSheet.getColumn('date').numFmt   = 'dd/mm/yyyy'

  // Per-account tabs.
  for (const [accountId, txs] of perAccount.entries()) {
    const acct = accountMap.get(accountId) ?? { bank: '', account: '', tabName: sanitiseSheetName(`Account ${accountId.slice(0, 6)}`) }
    // Ensure unique sheet name — append a counter if needed.
    let tabName = acct.tabName
    let counter = 2
    while (workbook.getWorksheet(tabName)) {
      const suffix = ` (${counter})`
      tabName = sanitiseSheetName(acct.tabName.slice(0, 31 - suffix.length) + suffix)
      counter++
    }

    const sheet = workbook.addWorksheet(tabName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    })
    sheet.columns = COLUMNS
    styleHeader(sheet.getRow(1))

    for (const tx of txs) {
      sheet.addRow(rowFromTx(tx))
    }

    sheet.getColumn('amount').numFmt = '£#,##0.00;[Red]-£#,##0.00'
    sheet.getColumn('date').numFmt   = 'dd/mm/yyyy'
  }

  if (perAccount.size === 0) {
    // Edge case: no transactions at all — keep an empty All sheet so the file still opens cleanly.
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const filename = `paybacker-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`

  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
