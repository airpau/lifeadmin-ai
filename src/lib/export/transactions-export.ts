// src/lib/export/transactions-export.ts
//
// Pure helpers shared by the Google Sheets sync (/api/google-sheets/export)
// and the one-shot CSV / Excel downloads (/api/export/csv, /api/export/xlsx).
//
// No network, no env, no Next imports, so the logic that decides WHAT gets
// exported can be unit tested with node:test (see __tests__ next to this file).
//
// Why this exists (Oct 2026, "Export to Google Drive and CSV isn't updating"):
//   1. The Sheets incremental window filtered on the transaction DATE
//      (timestamp >= last_synced_timestamp - 2 days). Bank syncs routinely
//      ingest rows dated weeks earlier (a new or reconnected bank backfills
//      12 months), so those rows were never exported. The window now runs on
//      ingestion time (created_at), which is what "new since last sync" means.
//   2. Tabs were built only from bank connections that are not revoked. When a
//      bank is reconnected the old connection is revoked but its history keeps
//      the old account ids, so that history silently vanished from the sheet.
//      Every account that has transactions now gets a tab, named from any
//      connection that ever held it (live ones preferred).
//   3. Offset pagination ordered by timestamp alone is not stable when many
//      rows share a timestamp (common: banks stamp a whole day at 00:00), so
//      pages could skip or repeat rows. Every paginated read now adds a unique
//      tie breaker (id).
//   4. A future-dated row (scheduled payments) pushed the "newest
//      transaction" watermark into the future. It is now clamped to now.

export type ExportTx = {
  id?: string | null
  transaction_id: string | null
  account_id: string | null
  timestamp: string
  created_at?: string | null
  description: string | null
  merchant_name: string | null
  amount: number | null
  category: string | null
  user_category: string | null
  income_type: string | null
  is_recurring: boolean | null
  is_pending?: boolean | null
}

export type BankConnLike = {
  bank_name: string | null
  status?: string | null
  account_ids: string[] | null
  account_display_names: string[] | null
}

/** Connection states whose history is still exported but whose names lose ties. */
export const DEAD_BANK_STATUSES = ['revoked', 'revoked_duplicate', 'archived']

export const SHEET_HEADERS = [
  'Date', 'Description', 'Merchant', 'Amount (£)', 'Category', 'Type', 'Recurring', 'Transaction ID',
]

/** Overlap applied to the ingestion watermark. Dedup by transaction id makes it harmless. */
export const INCREMENTAL_OVERLAP_MS = 2 * 24 * 60 * 60 * 1000

// ---------------------------------------------------------------------------
// Account and tab naming
// ---------------------------------------------------------------------------

const SHEETS_TAB_MAX = 100

/** Current tab name. Plain hyphen separator (no em dash in anything we write). */
export function tabNameFor(bankName: string | null, displayName: string | null | undefined): string {
  const bank = (bankName ?? '').trim() || 'Bank'
  const display = (displayName ?? '').trim()
  return sanitiseSheetsTabName(display ? `${bank} - ${display}` : bank)
}

/**
 * The name earlier versions of the sync used. Kept so an existing tab can be
 * found and renamed in place instead of a second tab (and a second copy of
 * every row) being created next to it.
 */
export function legacyTabNameFor(bankName: string | null, displayName: string | null | undefined): string {
  const bank = bankName ?? ''
  return displayName ? `${bank} — ${displayName}` : bank
}

export function fallbackTabName(accountId: string): string {
  return `Account ${accountId.slice(0, 6)}`
}

export function sanitiseSheetsTabName(raw: string): string {
  const cleaned = (raw || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, SHEETS_TAB_MAX)
  return cleaned || 'Account'
}

export type AccountInfo = { bank: string; account: string; tabName: string; legacyTabName: string | null }

/**
 * Map every account id to its bank, account name and tab. Considers ALL bank
 * connections (dead ones too, because their transactions are still the user's
 * history). A live connection's naming wins over a dead one's.
 */
