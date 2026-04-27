// src/app/api/google-sheets/export/route.ts
//
// Exports bank_transactions to a user's connected Google Sheet.
//
// Two modes:
//   full_export: true  — considers ALL historical transactions (used on first connect)
//   full_export: false — only considers transactions near/after last_synced_timestamp
//                         (daily cron / Sync Now button)
//
// In BOTH modes, writes are deduplicated against transaction IDs already present
// in the sheet (column H). This makes the export idempotent — running it twice in
// a row never produces duplicate rows, and it self-heals gaps from previous runs.
//
// Sheet structure: one tab per bank account (account_display_name from bank_connections)
//   Columns: Date | Description | Merchant | Amount | Category | Type | Recurring | Transaction ID
//
// Called by:
//   1. /api/google-sheets/sync-now (user-triggered Sync Now button)
//   2. /api/cron/google-sheets-sync (daily 6am safety-net cron)
//   3. triggerSheetsExport helper (post bank-sync)

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? ''

const SHEET_HEADERS = [
  'Date', 'Description', 'Merchant', 'Amount (£)', 'Category', 'Type', 'Recurring', 'Transaction ID',
]

// Supabase PostgREST caps selects at 1000 rows by default. Paginate by this size.
const DB_PAGE_SIZE = 1000

// When running incrementally, how far back to look when re-fetching from the DB.
// This is a safety overlap — bank syncs sometimes back-date transactions by a day
// or two after initial settle. Dedup by transaction_id means overlap is harmless.
const INCREMENTAL_OVERLAP_DAYS = 2

// ---------------------------------------------------------------------------
// OAuth token refresh
// ---------------------------------------------------------------------------

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token ?? null
}

async function getOrRefreshToken(
  supabase: SupabaseClient,
  connection: {
    user_id: string
    access_token: string
    refresh_token: string | null
    token_expiry: string | null
  }
): Promise<string | null> {
  const expiry = connection.token_expiry ? new Date(connection.token_expiry) : null
  const isExpired = !expiry || expiry < new Date(Date.now() + 60_000)

  if (!isExpired) return connection.access_token

  if (!connection.refresh_token) return null

  const newToken = await refreshAccessToken(connection.refresh_token)
  if (!newToken) return null

  await supabase
    .from('google_sheets_connections')
    .update({
      access_token: newToken,
      token_expiry: new Date(Date.now() + 3600_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', connection.user_id)

  return newToken
}

// ---------------------------------------------------------------------------
// Google Sheets helpers (all check response status — no silent failures)
// ---------------------------------------------------------------------------

async function getExistingSheets(
  token: string,
  spreadsheetId: string
): Promise<{ title: string; sheetId: number }[] | null> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[sheets-export] getExistingSheets ${res.status}: ${body.slice(0, 300)}`)
    return null
  }
  const data = await res.json()
  return (data.sheets ?? []).map((s: { properties: { title: string; sheetId: number } }) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }))
}

async function ensureAccountTab(
  token: string,
  spreadsheetId: string,
  accountName: string,
  existingSheets: { title: string; sheetId: number }[]
): Promise<boolean> {
  const exists = existingSheets.find(s => s.title === accountName)
  if (exists) return true

  const addRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: accountName } } }],
      }),
    }
  )
  if (!addRes.ok) {
    const body = await addRes.text().catch(() => '')
    console.error(`[sheets-export] addSheet "${accountName}" ${addRes.status}: ${body.slice(0, 300)}`)
    return false
  }

  // Track the newly-created tab so subsequent lookups on the same run see it.
  const addData = await addRes.json().catch(() => null)
  const newSheetId = addData?.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
  existingSheets.push({ title: accountName, sheetId: newSheetId })

  // Write the header row.
  const headerOk = await appendRows(token, spreadsheetId, accountName, [SHEET_HEADERS])
  return headerOk
}

async function appendRows(
  token: string,
  spreadsheetId: string,
  sheetName: string,
  rows: (string | number)[][]
): Promise<boolean> {
  if (rows.length === 0) return true

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[sheets-export] appendRows "${sheetName}" (${rows.length} rows) ${res.status}: ${body.slice(0, 300)}`)
    return false
  }
  return true
}

/**
 * Read column H (Transaction ID) from the given tab and return a Set of IDs
 * already present in the sheet. Returns null on read failure — callers must
 * treat null as "unsafe to write" and skip appending, otherwise we'd risk
 * creating duplicates.
 */
