/**
 * Balance persistence for Yapily connections.
 *
 * Background: bank_connections.current_balance / available_balance /
 * balance_updated_at have existed since 20260406120000_add_bank_balance.sql
 * and are READ in six places — /api/mcp/accounts, /api/money-hub/forecast,
 * /api/money-hub/upcoming, report-generator (x2) and the Telegram tool
 * handlers — but until now nothing in the codebase ever WROTE them. Every
 * balance the product displayed was null.
 *
 * TWO GRAINS
 *
 * Balances are written twice, on purpose:
 *
 *   1. bank_account_balances — one row per real account, with the
 *      account type Yapily reported. This is the truthful grain.
 *   2. bank_connections.current_balance / available_balance — a CASH-ONLY
 *      roll-up, kept because six existing read sites depend on it.
 *
 * The roll-up excludes liabilities. A connection can carry a current
 * account, a savings account, two loans and a credit card (the JPG
 * Operations Ltd HSBC Business connection does exactly this), and blindly
 * summing them nets loan debt against cash in the bank. The result is not
 * a wrong balance, it is not a balance at all. Anything classified as a
 * liability is stored per account and left out of the roll-up.
 *
 * Why this is opt-in (bank_connections.balance_sync_enabled):
 * the bank-sync cron is deliberately built to make ZERO GET /accounts
 * calls against a healthy connection — account_ids on the row is the
 * cache, per Migle's guidance on not re-polling a consent. Balances only
 * come back on /accounts, so refreshing them costs one extra call per
 * connection per sync cycle (~6/day at the 4-hour cadence) against
 * GLOBAL_DAILY_API_CEILING = 500.
 *
 * Everything here is best-effort. A balance refresh must never fail a
 * transaction sync — transactions are the product, balances are a nicety.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { YapilyAccount } from '@/types/yapily';

/**
 * Yapily balance `type` values, most-preferred first.
 *
 * "Available" is what you can actually spend today (may include an
 * overdraft facility). "Current"/booked is the settled position ignoring
 * anything still in flight. Institutions are inconsistent about which
 * they return, so each role has an ordered preference list and we take
 * the first one present.
 */
const AVAILABLE_TYPES = ['INTERIM_AVAILABLE', 'AVAILABLE', 'EXPECTED', 'FORWARD_AVAILABLE'];
const CURRENT_TYPES = ['INTERIM_BOOKED', 'CLOSING_BOOKED', 'BOOKED', 'OPENING_BOOKED'];

export type BalanceClass = 'cash' | 'liability' | 'unknown';

/**
 * Bucket an account into cash / liability / unknown.
 *
 * Reads Yapily's accountType and usageType, plus `type` and the display
 * name as fallbacks. Deliberately conservative in one direction only: an
 * account we cannot classify is 'unknown', NOT 'cash'. Wrongly counting a
 * loan as cash inflates someone's apparent balance, which is the failure
 * mode that actually costs money.
 */