export function buildAccountMap(bankConns: BankConnLike[]): Map<string, AccountInfo> {
  const map = new Map<string, AccountInfo & { live: boolean }>()
  for (const bank of bankConns) {
    const live = !DEAD_BANK_STATUSES.includes(String(bank.status ?? ''))
    const ids = bank.account_ids ?? []
    const names = bank.account_display_names ?? []
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      if (!id) continue
      const existing = map.get(id)
      if (existing && (existing.live || !live)) continue
      map.set(id, {
        bank: bank.bank_name ?? '',
        account: names[i] ?? '',
        tabName: tabNameFor(bank.bank_name, names[i]),
        legacyTabName: legacyTabNameFor(bank.bank_name, names[i]) || null,
        live,
      })
    }
  }
  const out = new Map<string, AccountInfo>()
  for (const [id, { live: _live, ...info }] of map) out.set(id, info)
  return out
}

export function accountInfoFor(map: Map<string, AccountInfo>, accountId: string | null): AccountInfo {
  const id = accountId ?? ''
  return map.get(id) ?? { bank: '', account: '', tabName: fallbackTabName(id || 'unknown'), legacyTabName: null }
}

/** A1 range for a tab, always quoted so any tab name parses. */
export function a1Range(tabName: string, cells: string): string {
  return `'${tabName.replace(/'/g, "''")}'!${cells}`
}

// ---------------------------------------------------------------------------
// Sync windows
// ---------------------------------------------------------------------------

/**
 * Lower bound on created_at for an incremental Sheets run, or null for a full
 * pass. Driven by when the last successful sync ran (ingestion time), never by
 * transaction dates.
 */
export function incrementalCreatedSince(
  lastSyncedAt: string | null | undefined,
  fullExport: boolean,
): string | null {
  if (fullExport || !lastSyncedAt) return null
  const t = new Date(lastSyncedAt).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t - INCREMENTAL_OVERLAP_MS).toISOString()
}

/** Newest non-future transaction date among written rows, never moving backwards. */
export function nextNewestWatermark(
  current: string | null | undefined,
  written: Pick<ExportTx, 'timestamp'>[],
  now: Date = new Date(),
): string | null {
  const nowMs = now.getTime()
  let best = current ? new Date(current).getTime() : NaN
  if (Number.isFinite(best) && best > nowMs) best = NaN // heal an already-future watermark
  for (const tx of written) {
    const t = new Date(tx.timestamp).getTime()
    if (!Number.isFinite(t) || t > nowMs) continue
    if (!Number.isFinite(best) || t > best) best = t
  }
  return Number.isFinite(best) ? new Date(best).toISOString() : null
}

// ---------------------------------------------------------------------------
// Grouping and dedup
// ---------------------------------------------------------------------------

export type TabBatch = { tabName: string; legacyTabName: string | null; txs: ExportTx[] }

/** Group transactions into tabs (several accounts may share one tab name). */
export function groupByTab(txs: ExportTx[], accounts: Map<string, AccountInfo>): TabBatch[] {
  const byTab = new Map<string, TabBatch>()
  for (const tx of txs) {
    const info = accountInfoFor(accounts, tx.account_id)
    let batch = byTab.get(info.tabName)
    if (!batch) {
      batch = { tabName: info.tabName, legacyTabName: info.legacyTabName, txs: [] }
      byTab.set(info.tabName, batch)
    }
    batch.txs.push(tx)
  }
  return [...byTab.values()]
}

/** Rows not already in the tab, each transaction id once, oldest first. */
export function selectNewRows(txs: ExportTx[], existingIds: Set<string>): ExportTx[] {
  const seen = new Set(existingIds)
  const out: ExportTx[] = []
  for (const tx of txs) {
    const id = tx.transaction_id
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(tx)
  }
  return out.sort(compareTx)
}

export function compareTx(a: ExportTx, b: ExportTx): number {
  if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1
  const ai = a.id ?? a.transaction_id ?? ''
  const bi = b.id ?? b.transaction_id ?? ''
  return ai < bi ? -1 : ai > bi ? 1 : 0
}