async function readExistingTransactionIds(
  token: string,
  spreadsheetId: string,
  tabName: string
): Promise<Set<string> | null> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}!H:H?majorDimension=COLUMNS`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[sheets-export] readExistingTransactionIds "${tabName}" ${res.status}: ${body.slice(0, 300)}`)
    return null
  }
  const data = await res.json()
  // values is an array of columns; with COLUMNS major dim and a single column
  // request, values[0] is the list of cell values in column H.
  const col: string[] = data.values?.[0] ?? []
  const ids = new Set<string>()
  for (const v of col) {
    if (v && v !== 'Transaction ID') ids.add(v)
  }
  return ids
}

// ---------------------------------------------------------------------------
// Transaction fetch (paginated — Supabase's default 1000-row cap would
// otherwise silently truncate large accounts)
// ---------------------------------------------------------------------------

type TxRow = {
  transaction_id: string
  timestamp: string
  description: string | null
  merchant_name: string | null
  amount: number
  category: string | null
  user_category: string | null
  income_type: string | null
  is_recurring: boolean | null
  is_pending: boolean | null
}

async function fetchAllTransactions(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  sinceTimestamp: string | null
): Promise<TxRow[]> {
  // Pending transactions are included so the sheet stays current with the
  // dashboard. Previously this filtered to is_pending=false, which left
  // multi-day gaps any time recent activity was unsettled (e.g. a card
  // payment posted at 03:00 stays pending for 24-72h until the bank
  // settles). Users were seeing "latest entry: 24 April" on 27 April
  // because all of 25-27's activity was still in pending state.
  //
  // The Type column tags pending rows so the user can distinguish them
  // from settled. The dedup-by-transaction_id in the calling export
  // collapses the same row when it later appears as settled — accepting
  // that the Type label may stay "Pending" until a full re-export.
  const all: TxRow[] = []
  let from = 0
  while (true) {
    let q = supabase
      .from('bank_transactions')
      .select('transaction_id, timestamp, description, merchant_name, amount, category, user_category, income_type, is_recurring, is_pending')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .is('deleted_at', null)
      .order('timestamp', { ascending: true })
      .range(from, from + DB_PAGE_SIZE - 1)
    if (sinceTimestamp) q = q.gte('timestamp', sinceTimestamp)

    const { data, error } = await q
    if (error) {
      console.error(`[sheets-export] fetchAllTransactions user=${userId} acct=${accountId}:`, error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...(data as TxRow[]))
    if (data.length < DB_PAGE_SIZE) break
    from += DB_PAGE_SIZE
  }
  return all
}

// ---------------------------------------------------------------------------
// Row formatting
// ---------------------------------------------------------------------------

function formatTransaction(tx: TxRow): (string | number)[] {
  const date = new Date(tx.timestamp).toLocaleDateString('en-GB') // DD/MM/YYYY
  const description = tx.description ?? ''
  const merchant = tx.merchant_name ?? ''
  const amount = Number(tx.amount.toFixed(2))
  const category = tx.user_category ?? tx.category ?? ''
  // Pending transactions are flagged in the Type column so the user can
  // distinguish settled vs unsettled at a glance. The amount sign still
  // tells them income/expense, the prefix tells them it's not final yet.
  const baseType = tx.income_type ?? (tx.amount > 0 ? 'Income' : 'Expense')
  const type = tx.is_pending ? `Pending ${baseType.toLowerCase()}` : baseType
  const recurring = tx.is_recurring ? 'Yes' : 'No'
  const ref = tx.transaction_id

  return [date, description, merchant, amount, category, type, recurring, ref]
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  // Auth: internal key only (called by cron, callback, or sync-now wrapper)
  const key = req.headers.get('x-internal-key')
  if (key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const { user_id, full_export } = body as { user_id?: string; full_export?: boolean }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  let query = supabase.from('google_sheets_connections').select('*')
  if (user_id) query = query.eq('user_id', user_id)

  const { data: connections, error } = await query
  if (error || !connections?.length) {
    return NextResponse.json({ synced: 0 })
  }

  const results: { user_id: string; rows_written: number; skipped_tabs?: number; error?: string }[] = []

  for (const conn of connections) {
    try {
      const token = await getOrRefreshToken(supabase, conn)
      if (!token) {
        results.push({ user_id: conn.user_id, rows_written: 0, error: 'token_expired' })
        continue
      }

      // All bank_connections EXCEPT revoked. Revoked = user deliberately disconnected.
      // token_expired is fine: we only read cached bank_transactions, never the bank API.
      const { data: bankConns } = await supabase
        .from('bank_connections')
        .select('id, bank_name, account_ids, account_display_names')
        .eq('user_id', conn.user_id)
        .in('status', ['active', 'token_expired'])

      if (!bankConns?.length) {
        results.push({ user_id: conn.user_id, rows_written: 0 })
        continue
      }

      const existingSheets = await getExistingSheets(token, conn.spreadsheet_id)
      if (existingSheets === null) {
        results.push({ user_id: conn.user_id, rows_written: 0, error: 'sheets_metadata_read_failed' })
        continue
      }

      // Incremental: fetch rows from (last_synced - overlap) onwards. The sheet-side
      // dedup (readExistingTransactionIds) catches anything we re-fetch.
      // Full export: sinceTimestamp = null → pull every transaction for the account.
      let sinceTimestamp: string | null = null
      if (!full_export && conn.last_synced_timestamp) {
        const lowerBound = new Date(
          new Date(conn.last_synced_timestamp).getTime() - INCREMENTAL_OVERLAP_DAYS * 24 * 60 * 60 * 1000
        )
        sinceTimestamp = lowerBound.toISOString()
      }

      let totalRows = 0
      let skippedTabs = 0
      let latestTimestampWritten: string | null = conn.last_synced_timestamp ?? null

      for (const bank of bankConns) {
        const accountIds: string[] = bank.account_ids ?? []
        const displayNames: string[] = bank.account_display_names ?? []

        for (let i = 0; i < accountIds.length; i++) {
          const accountId = accountIds[i]
          const tabName = displayNames[i]
            ? `${bank.bank_name} — ${displayNames[i]}`
            : bank.bank_name

          // Pull transactions (paginated) for this account.
          const transactions = await fetchAllTransactions(
            supabase,
            conn.user_id,
            accountId,
            sinceTimestamp
          )
          if (transactions.length === 0) continue

          // Make sure the tab (and header row) exist before we try to read column H.
          const tabOk = await ensureAccountTab(token, conn.spreadsheet_id, tabName, existingSheets)
          if (!tabOk) {
            console.error(`[sheets-export] skipping "${tabName}" — could not ensure tab`)
            skippedTabs++
            continue
          }

          // Dedup by transaction_id. If we can't read the existing IDs, skip
          // this tab rather than risk writing duplicates.
          const existingIds = await readExistingTransactionIds(
            token,
            conn.spreadsheet_id,
            tabName
          )
          if (existingIds === null) {
            console.error(`[sheets-export] skipping "${tabName}" — could not read existing transaction IDs`)
            skippedTabs++
            continue
          }

          const newTxs = transactions.filter(tx => !existingIds.has(tx.transaction_id))
          if (newTxs.length === 0) continue

          const rows = newTxs.map(formatTransaction)
          const appendOk = await appendRows(token, conn.spreadsheet_id, tabName, rows)
          if (!appendOk) {
            skippedTabs++
            continue
          }
          totalRows += rows.length

          // Track newest timestamp actually written across all accounts.
          const newestTs = newTxs[newTxs.length - 1].timestamp
          if (!latestTimestampWritten || newestTs > latestTimestampWritten) {
            latestTimestampWritten = newestTs
          }
        }
      }

      // Update sync metadata. We only bump last_synced_timestamp forward, never
      // backwards — this is defensive against a partial-failure run where we
      // only wrote a subset of accounts.
      const updates: Record<string, string> = {
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (latestTimestampWritten && latestTimestampWritten !== conn.last_synced_timestamp) {
        updates.last_synced_timestamp = latestTimestampWritten
      }
      await supabase
        .from('google_sheets_connections')
        .update(updates)
        .eq('user_id', conn.user_id)

      console.log(
        `[sheets-export] user=${conn.user_id} wrote=${totalRows} skipped_tabs=${skippedTabs} full=${!!full_export}`
      )
      results.push({ user_id: conn.user_id, rows_written: totalRows, skipped_tabs: skippedTabs })
    } catch (err) {
      console.error(`[sheets-export] failed for user ${conn.user_id}:`, err)
      results.push({ user_id: conn.user_id, rows_written: 0, error: String(err) })
    }
  }

  return NextResponse.json({ synced: results.length, results })
}