export function classifyAccount(account: YapilyAccount): BalanceClass {
  const haystack = [
    account.accountType,
    account.usageType,
    account.type,
    account.nickname,
    ...(account.accountNames ?? []).map((n) => n?.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  // Liabilities first — a "CREDIT_CARD" must never fall through to a
  // cash match on some other token in the same string.
  if (/CREDIT[_ ]?CARD|CHARGE[_ ]?CARD/.test(haystack)) return 'liability';
  if (/\bLOAN\b|MORTGAGE|LENDING|BORROW/.test(haystack)) return 'liability';

  if (/CURRENT|CHECKING|TRANSACTION|CHARGE[_ ]?ACCOUNT/.test(haystack)) return 'cash';
  if (/SAVING|DEPOSIT|\bISA\b|MONEY[_ ]?MARKET/.test(haystack)) return 'cash';

  return 'unknown';
}

function pickBalance(account: YapilyAccount, preferred: string[]): number | null {
  const balances = account.accountBalances;
  if (!Array.isArray(balances) || balances.length === 0) return null;

  for (const wanted of preferred) {
    const hit = balances.find(
      (b) => (b.type ?? '').toUpperCase() === wanted && typeof b.balanceAmount?.amount === 'number',
    );
    if (hit) return Number(hit.balanceAmount!.amount);
  }
  return null;
}

export interface AccountBalance {
  accountId: string;
  displayName: string | null;
  accountType: string | null;
  usageType: string | null;
  balanceClass: BalanceClass;
  currency: string;
  currentBalance: number | null;
  availableBalance: number | null;
}

/** Per-account figures, in the order Yapily returned them. */
export function resolveAccountBalances(accounts: YapilyAccount[]): AccountBalance[] {
  return accounts
    .filter((a) => {
      // Same exclusion snapshotAccounts() applies: Monzo POTs are ghost
      // accounts we never surface, so they must not appear here either.
      const t = (a.type ?? '').toUpperCase();
      const at = (a.accountType ?? '').toUpperCase();
      return t !== 'POT' && at !== 'POT';
    })
    .map((account) => {
      const current = pickBalance(account, CURRENT_TYPES);
      const available = pickBalance(account, AVAILABLE_TYPES);
      // Flat scalar fallback for institutions that omit accountBalances.
      const flat = typeof account.balance === 'number' ? account.balance : null;

      return {
        accountId: account.id,
        displayName: account.accountNames?.[0]?.name ?? account.nickname ?? null,
        accountType: account.accountType ?? account.type ?? null,
        usageType: account.usageType ?? null,
        balanceClass: classifyAccount(account),
        currency: account.currency || 'GBP',
        currentBalance: current ?? flat,
        availableBalance: available ?? current ?? flat,
      };
    });
}

export interface CashRollup {
  currentBalance: number | null;
  availableBalance: number | null;
  /** Accounts that fed the roll-up. Zero means the figures are null. */
  cashAccountsCounted: number;
  /** Accounts deliberately left out because they are debt, not money. */
  liabilitiesExcluded: number;
  /** Accounts we could not classify. Also excluded — see classifyAccount. */
  unknownExcluded: number;
}

/**
 * Roll per-account figures up to the single connection-level pair that
 * bank_connections stores.
 *
 * CASH ONLY. Liabilities and unclassifiable accounts are counted and
 * reported, but never summed — see the module header.
 *
 * If no cash account yielded a figure the result is null, not 0. A
 * spurious £0 balance is worse than an honest "unknown", because £0 reads
 * as a real and alarming number.
 */
export function rollUpCashBalances(perAccount: AccountBalance[]): CashRollup {
  let currentSum = 0;
  let availableSum = 0;
  let sawCurrent = false;
  let sawAvailable = false;
  let cashAccountsCounted = 0;
  let liabilitiesExcluded = 0;
  let unknownExcluded = 0;

  for (const acct of perAccount) {
    if (acct.balanceClass === 'liability') {
      liabilitiesExcluded++;
      continue;
    }
    if (acct.balanceClass === 'unknown') {
      unknownExcluded++;
      continue;
    }

    cashAccountsCounted++;
    if (acct.currentBalance !== null) {
      currentSum += acct.currentBalance;
      sawCurrent = true;
    }
    if (acct.availableBalance !== null) {
      availableSum += acct.availableBalance;
      sawAvailable = true;
    }
  }

  return {
    currentBalance: sawCurrent ? Number(currentSum.toFixed(2)) : null,
    availableBalance: sawAvailable ? Number(availableSum.toFixed(2)) : null,
    cashAccountsCounted,
    liabilitiesExcluded,
    unknownExcluded,
  };
}

export interface BalanceSyncResult {
  /** False when the connection has not opted in, or nothing usable came back. */
  written: boolean;
  accountsWritten: number;
  rollup: CashRollup | null;
  reason?: string;
}

/**
 * Refresh stored balances for one connection, at both grains.
 *
 * `loadAccounts` is injected rather than called directly so the caller
 * can hand over its MEMOISED /accounts promise. Both the cron and
 * /api/bank/sync-now already have one — reusing it means an enabled
 * connection that happened to need a bank-name or hash backfill in the
 * same run pays for zero additional Yapily calls.
 */
export async function syncConnectionBalances(
  supabase: SupabaseClient,
  connection: { id: string; user_id: string; balance_sync_enabled?: boolean | null },
  loadAccounts: () => Promise<YapilyAccount[]>,
): Promise<BalanceSyncResult> {
  if (!connection.balance_sync_enabled) {
    return { written: false, accountsWritten: 0, rollup: null, reason: 'not_enabled' };
  }

  try {
    const accounts = await loadAccounts();
    const perAccount = resolveAccountBalances(accounts);
    const now = new Date().toISOString();

    // ── Grain 1: per account ───────────────────────────────────────
    const rows = perAccount.map((a) => ({
      user_id: connection.user_id,
      connection_id: connection.id,
      account_id: a.accountId,
      display_name: a.displayName,
      account_type: a.accountType,
      usage_type: a.usageType,
      balance_class: a.balanceClass,
      currency: a.currency,
      current_balance: a.currentBalance,
      available_balance: a.availableBalance,
      balance_updated_at: now,
      updated_at: now,
    }));

    if (rows.length > 0) {
      const { error: perAccountErr } = await supabase
        .from('bank_account_balances')
        .upsert(rows, { onConflict: 'connection_id,account_id' });

      if (perAccountErr) {
        console.error(
          `[balance-sync] conn=${connection.id} per-account upsert failed:`,
          perAccountErr.message,
        );
      }
    }

    // ── Grain 2: cash-only connection roll-up ──────────────────────
    const rollup = rollUpCashBalances(perAccount);

    if (rollup.unknownExcluded > 0) {
      // Worth surfacing: it means Yapily gave us an account whose kind we
      // could not read, and it is silently absent from the headline
      // balance. Better a log line than a quietly understated figure.
      console.warn(
        `[balance-sync] conn=${connection.id} excluded ${rollup.unknownExcluded} unclassified account(s) from the cash roll-up`,
      );
    }

    if (rollup.currentBalance === null && rollup.availableBalance === null) {
      console.warn(
        `[balance-sync] conn=${connection.id} no usable CASH balance (cash=${rollup.cashAccountsCounted} liability=${rollup.liabilitiesExcluded} unknown=${rollup.unknownExcluded}) — leaving connection-level values untouched`,
      );
      return {
        written: rows.length > 0,
        accountsWritten: rows.length,
        rollup,
        reason: 'no_cash_balance_returned',
      };
    }

    await supabase
      .from('bank_connections')
      .update({
        current_balance: rollup.currentBalance,
        available_balance: rollup.availableBalance,
        balance_updated_at: now,
      })
      .eq('id', connection.id);

    console.log(
      `[balance-sync] conn=${connection.id} cash current=${rollup.currentBalance} available=${rollup.availableBalance} ` +
        `(from ${rollup.cashAccountsCounted} cash account(s); excluded ${rollup.liabilitiesExcluded} liability, ${rollup.unknownExcluded} unknown)`,
    );

    return { written: true, accountsWritten: rows.length, rollup };
  } catch (err: any) {
    // Never fatal. Transactions are the product; a stale balance is a
    // cosmetic problem and the previous value stays in place.
    console.error(`[balance-sync] conn=${connection.id} failed:`, err?.message);
    return {
      written: false,
      accountsWritten: 0,
      rollup: null,
      reason: `error: ${err?.message ?? 'unknown'}`,
    };
  }
}
