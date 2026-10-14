/**
 * Tests for the pure export helpers behind the Google Sheets sync and the
 * CSV / Excel downloads. Run with:
 *   node --experimental-strip-types --test src/lib/export/__tests__/transactions-export.test.ts
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  a1Range,
  buildAccountMap,
  buildCsv,
  connectionHealthUpdate,
  csvEscape,
  groupByTab,
  idsFromColumn,
  incrementalCreatedSince,
  legacyTabNameFor,
  nextNewestWatermark,
  runSucceeded,
  selectNewRows,
  sheetRow,
  tabNameFor,
  txType,
  type ExportTx,
} from '../transactions-export.ts'

function tx(over: Partial<ExportTx>): ExportTx {
  return {
    id: over.id ?? over.transaction_id ?? 'row',
    transaction_id: 'T1',
    account_id: 'A1',
    timestamp: '2026-10-01T00:00:00Z',
    description: 'Coffee',
    merchant_name: 'Cafe',
    amount: -3.5,
    category: 'eating_out',
    user_category: null,
    income_type: null,
    is_recurring: false,
    is_pending: false,
    ...over,
  }
}

describe('incrementalCreatedSince', () => {
  it('returns null for a full export or a first sync', () => {
    assert.equal(incrementalCreatedSince('2026-10-10T06:00:00Z', true), null)
    assert.equal(incrementalCreatedSince(null, false), null)
  })

  it('windows on the last sync time minus a two day overlap', () => {
    assert.equal(
      incrementalCreatedSince('2026-10-10T06:00:00Z', false),
      '2026-10-08T06:00:00.000Z',
    )
  })

  it('treats an unparseable watermark as a full pass rather than skipping rows', () => {
    assert.equal(incrementalCreatedSince('not a date', false), null)
  })
})

describe('buildAccountMap', () => {
  it('names accounts that only belong to a revoked connection (their history still exports)', () => {
    const map = buildAccountMap([
      { bank_name: 'hsbc', status: 'revoked', account_ids: ['OLD'], account_display_names: ['JPG OPS'] },
      { bank_name: 'hsbc', status: 'expired', account_ids: ['NEW'], account_display_names: ['JPG OPS'] },
    ])
    assert.equal(map.get('OLD')?.tabName, 'hsbc - JPG OPS')
    assert.equal(map.get('NEW')?.tabName, 'hsbc - JPG OPS')
  })

  it('prefers a live connection name over a dead one for the same account, in any order', () => {
    const dead = { bank_name: 'oldbank', status: 'revoked', account_ids: ['X'], account_display_names: ['Old name'] }
    const live = { bank_name: 'newbank', status: 'active', account_ids: ['X'], account_display_names: ['New name'] }
    assert.equal(buildAccountMap([dead, live]).get('X')?.tabName, 'newbank - New name')
    assert.equal(buildAccountMap([live, dead]).get('X')?.tabName, 'newbank - New name')
  })

  it('keeps the legacy em dash name so an existing tab can be renamed, not duplicated', () => {
    const map = buildAccountMap([
      { bank_name: 'natwest', status: 'active', account_ids: ['A'], account_display_names: ['AIRPROP LTD'] },
    ])
    assert.equal(map.get('A')?.legacyTabName, 'natwest — AIRPROP LTD')
  })
})

describe('tab names', () => {
  it('never contains an em or en dash', () => {
    assert.doesNotMatch(tabNameFor('natwest', 'AIRPROP LTD'), /[–—]/)
    assert.equal(tabNameFor('natwest', null), 'natwest')
    assert.equal(tabNameFor(null, null), 'Bank')
    assert.equal(legacyTabNameFor('natwest', null), 'natwest')
  })

  it('quotes A1 ranges and escapes single quotes', () => {
    assert.equal(a1Range("Paul's account", 'H:H'), "'Paul''s account'!H:H")
    assert.equal(a1Range('AB12', 'A1'), "'AB12'!A1")
  })
})

describe('groupByTab', () => {
  it('puts rows for unknown accounts in a fallback tab instead of dropping them', () => {
    const groups = groupByTab(
      [tx({ transaction_id: 'a', account_id: 'KNOWN' }), tx({ transaction_id: 'b', account_id: 'ORPHAN123' })],
      buildAccountMap([{ bank_name: 'monzo', status: 'active', account_ids: ['KNOWN'], account_display_names: ['Main'] }]),
    )
    assert.deepEqual(groups.map(g => g.tabName).sort(), ['Account ORPHAN', 'monzo - Main'])
  })

  it('merges accounts that share a tab name into one batch', () => {
    const accounts = buildAccountMap([
      { bank_name: 'natwest', status: 'active', account_ids: ['A', 'B'], account_display_names: ['AIRPROP LTD', 'AIRPROP LTD'] },
    ])
    const groups = groupByTab([tx({ transaction_id: '1', account_id: 'A' }), tx({ transaction_id: '2', account_id: 'B' })], accounts)
    assert.equal(groups.length, 1)
    assert.equal(groups[0].txs.length, 2)
  })
})

describe('selectNewRows', () => {
  it('skips ids already in the sheet and repeated ids, and sorts oldest first', () => {
    const rows = selectNewRows(
      [
        tx({ transaction_id: 'c', timestamp: '2026-10-03T00:00:00Z' }),
        tx({ transaction_id: 'a', timestamp: '2026-10-01T00:00:00Z' }),
        tx({ transaction_id: 'b', timestamp: '2026-10-02T00:00:00Z' }),
        tx({ transaction_id: 'b', timestamp: '2026-10-02T00:00:00Z' }),
      ],
      new Set(['a']),
    )
    assert.deepEqual(rows.map(r => r.transaction_id), ['b', 'c'])
  })

  it('is idempotent: a second pass over the same rows writes nothing', () => {
    const all = [tx({ transaction_id: 'x' }), tx({ transaction_id: 'y' })]
    const first = selectNewRows(all, new Set())
    const second = selectNewRows(all, new Set(first.map(r => r.transaction_id!)))
    assert.equal(first.length, 2)
    assert.equal(second.length, 0)
  })

  it('drops rows with no transaction id rather than writing an undedupable row', () => {
    assert.equal(selectNewRows([tx({ transaction_id: null })], new Set()).length, 0)
  })
})

describe('idsFromColumn', () => {
  it('reads column H and ignores the header and blanks', () => {
    assert.deepEqual([...idsFromColumn([['Transaction ID', 'a', '', 'b']])], ['a', 'b'])
    assert.equal(idsFromColumn(undefined).size, 0)
  })
})

describe('nextNewestWatermark', () => {
  const now = new Date('2026-10-14T12:00:00Z')

  it('ignores future-dated rows (scheduled payments)', () => {
    assert.equal(
      nextNewestWatermark('2026-10-01T00:00:00.000Z', [{ timestamp: '2026-10-21T00:00:00Z' }, { timestamp: '2026-10-13T00:00:00Z' }], now),
      '2026-10-13T00:00:00.000Z',
    )
  })

  it('never moves backwards', () => {
    assert.equal(
      nextNewestWatermark('2026-10-10T00:00:00.000Z', [{ timestamp: '2026-09-01T00:00:00Z' }], now),
      '2026-10-10T00:00:00.000Z',
    )
  })

  it('heals a watermark that is already in the future', () => {
    assert.equal(nextNewestWatermark('2026-10-21T00:00:00.000Z', [], now), null)
    assert.equal(
      nextNewestWatermark('2026-10-21T00:00:00.000Z', [{ timestamp: '2026-10-12T00:00:00Z' }], now),
      '2026-10-12T00:00:00.000Z',
    )
  })
})

describe('row formatting', () => {
  it('formats a sheet row with UK date, user category and pending type', () => {
    const row = sheetRow(tx({ timestamp: '2026-06-30T23:30:00Z', user_category: 'Treats', is_pending: true, amount: -3.456 }))
    // 23:30 UTC on 30 June is 00:30 BST on 1 July.
    assert.deepEqual(row, ['01/07/2026', 'Coffee', 'Cafe', -3.46, 'Treats', 'Pending expense', 'No', 'T1'])
  })

  it('derives type from the amount when income_type is missing', () => {
    assert.equal(txType({ income_type: null, amount: 10, is_pending: false }), 'Income')
    assert.equal(txType({ income_type: 'Salary', amount: 10, is_pending: false }), 'Salary')
  })

  it('defangs formula injection in text but keeps negative numbers', () => {
    assert.equal(csvEscape('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"')
    assert.equal(csvEscape(-12.5), '"-12.5"')
  })

  it('builds a CSV with a BOM, header and one row per transaction', () => {
    const csv = buildCsv(
      [tx({ transaction_id: 'a', account_id: 'A' }), tx({ transaction_id: 'b', account_id: 'GONE' })],
      buildAccountMap([{ bank_name: 'monzo', status: 'revoked', account_ids: ['A'], account_display_names: ['Main'] }]),
    )
    assert.ok(csv.startsWith('﻿"Date"'))
    const lines = csv.trim().split('\r\n')
    assert.equal(lines.length, 3)
    assert.match(lines[1], /"monzo","Main","a"$/)
    assert.match(lines[2], /"","","b"$/)
  })
})

describe('connection health', () => {
  it('marks a dead refresh token as needs_reauth', () => {
    assert.deepEqual(connectionHealthUpdate({ rows_written: 0, error: 'token_expired' }), {
      status: 'needs_reauth',
      last_error: 'token_expired',
    })
  })

  it('clears the error on a clean run, flags skipped tabs, ignores a lease clash', () => {
    assert.deepEqual(connectionHealthUpdate({ rows_written: 5, skipped_tabs: 0 }), { status: 'active', last_error: null })
    assert.deepEqual(connectionHealthUpdate({ rows_written: 5, skipped_tabs: 1 }), { status: 'active', last_error: 'tabs_skipped' })
    assert.equal(connectionHealthUpdate({ rows_written: 0, error: 'sync_in_progress' }), null)
  })

  it('only stamps a run as successful when no tab was skipped', () => {
    assert.equal(runSucceeded({ rows_written: 0, skipped_tabs: 0 }), true)
    assert.equal(runSucceeded({ rows_written: 10, skipped_tabs: 1 }), false)
    assert.equal(runSucceeded({ rows_written: 0, error: 'token_expired' }), false)
  })
})
