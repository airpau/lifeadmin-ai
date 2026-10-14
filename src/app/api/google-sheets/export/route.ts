// src/app/api/google-sheets/export/route.ts
//
// Exports bank_transactions to a user's connected Google Sheet.
//
// Two modes:
//   full_export: true  - considers ALL historical transactions (first connect,
//                        recreated sheet, or a Sync Now with no previous sync)
//   full_export: false - only transactions INGESTED (created_at) since the last
//                        successful sync, minus a 2 day overlap
//
// In BOTH modes, writes are deduplicated against transaction IDs already present
// anywhere in the spreadsheet (column H of every tab), and only one run per user
// can write at a time (lease on next_sync_at). Re-running never duplicates rows.
// Pure selection logic lives in src/lib/export/transactions-export.ts.
//
// Sheet structure: one tab per bank account, including accounts that only
// belong to a revoked or replaced bank connection (their history is still the
// user's). Tab name "<bank> - <account name>".
//   Columns: Date | Description | Merchant | Amount | Category | Type | Recurring | Transaction ID
//
// Called by:
//   1. /api/google-sheets/sync-now (user-triggered Sync Now button)
//   2. /api/cron/google-sheets-sync (daily 6am safety-net cron)
//   3. triggerSheetsExport helper (post bank-sync)

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  SHEET_HEADERS,
  a1Range,
  buildAccountMap,
  connectionHealthUpdate,
  groupByTab,
  idsFromColumn,
  incrementalCreatedSince,
  nextNewestWatermark,
  runSucceeded,
  selectNewRows,
  sheetRow,
  type BankConnLike,
  type ExportTx,
} from '@/lib/export/transactions-export'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? ''

// A full backfill (thousands of rows across several tabs) makes many Sheets
// API calls and can take tens of seconds. Without an explicit maxDuration the
// function can be killed mid-export, leaving the sheet partially written
// while the caller reports a sync that never completed.
export const runtime = 'nodejs'
// 300, not 60: the daily cron runs every connected user through one call.
export const maxDuration = 300

// Supabase PostgREST caps selects at 1000 rows by default. Paginate by this size.
const DB_PAGE_SIZE = 1000

// Rows per Sheets append request.
const APPEND_CHUNK = 2000

// ---------------------------------------------------------------------------
// OAuth token refresh
// ---------------------------------------------------------------------------

// A refresh either succeeds, fails permanently (the user revoked access or the
// refresh token expired — only a reconnect fixes it), or fails transiently
// (Google 5xx, network blip — retrying tomorrow is fine). Collapsing all three
// into `null` was why a dead refresh token looked like a no-op sync.
type TokenResult =
  | { ok: true; token: string; expiresIn?: number; refreshToken?: string }
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

  let data: { access_token?: string; expires_in?: number; refresh_token?: string }
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

  return {
    ok: true,
    token: data.access_token,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : undefined,
    // Google may rotate the refresh token; keep the new one if it does.
    refreshToken: data.refresh_token || undefined,
  }
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
      token_expiry: new Date(Date.now() + (refreshed.expiresIn ?? 3600) * 1000).toISOString(),
      ...(refreshed.refreshToken ? { refresh_token: refreshed.refreshToken } : {}),
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

/**
 * Make sure the tab exists (with a header row). If only the legacy em dash
 * name exists, rename it in place so its rows (and their transaction ids)
 * are kept and nothing is written twice.
 */
async function ensureAccountTab(
  token: string,
  spreadsheetId: string,
  tabName: string,
  legacyTabName: string | null,
  existingSheets: { title: string; sheetId: number }[]
): Promise<boolean> {
  if (existingSheets.find(s => s.title === tabName)) return true

  const legacy = legacyTabName && legacyTabName !== tabName
    ? existingSheets.find(s => s.title === legacyTabName)
    : undefined
  if (legacy) {
    const renameRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            updateSheetProperties: {
              properties: { sheetId: legacy.sheetId, title: tabName },
              fields: 'title',
            },
          }],
        }),
      }
    )
    if (renameRes.ok) {
      legacy.title = tabName
      return true
    }
    // Rename failed: keep writing to the legacy tab rather than splitting history.
    const body = await renameRes.text().catch(() => '')
    console.error(`[sheets-export] rename "${legacyTabName}" ${renameRes.status}: ${body.slice(0, 300)}`)
    return false
  }

  const addRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: tabName } } }],
      }),
    }
  )
  if (!addRes.ok) {
    const body = await addRes.text().catch(() => '')
    console.error(`[sheets-export] addSheet "${tabName}" ${addRes.status}: ${body.slice(0, 300)}`)
    return false
  }

  // Track the newly-created tab so subsequent lookups on the same run see it.
  const addData = await addRes.json().catch(() => null)
  const newSheetId = addData?.replies?.[0]?.addSheet?.properties?.sheetId ?? 0
  existingSheets.push({ title: tabName, sheetId: newSheetId })

  return appendRows(token, spreadsheetId, tabName, [SHEET_HEADERS])
}

