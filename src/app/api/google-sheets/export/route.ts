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

// A full backfill (thousands of rows across several tabs) makes many Sheets
// API calls and can take tens of seconds. Without an explicit maxDuration the
// function can be killed mid-export, leaving the sheet partially written
// while the caller reports a sync that never completed.
export const runtime = 'nodejs'
export const maxDuration = 60

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

// A refresh either succeeds, fails permanently (the user revoked access or the
// refresh token expired — only a reconnect fixes it), or fails transiently
// (Google 5xx, network blip — retrying tomorrow is fine). Collapsing all three
// into `null` was why a dead refresh token looked like a no-op sync.
type TokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'token_expired' | 'token_refresh_failed' }

async function refreshAccessToken(refreshToken: string): Promise<TokenResult> {
  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } catch (err) {
    console.error('[sheets-export] refreshAccessToken network failure:', err)
    return { ok: false, reason: 'token_refresh_failed' }
  }

  const raw = await res.text().catch(() => '')

  if (!res.ok) {
    console.error(`[sheets-export] refreshAccessToken ${res.status}: ${raw.slice(0, 300)}`)
    // invalid_grant = revoked consent, expired refresh token (Google expires
    // refresh tokens after 7 days while the OAuth app is in Testing mode), or
    // a password change. Permanent — the user must reconnect.
    if (raw.includes('invalid_grant')) return { ok: false, reason: 'token_expired' }
    return { ok: false, reason: 'token_refresh_failed' }
  }

  let data: { access_token?: string }
  try {
    data = JSON.parse(raw)
  } catch {
    console.error(`[sheets-export] refreshAccessToken unparseable body: ${raw.slice(0, 300)}`)
    return { ok: false, reason: 'token_refresh_failed' }
  }

  if (!data.access_token) {
    console.error(`[sheets-export] refreshAccessToken 200 with no access_token: ${raw.slice(0, 300)}`)
    return { ok: false, reason: 'token_refresh_failed' }
  }

  return { ok: true, token: data.access_token }
}

