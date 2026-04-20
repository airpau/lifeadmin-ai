// src/app/api/google-sheets/export/route.ts
//
// Two modes:
//   full_export: true  — writes ALL historical transactions (used on first connect)
//   full_export: false — appends only transactions newer than last_synced_timestamp (daily cron)
//
// Sheet structure: one tab per bank account (account_display_name from bank_connections)
//   Columns: Date | Description | Merchant | Amount | Category | Type | Recurring | Reference
//
// This endpoint is called:
//   1. By the OAuth callback (full_export: true) after initial connection
//   2. By the daily cron /api/cron/google-sheets-sync (full_export: false)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? ''

const SHEET_HEADERS = [
  'Date', 'Description', 'Merchant', 'Amount (£)', 'Category', 'Type', 'Recurring', 'Transaction ID',
]

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
  supabase: any,
  connection: {
    user_id: string
    access_token: string
    refresh_token: string | null
    token_expiry: string | null
  }
): Promise<string | null> {
  const expiry = connection.token_expiry ? new Date(connection.token_expiry) : null
  const isExpired = !expiry || expiry < new Date(Date.now() + 60_000) // refresh if < 1 min left

  if (!isExpired) return connection.access_token

  if (!connection.refresh_token) return null

  const newToken = await refreshAccessToken(connection.refresh_token)
  if (!newToken) return null

  // Update token in DB
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

async function ensureAccountTab(
  token: string,
  spreadsheetId: string,
  accountName: string,
  existingSheets: { title: string; sheetId: number }[]
): Promise<boolean> {
  const exists = existingSheets.find(s => s.title === accountName)
  if (exists) return true

  const addRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: accountName } } }],
    }),
  })
  if (!addRes.ok) {
    const body = await addRes.text().catch(() => '')
    console.error(`[sheets-export] addSheet "${accountName}" ${addRes.status}: ${body.slice(0, 300)}`)
    return false
  }

  return appendRows(token, spreadsheetId, accountName, [SHEET_HEADERS])
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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

async function getExistingSheets(
  token: string,
  spreadsheetId: string
): Promise<{ title: string; sheetId: number }[]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  return (data.sheets ?? []).map((s: { properties: { title: string; sheetId: number } }) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }))
}

function formatTransaction(tx: {
  timestamp: string
  description: string | null
  merchant_name: string | null
  amount: number
  category: string | null
  user_category: string | null
  income_type: string | null
  is_recurring: boolean | null
  transaction_id: string
}): (string | number)[] {
  const date = new Date(tx.timestamp).toLocaleDateString('en-GB') // DD/MM/YYYY
  const description = tx.description ?? ''
  const merchant = tx.merchant_name ?? ''
  const amount = Number(tx.amount.toFixed(2)) // positive = credit, negative = debit
  const category = tx.user_category ?? tx.category ?? ''
  const type = tx.income_type ?? (tx.amount > 0 ? 'Income' : 'Expense')
  const recurring = tx.is_recurring ? 'Yes' : 'No'
  const ref = tx.transaction_id

  return [date, description, merchant, amount, category, type, recurring, ref]
}

export async function POST(req: NextRequest) {
  // Auth: internal key only (called by cron or callback)
  const key = req.headers.get('x-internal-key')
  if (key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json()
  const { user_id, full_export } = body as { user_id?: string; full_export?: boolean }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Load connection(s) — either one user or all (for cron)
  let query = supabase.from('google_sheets_connections').select('*')
  if (user_id) query = query.eq('user_id', user_id)

  const { data: connections, error } = await query
  if (error || !connections?.length) {
    return NextResponse.json({ synced: 0 })
  }

  const results: { user_id: string; rows_written: number; error?: string }[] = []

  for (const conn of connections) {
    try {
      const token = await getOrRefreshToken(supabase, conn)
      if (!token) {
        results.push({ user_id: conn.user_id, rows_written: 0, error: 'token_expired' })
        continue
      }

      // Get all user's bank accounts (one tab per account).
      //
      // Status filter: include both 'active' and 'token_expired'. We are only
      // READING cached transactions out of bank_transactions here — we never
      // call the bank's API — so an expired refresh token doesn't matter.
      // Excluding token_expired previously meant a user whose bank reconnect
      // had lapsed got an empty sheet, even though months of cached
      // transactions were sitting in the DB. Revoked stays excluded
      // (the user actively disconnected and presumably wants the data gone).
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
      let totalRows = 0
      let anyTabSkipped = false

      for (const bank of bankConns) {
        // Each account_id in the connection gets its own tab
        const accountIds: string[] = bank.account_ids ?? []
        const displayNames: string[] = bank.account_display_names ?? []

        for (let i = 0; i < accountIds.length; i++) {
          const accountId = accountIds[i]
          const tabName = displayNames[i]
            ? `${bank.bank_name} — ${displayNames[i]}`
            : bank.bank_name

          // Fetch transactions for this account
          let txQuery = supabase
            .from('bank_transactions')
            .select('transaction_id, timestamp, description, merchant_name, amount, category, user_category, income_type, is_recurring')
            .eq('user_id', conn.user_id)
            .eq('account_id', accountId)
            .eq('is_pending', false)
            .order('timestamp', { ascending: true })
            .order('transaction_id', { ascending: true })

          // Incremental sync: only new transactions
          if (!full_export && conn.last_synced_timestamp) {
            txQuery = txQuery.gt('timestamp', conn.last_synced_timestamp)
          }

          const { data: transactions } = await txQuery

          if (!transactions?.length) continue

          const tabOk = await ensureAccountTab(token, conn.spreadsheet_id, tabName, existingSheets)
          if (!tabOk) {
            console.error(`[sheets-export] skipping "${tabName}" — could not ensure tab`)
            anyTabSkipped = true
            continue
          }

          const rows = transactions.map(formatTransaction)
          const appendOk = await appendRows(token, conn.spreadsheet_id, tabName, rows)
          if (!appendOk) {
            anyTabSkipped = true
            continue
          }
          totalRows += rows.length

          // Track newest timestamp written — only advanced if tab succeeded.
          const newestTs = transactions[transactions.length - 1].timestamp
          if (!conn.last_synced_timestamp || newestTs > conn.last_synced_timestamp) {
            conn.last_synced_timestamp = newestTs
          }
        }
      }

      // Update sync metadata. If any tab was skipped due to an error, do NOT advance
      // last_synced_timestamp: those skipped tabs would permanently lose transactions
      // that fell before the new watermark on the next incremental sync.
      const syncUpdate: Record<string, string> = {
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (!anyTabSkipped) {
        syncUpdate.last_synced_timestamp = conn.last_synced_timestamp
      } else {
        console.warn(
          `[sheets-export] user=${conn.user_id} had tab errors — watermark NOT advanced to prevent data loss on next sync`
        )
      }
      await supabase
        .from('google_sheets_connections')
        .update(syncUpdate)
        .eq('user_id', conn.user_id)

      results.push({ user_id: conn.user_id, rows_written: totalRows })
    } catch (err) {
      console.error(`Sheets export failed for user ${conn.user_id}:`, err)
      results.push({ user_id: conn.user_id, rows_written: 0, error: String(err) })
    }
  }

  return NextResponse.json({ synced: results.length, results })
}