async function appendRows(
  token: string,
  spreadsheetId: string,
  sheetName: string,
  rows: (string | number)[][]
): Promise<boolean> {
  if (rows.length === 0) return true

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(a1Range(sheetName, 'A1'))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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
 * Read column H (Transaction ID) from EVERY tab in one batchGet and return
 * the ids already in the spreadsheet. Dedup is spreadsheet-wide, so a row can
 * never be written twice even if an account's tab name changes. Returns null
 * on read failure: callers must treat that as "unsafe to write".
 */
async function readAllTransactionIds(
  token: string,
  spreadsheetId: string,
  tabTitles: string[]
): Promise<Set<string> | null> {
  const ids = new Set<string>()
  // Keep URLs a sane length on workbooks with many tabs.
  for (let i = 0; i < tabTitles.length; i += 50) {
    const params = new URLSearchParams({ majorDimension: 'COLUMNS' })
    for (const t of tabTitles.slice(i, i + 50)) params.append('ranges', a1Range(t, 'H:H'))
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[sheets-export] readAllTransactionIds ${res.status}: ${body.slice(0, 300)}`)
      return null
    }
    const data = await res.json()
    for (const vr of (data.valueRanges ?? []) as { values?: unknown }[]) {
      for (const id of idsFromColumn(vr.values)) ids.add(id)
    }
  }
  return ids
}

// ---------------------------------------------------------------------------
// Transaction fetch (paginated with a stable order)
// ---------------------------------------------------------------------------

/**
 * Every live transaction for the user, across ALL accounts (including
 * accounts that only belong to a revoked or replaced bank connection), that
 * was ingested on or after createdSince (null = everything).
 *
 * Pending rows are included so the sheet stays current with the dashboard;
 * the Type column marks them.
 *
 * Ordered by timestamp then id: id is unique, so offset pages never skip or
 * repeat rows when many transactions share a timestamp. Returns null on a DB
 * error so the caller does not stamp a sync that read nothing.
 */
async function fetchTransactions(
  supabase: SupabaseClient,
  userId: string,
  createdSince: string | null
): Promise<ExportTx[] | null> {
  const all: ExportTx[] = []
  let from = 0
  while (true) {
    let q = supabase
      .from('bank_transactions')
      .select('id, transaction_id, account_id, timestamp, created_at, description, merchant_name, amount, category, user_category, income_type, is_recurring, is_pending')
      .eq('user_id', userId)
      .is('deleted_at', null)
    if (createdSince) q = q.gte('created_at', createdSince)
    const { data, error } = await q
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + DB_PAGE_SIZE - 1)

    if (error) {
      console.error(`[sheets-export] fetchTransactions user=${userId}:`, error.message)
      return null
    }
    if (!data || data.length === 0) break
    all.push(...(data as ExportTx[]))
    if (data.length < DB_PAGE_SIZE) break
    from += DB_PAGE_SIZE
  }
  return all
}

// ---------------------------------------------------------------------------
// Per-user run lease (no duplicate rows from overlapping runs)
// ---------------------------------------------------------------------------
//
// The export is triggered after every bank sync, by Sync Now and by the daily
// cron. Two runs for the same user at once would both read column H before
// either appends, and both would write the same rows. next_sync_at (unused
// until now) is used as a short lease: a run claims it only if it is empty or
// in the past, and releases it when done. A crashed run frees itself after
// LEASE_MS.

const LEASE_MS = 6 * 60 * 1000

async function claimLease(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('google_sheets_connections')
    .update({ next_sync_at: new Date(Date.now() + LEASE_MS).toISOString() })
    .eq('user_id', userId)
    .or(`next_sync_at.is.null,next_sync_at.lt.${nowIso}`)
    .select('user_id')
  if (error) {
    // Fail open: a lease problem must not stop syncing altogether. Column H
    // dedup still protects against everything except a true overlap.
    console.error(`[sheets-export] claimLease user=${userId}:`, error.message)
    return true
  }
  return (data?.length ?? 0) > 0
}

async function releaseLease(supabase: SupabaseClient, userId: string): Promise<void> {
  await supabase
    .from('google_sheets_connections')
    .update({ next_sync_at: new Date().toISOString() })
    .eq('user_id', userId)
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

type UserResult = {
  user_id: string
  rows_written: number
  skipped_tabs?: number
  error?: string
  recreated_spreadsheet?: boolean
}

type SheetsConn = {
  user_id: string
  email: string | null
  access_token: string
  refresh_token: string | null
  token_expiry: string | null
  spreadsheet_id: string | null
  last_synced_at: string | null
  last_synced_timestamp: string | null
  status: string | null
}

async function exportForUser(
  supabase: SupabaseClient,
  conn: SheetsConn,
  fullExportRequested: boolean,
): Promise<UserResult> {
  const tokenResult = await getOrRefreshToken(supabase, conn)
  if (!tokenResult.ok) {
    return { user_id: conn.user_id, rows_written: 0, error: tokenResult.reason }
  }
  const token = tokenResult.token

  // Every bank connection, whatever its state. This export only reads cached
  // rows from bank_transactions, so consent state is irrelevant; a revoked or
  // replaced connection still names the accounts its history sits under.
  const { data: allBankConns } = await supabase
    .from('bank_connections')
    .select('bank_name, account_ids, account_display_names, status')
    .eq('user_id', conn.user_id)
  const accounts = buildAccountMap((allBankConns ?? []) as BankConnLike[])

  // Self-heal: if the stored spreadsheet no longer resolves (user deleted or
  // trashed it), create a fresh one, repoint the connection, and treat the
  // run as a full backfill so the new sheet isn't left half-empty.
  let spreadsheetId: string = conn.spreadsheet_id ?? ''
  let recreatedSpreadsheet = false
  let forceFullExport = false

  let meta: SheetsMetaResult = spreadsheetId
    ? await getExistingSheets(token, spreadsheetId)
    : { ok: false, missing: true }
  if (!meta.ok && meta.missing) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, first_name')
      .eq('id', conn.user_id)
      .maybeSingle()
    const displayName =
      profile?.first_name || profile?.full_name || conn.email || 'Your transactions'

    const created = await createSpreadsheet(token, `Paybacker transactions (${displayName})`)
    if (!created) {
      return { user_id: conn.user_id, rows_written: 0, error: 'sheets_metadata_read_failed' }
    }

    await supabase
      .from('google_sheets_connections')
      .update({
        spreadsheet_id: created.spreadsheetId,
        spreadsheet_url: created.spreadsheetUrl,
        last_synced_timestamp: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', conn.user_id)

    spreadsheetId = created.spreadsheetId
    recreatedSpreadsheet = true
    forceFullExport = true
    console.log(
      `[sheets-export] user=${conn.user_id} spreadsheet missing, recreated as ${created.spreadsheetId}`
    )

    meta = await getExistingSheets(token, spreadsheetId)
  }

  const recreatedFlag = recreatedSpreadsheet ? { recreated_spreadsheet: true } : {}
  if (!meta.ok) {
    return { user_id: conn.user_id, rows_written: 0, error: 'sheets_metadata_read_failed', ...recreatedFlag }
  }
  const existingSheets = meta.sheets

  // Incremental window on INGESTION time (created_at), not transaction date:
  // a newly connected or reconnected bank backfills months of older-dated
  // rows, and those must reach the sheet too. Column H dedup makes the
  // overlap (and any re-run) harmless.
  const fullExport = fullExportRequested || forceFullExport
  const createdSince = incrementalCreatedSince(conn.last_synced_at, fullExport)
  const startedAt = new Date().toISOString()

  const transactions = await fetchTransactions(supabase, conn.user_id, createdSince)
  if (transactions === null) {
    return { user_id: conn.user_id, rows_written: 0, error: 'transactions_read_failed', ...recreatedFlag }
  }

  // A connection with no bank accounts and no history at all.
  if (transactions.length === 0 && accounts.size === 0) {
    return { user_id: conn.user_id, rows_written: 0, error: 'no_bank_connections', ...recreatedFlag }
  }

  // Ids already anywhere in the spreadsheet. If this read fails nothing is
  // written, because writing blind is how duplicates happen.
  const existingIds = await readAllTransactionIds(token, spreadsheetId, existingSheets.map(s => s.title))
  if (existingIds === null) {
    return { user_id: conn.user_id, rows_written: 0, error: 'sheets_read_failed', ...recreatedFlag }
  }

  let totalRows = 0
  let skippedTabs = 0
  const written: ExportTx[] = []

  for (const batch of groupByTab(transactions, accounts)) {
    const newTxs = selectNewRows(batch.txs, existingIds)
    if (newTxs.length === 0) continue

    const tabOk = await ensureAccountTab(token, spreadsheetId, batch.tabName, batch.legacyTabName, existingSheets)
    if (!tabOk) {
      console.error(`[sheets-export] skipping "${batch.tabName}": could not ensure tab`)
      skippedTabs++
      continue
    }

    // Large backfills go in chunks so one request never carries tens of
    // thousands of cells.
    let tabFailed = false
    for (let i = 0; i < newTxs.length; i += APPEND_CHUNK) {
      const chunk = newTxs.slice(i, i + APPEND_CHUNK)
      const ok = await appendRows(token, spreadsheetId, batch.tabName, chunk.map(sheetRow))
      if (!ok) { tabFailed = true; break }
      totalRows += chunk.length
      written.push(...chunk)
      for (const tx of chunk) if (tx.transaction_id) existingIds.add(tx.transaction_id)
    }
    if (tabFailed) skippedTabs++
  }

  const outcome: UserResult = {
    user_id: conn.user_id,
    rows_written: totalRows,
    skipped_tabs: skippedTabs,
    ...recreatedFlag,
  }

  // Only stamp last_synced_at when every tab was written. It is the
  // ingestion watermark for the next incremental run, so stamping a partial
  // run would leave the skipped tab's rows outside every later window.
  // last_synced_at is the time this run STARTED, so rows ingested while it
  // ran fall inside the next window.
  if (runSucceeded(outcome)) {
    const updates: Record<string, string | null> = {
      last_synced_at: startedAt,
      updated_at: new Date().toISOString(),
    }
    const newest = nextNewestWatermark(conn.last_synced_timestamp, written)
    if (newest !== conn.last_synced_timestamp) updates.last_synced_timestamp = newest
    await supabase.from('google_sheets_connections').update(updates).eq('user_id', conn.user_id)
  } else {
    console.error(
      `[sheets-export] user=${conn.user_id} skipped ${skippedTabs} tab(s), not stamping last_synced_at`
    )
  }

  console.log(
    `[sheets-export] user=${conn.user_id} wrote=${totalRows} skipped_tabs=${skippedTabs} full=${fullExport} since=${createdSince ?? 'all'} recreated=${recreatedSpreadsheet}`
  )
  return outcome
}

export async function POST(req: NextRequest) {
  // Auth: internal key only (called by cron, callback, or sync-now wrapper)
  const key = req.headers.get('x-internal-key')
  if (!INTERNAL_KEY || key !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { user_id, full_export } = body as { user_id?: string; full_export?: boolean }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  let query = supabase.from('google_sheets_connections').select('*')
  if (user_id) {
    query = query.eq('user_id', user_id)
  } else {
    // Batch (cron) runs skip connections that need the user to reconnect;
    // retrying a dead refresh token every day only fails again. A user's own
    // Sync Now (user_id set) still tries, and reconnecting resets the status.
    query = query.neq('status', 'needs_reauth')
  }

  const { data: connections, error } = await query
  if (error) {
    console.error('[sheets-export] could not load connections:', error.message)
    return NextResponse.json({ error: 'connections_read_failed' }, { status: 500 })
  }
  if (!connections?.length) {
    return NextResponse.json({ synced: 0, results: [] })
  }

  const results: UserResult[] = []

  for (const conn of connections as SheetsConn[]) {
    let result: UserResult
    const leased = await claimLease(supabase, conn.user_id)
    if (!leased) {
      results.push({ user_id: conn.user_id, rows_written: 0, error: 'sync_in_progress' })
      continue
    }
    try {
      result = await exportForUser(supabase, conn, full_export === true)
    } catch (err) {
      console.error(`[sheets-export] failed for user ${conn.user_id}:`, err)
      result = { user_id: conn.user_id, rows_written: 0, error: 'export_failed' }
    } finally {
      await releaseLease(supabase, conn.user_id).catch(() => {})
    }

    // Persist health so the Export page shows a broken connection on load,
    // not only after the user happens to press Sync Now.
    const health = connectionHealthUpdate(result)
    if (health) {
      await supabase
        .from('google_sheets_connections')
        .update(health)
        .eq('user_id', conn.user_id)
    }
    results.push(result)
  }

  return NextResponse.json({ synced: results.length, results })
}