async function getOrRefreshToken(
  supabase: SupabaseClient,
  connection: {
    user_id: string
    access_token: string
    refresh_token: string | null
    token_expiry: string | null
  }
): Promise<TokenResult> {
  const expiry = connection.token_expiry ? new Date(connection.token_expiry) : null
  const isExpired = !expiry || expiry < new Date(Date.now() + 60_000)

  if (!isExpired) return { ok: true, token: connection.access_token }

  // No refresh token at all — nothing to refresh with, user must reconnect.
  if (!connection.refresh_token) {
    console.error(`[sheets-export] user=${connection.user_id} has no refresh_token — reconnect required`)
    return { ok: false, reason: 'token_expired' }
  }

  const refreshed = await refreshAccessToken(connection.refresh_token)
  if (!refreshed.ok) return refreshed

  await supabase
    .from('google_sheets_connections')
    .update({
      access_token: refreshed.token,
      token_expiry: new Date(Date.now() + 3600_000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', connection.user_id)

  return refreshed
}

// ---------------------------------------------------------------------------
// Google Sheets helpers (all check response status — no silent failures)
// ---------------------------------------------------------------------------

type SheetsMetaResult =
  | { ok: true; sheets: { title: string; sheetId: number }[] }
  // 404 / 410 = the spreadsheet is gone (user deleted or trashed it). Recoverable
  // by creating a fresh one — see createSpreadsheet below.
  | { ok: false; missing: boolean }

async function getExistingSheets(
  token: string,
  spreadsheetId: string
): Promise<SheetsMetaResult> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[sheets-export] getExistingSheets ${res.status}: ${body.slice(0, 300)}`)
    return { ok: false, missing: res.status === 404 || res.status === 410 }
  }
  const data = await res.json()
  return {
    ok: true,
    sheets: (data.sheets ?? []).map((s: { properties: { title: string; sheetId: number } }) => ({
      title: s.properties.title,
      sheetId: s.properties.sheetId,
    })),
  }
}

/**
 * Create a fresh Paybacker spreadsheet in the user's Drive. Mirrors the
 * creation logic in /api/auth/google-sheets/callback — kept in step with it.
 * Used to self-heal when the stored spreadsheet_id no longer resolves.
 */
async function createSpreadsheet(
  token: string,
  title: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string } | null> {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Summary' } }], // placeholder; account tabs added below
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[sheets-export] createSpreadsheet ${res.status}: ${body.slice(0, 300)}`)
    return null
  }
  const sheet = await res.json()
  if (!sheet.spreadsheetId) {
    console.error('[sheets-export] createSpreadsheet returned no spreadsheetId')
    return null
  }
  return { spreadsheetId: sheet.spreadsheetId, spreadsheetUrl: sheet.spreadsheetUrl ?? '' }
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

  const results: {
    user_id: string
    rows_written: number
    skipped_tabs?: number
    error?: string
    recreated_spreadsheet?: boolean
  }[] = []

  for (const conn of connections) {
    try {
      const tokenResult = await getOrRefreshToken(supabase, conn)
      if (!tokenResult.ok) {
        results.push({ user_id: conn.user_id, rows_written: 0, error: tokenResult.reason })
        continue
      }
      const token = tokenResult.token

      // Every bank connection EXCEPT permanently-dead ones. This export only
      // reads cached rows from bank_transactions and never calls the bank API,
      // so live consent state is irrelevant to it.
      //
      // Previously this filtered to ['active','token_expired'], which silently
      // dropped every user in expiring_soon / expired / expired_legacy — states
      // the daily consent-renewal cron routinely sets because Open Banking
      // consent rolls every 90 days. Those users got rows_written: 0 with no
      // error, so the UI reported "All caught up" forever.
      const { data: allBankConns } = await supabase
        .from('bank_connections')
        .select('id, bank_name, account_ids, account_display_names, status')
        .eq('user_id', conn.user_id)

      const DEAD_STATUSES = ['revoked', 'revoked_duplicate', 'archived']
      const bankConns = (allBankConns ?? []).filter(
        (b) => !DEAD_STATUSES.includes(String(b.status ?? ''))
      )

      if (!bankConns.length) {
        // Make this visible rather than reporting a clean zero-row sync.
        results.push({ user_id: conn.user_id, rows_written: 0, error: 'no_bank_connections' })
        continue
      }

      // Self-heal: if the stored spreadsheet no longer resolves (user deleted or
      // trashed it), create a fresh one, repoint the connection, and treat the
      // run as a full backfill so the new sheet isn't left half-empty.
      let spreadsheetId: string = conn.spreadsheet_id
      let recreatedSpreadsheet = false
      let forceFullExport = false

      let meta = await getExistingSheets(token, spreadsheetId)
      if (!meta.ok && meta.missing) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, first_name')
          .eq('id', conn.user_id)
          .maybeSingle()
        const displayName =
          profile?.first_name || profile?.full_name || conn.email || 'Your transactions'

        const created = await createSpreadsheet(token, `Paybacker — ${displayName}`)
        if (!created) {
          results.push({ user_id: conn.user_id, rows_written: 0, error: 'sheets_metadata_read_failed' })
          continue
        }

        await supabase
          .from('google_sheets_connections')
          .update({
            spreadsheet_id: created.spreadsheetId,
            spreadsheet_url: created.spreadsheetUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', conn.user_id)

        spreadsheetId = created.spreadsheetId
        recreatedSpreadsheet = true
        forceFullExport = true
        console.log(
          `[sheets-export] user=${conn.user_id} spreadsheet missing — recreated as ${created.spreadsheetId}`
        )

        meta = await getExistingSheets(token, spreadsheetId)
      }

      if (!meta.ok) {
        results.push({
          user_id: conn.user_id,
          rows_written: 0,
          error: 'sheets_metadata_read_failed',
          ...(recreatedSpreadsheet ? { recreated_spreadsheet: true } : {}),
        })
        continue
      }
      const existingSheets = meta.sheets

      // Incremental: fetch rows from (last_synced - overlap) onwards. The sheet-side
      // dedup (readExistingTransactionIds) catches anything we re-fetch.
      // Full export: sinceTimestamp = null → pull every transaction for the account.
      let sinceTimestamp: string | null = null
      if (!full_export && !forceFullExport && conn.last_synced_timestamp) {
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
          const tabOk = await ensureAccountTab(token, spreadsheetId, tabName, existingSheets)
          if (!tabOk) {
            console.error(`[sheets-export] skipping "${tabName}" — could not ensure tab`)
            skippedTabs++
            continue
          }

          // Dedup by transaction_id. If we can't read the existing IDs, skip
          // this tab rather than risk writing duplicates.
          const existingIds = await readExistingTransactionIds(
            token,
            spreadsheetId,
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
          const appendOk = await appendRows(token, spreadsheetId, tabName, rows)
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

      // Only stamp the sync metadata when the run genuinely succeeded — either
      // we wrote rows, or it was a clean pass with nothing new and no skipped
      // tabs. Stamping last_synced_at on a failed run permanently downgrades
      // every future Sync Now from full backfill to incremental, so the user
      // can never recover from a bad first sync.
      const runSucceeded = totalRows > 0 || skippedTabs === 0

      if (runSucceeded) {
        // We only bump last_synced_timestamp forward, never backwards — this is
        // defensive against a partial-failure run where we only wrote a subset
        // of accounts.
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
      } else {
        console.error(
          `[sheets-export] user=${conn.user_id} skipped ${skippedTabs} tab(s) and wrote nothing — not stamping last_synced_at`
        )
      }

      console.log(
        `[sheets-export] user=${conn.user_id} wrote=${totalRows} skipped_tabs=${skippedTabs} full=${!!full_export || forceFullExport} recreated=${recreatedSpreadsheet}`
      )
      results.push({
        user_id: conn.user_id,
        rows_written: totalRows,
        skipped_tabs: skippedTabs,
        ...(recreatedSpreadsheet ? { recreated_spreadsheet: true } : {}),
      })
    } catch (err) {
      console.error(`[sheets-export] failed for user ${conn.user_id}:`, err)
      results.push({ user_id: conn.user_id, rows_written: 0, error: String(err) })
    }
  }

  return NextResponse.json({ synced: results.length, results })
}