/** Parse column H (majorDimension=COLUMNS) into the set of ids already written. */
export function idsFromColumn(values: unknown): Set<string> {
  const col = Array.isArray(values) && Array.isArray(values[0]) ? (values[0] as unknown[]) : []
  const ids = new Set<string>()
  for (const v of col) {
    if (typeof v === 'string' && v && v !== 'Transaction ID') ids.add(v)
  }
  return ids
}

// ---------------------------------------------------------------------------
// Row formatting
// ---------------------------------------------------------------------------

export function formatDateGB(timestamp: string | null | undefined): string {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  if (!Number.isFinite(d.getTime())) return ''
  // Fixed to UK time so a 23:30 BST payment is not shown on the next day.
  return d.toLocaleDateString('en-GB', { timeZone: 'Europe/London' })
}

export function txType(tx: Pick<ExportTx, 'income_type' | 'amount' | 'is_pending'>): string {
  const base = tx.income_type ?? (typeof tx.amount === 'number' && tx.amount > 0 ? 'Income' : 'Expense')
  return tx.is_pending ? `Pending ${base.toLowerCase()}` : base
}

/** Sheets row: Date | Description | Merchant | Amount | Category | Type | Recurring | Transaction ID */
export function sheetRow(tx: ExportTx): (string | number)[] {
  return [
    formatDateGB(tx.timestamp),
    tx.description ?? '',
    tx.merchant_name ?? '',
    typeof tx.amount === 'number' ? Number(tx.amount.toFixed(2)) : '',
    tx.user_category ?? tx.category ?? '',
    txType(tx),
    tx.is_recurring ? 'Yes' : 'No',
    tx.transaction_id ?? '',
  ]
}

export const CSV_HEADERS = [
  'Date', 'Description', 'Merchant', 'Amount (£)', 'Category', 'Type', 'Recurring', 'Bank', 'Account', 'Transaction ID',
]

export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Neutralise spreadsheet formula injection. Bank feed text is untrusted.
  // Numbers are exempt so a negative amount stays a number.
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return '"' + s.replace(/"/g, '""') + '"'
}

export function csvRow(tx: ExportTx, acct: Pick<AccountInfo, 'bank' | 'account'>): string {
  const [date, description, merchant, amount, category, type, recurring, ref] = sheetRow(tx)
  return [date, description, merchant, amount, category, type, recurring, acct.bank, acct.account, ref]
    .map(csvEscape)
    .join(',')
}

export function buildCsv(txs: ExportTx[], accounts: Map<string, AccountInfo>): string {
  const lines = [CSV_HEADERS.map(csvEscape).join(',')]
  for (const tx of txs) lines.push(csvRow(tx, accountInfoFor(accounts, tx.account_id)))
  // UTF-8 BOM so Excel on Windows renders £ correctly.
  return '﻿' + lines.join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------
// Connection health
// ---------------------------------------------------------------------------

export type SyncOutcome = { rows_written: number; skipped_tabs?: number; error?: string }

/**
 * What to persist on google_sheets_connections after a run, so the Export
 * page can show a broken connection without the user pressing Sync Now.
 * Returns null when nothing should be written (a concurrent run held the lease).
 */
export function connectionHealthUpdate(
  outcome: SyncOutcome,
): { status: 'active' | 'needs_reauth'; last_error: string | null } | null {
  if (outcome.error === 'sync_in_progress') return null
  if (outcome.error === 'token_expired') return { status: 'needs_reauth', last_error: 'token_expired' }
  if (outcome.error) return { status: 'active', last_error: outcome.error.slice(0, 200) }
  if ((outcome.skipped_tabs ?? 0) > 0) return { status: 'active', last_error: 'tabs_skipped' }
  return { status: 'active', last_error: null }
}

/** A run counts as successful (stamp last_synced_at) only when no tab was skipped. */
export function runSucceeded(outcome: SyncOutcome): boolean {
  return !outcome.error && (outcome.skipped_tabs ?? 0) === 0
}
