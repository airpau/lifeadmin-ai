// src/lib/yapily/sync-window.ts
//
// Works out how far back a transaction sync needs to reach.
//
// Why this exists
// ───────────────
// Both sync paths used to request a fixed 90-day window on every single
// run and lean on the dedup layer to throw ~99% of it away. With the
// refresh running every four hours that is six full-history pulls per
// account per day, of which one day's worth is new.
//
// Migle Ivanauskaite (Yapily), 21 Aug 2026:
//   "Historical transaction data is stored client-side; subsequent
//    fetches retrieve only recent data (e.g. from the last known
//    transaction date) rather than re-fetching the full history on
//    every poll"
//
// The saving is not just politeness. Every extra page is a request
// against a 30 req/sec application-wide ceiling shared by all users,
// and high-volume accounts page repeatedly to cover 90 days.
//
// The watermark is derived from bank_transactions rather than stored in
// a column on bank_connections. That costs one indexed MAX() per account
// per run — cheap, and it cannot drift: if rows are deleted, restored,
// or the user disconnects and reconnects, the window corrects itself on
// the next run instead of needing a repair script.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Lookback on a first sync, or whenever we have no usable watermark. */
export const FULL_HISTORY_DAYS = 90;

/**
 * How far BEFORE the newest stored transaction to start an incremental
 * fetch.
 *
 * Not paranoia — banks genuinely backfill. A card payment can be
 * authorised on Friday and settle on Tuesday with Friday's booking
 * date, so it appears in the feed dated earlier than transactions we
 * have already stored. Starting exactly at the watermark would step
 * straight over it and the transaction would never be seen.
 *
 * Seven days comfortably covers UK card settlement and weekend/bank
 * holiday runs. The overlap costs nothing beyond a slightly larger
 * page: `upsertYapilyTransactions` dedups on the stable hash, so
 * re-seeing a transaction is a no-op.
 */
export const INCREMENTAL_OVERLAP_DAYS = 7;

/**
 * If the newest stored transaction is older than this, treat the
 * connection as cold and pull the full history again. Covers a
 * connection that has been broken for a while, or an account so
 * dormant that an incremental window would be pointless.
 */
export const STALE_WATERMARK_DAYS = FULL_HISTORY_DAYS;

/**
 * How far AHEAD of now to ask the bank for transactions.
 *
 * This is the forward-visibility dial, and it was set to 1.
 *
 * UK banks return scheduled payments as ordinary transaction rows dated
 * on the day they are DUE, not the day they were booked. That is the
 * documented behaviour this codebase already relies on: see
 * src/lib/alerts/future-dated.ts, which exists because five rows dated
 * Monday 2026-08-17 were synced on Friday 2026-08-15 and triggered a
 * "money has left your account" alert two days early.
 *
 * So a future-dated row IS the bank telling us about a scheduled
 * payment, in or out. With an upper bound of `now + 1 day` we were
 * asking to see one day of that and no more. On a Wednesday, a payment
 * due Friday is simply not requested, which is why the Money Hub could
 * show "tomorrow" but never "the day after". Paul reported exactly this
 * on 2026-09-10: he used to be able to see what was landing on the
 * next working day and could not any more.
 *
 * Fourteen days clears any weekend or bank-holiday run and matches the
 * 7/14/30 windows the forward view already offers, so the UI can never
 * promise a horizon the sync does not fetch.
 *
 * Cost: none. This widens a filter on requests we already make; it does
 * not add a call, and future-dated rows are a handful per account.
 * `upsertYapilyTransactions` dedups on the stable hash, so re-seeing a
 * row as its date approaches is a no-op, and isFutureDated() keeps them
 * out of past-tense alerts until the day they land.
 */
export const FUTURE_HORIZON_DAYS = 14;

export interface TransactionWindow {
  /** ISO timestamp, inclusive lower bound. */
  from: string;
  /** ISO timestamp, exclusive upper bound. */
  before: string;
  /** Which branch produced this window — logged, and surfaced in bank_sync_log. */
  mode: 'full_history' | 'incremental';
  /** Days the window spans, for logging. */
  spanDays: number;
}

/**
 * Pure window calculation. Kept separate from the DB lookup so it can
 * be unit-tested without a database.
 *
 * @param latestTransactionAt newest stored transaction for this account,
 *        or null when there are none.
 */
export function computeTransactionWindow(
  latestTransactionAt: string | Date | null | undefined,
  now: Date = new Date(),
): TransactionWindow {
  const dayMs = 86_400_000;
  // Exclusive upper bound, deliberately well into the future so the
  // bank's own scheduled payments come back with the ordinary
  // transaction feed. See FUTURE_HORIZON_DAYS.
  const before = new Date(now.getTime() + FUTURE_HORIZON_DAYS * dayMs);
  const fullFrom = new Date(now.getTime() - FULL_HISTORY_DAYS * dayMs);

  const full = (): TransactionWindow => ({
    from: fullFrom.toISOString(),
    before: before.toISOString(),
    mode: 'full_history',
    spanDays: FULL_HISTORY_DAYS + FUTURE_HORIZON_DAYS,
  });

  if (!latestTransactionAt) return full();

  const raw = new Date(latestTransactionAt);
  if (Number.isNaN(raw.getTime())) return full();

  // ── Future-dated rows are NORMAL, not an error ────────────────────
  //
  // Caught in production on 2026-08-21, first run after deploy: the
  // window came back as 91 days for an account whose newest stored
  // transaction was dated five days ahead.
  //
  // NatWest and HSBC return scheduled payments as ordinary transaction
  // rows dated on the day they are DUE — the whole reason
  // future-dated.ts and the `before = tomorrow` bound exist. So a
  // watermark in the future is the everyday case for exactly the
  // accounts we most want to sync incrementally, not the clock-skew
  // anomaly the first version of this guard assumed.
  //
  // Clamping to `now` is safe and is the right answer: a stored row
  // dated next Tuesday means we already have everything up to today,
  // so today is a valid floor to resume from.
  //
  // A date absurdly far ahead is a different thing — corrupt data or a
  // parsing bug — and should not silently narrow the window.
  const ABSURD_FUTURE_DAYS = 365;
  if (raw.getTime() - now.getTime() > ABSURD_FUTURE_DAYS * dayMs) return full();

  const latest = raw.getTime() > now.getTime() ? now : raw;

  if (now.getTime() - latest.getTime() > STALE_WATERMARK_DAYS * dayMs) return full();

  const incrementalFrom = new Date(latest.getTime() - INCREMENTAL_OVERLAP_DAYS * dayMs);
  // Never reach further back than a full-history sync would have.
  const from = incrementalFrom.getTime() < fullFrom.getTime() ? fullFrom : incrementalFrom;

  return {
    from: from.toISOString(),
    before: before.toISOString(),
    mode: 'incremental',
    spanDays: Math.max(1, Math.round((before.getTime() - from.getTime()) / dayMs)),
  };
}

/**
 * What the post-authorisation sync should fetch for one account.
 */
export interface InitialSyncPlan {
  /** The recent window to request. Always requested. */
  window: TransactionWindow;
  /**
   * Whether to ALSO pull the older 91 to 365 day history.
   *
   * True for an account we hold nothing for. That history is only
   * obtainable in the few minutes after the customer authenticates, so
   * a first connection has to take it then. A reconnection does not:
   * we already store it, and Yapily's guidance is explicit that
   * "historical transaction data is stored client-side; subsequent
   * fetches retrieve only recent data".
   *
   * This is the per-account answer. The route combines it across the
   * connection's accounts with needsOlderHistory() below.
   */
  backfillOlderHistory: boolean;
  /**
   * We hold history for this account, but nothing from the last
   * FULL_HISTORY_DAYS. Either the account is simply dormant, or the
   * connection has been broken for longer than the recent window can
   * reach back. The account alone cannot tell us which.
   */
  staleWatermark: boolean;
}

/**
 * Final decision on the older-history pull for one account, given the
 * plans for every account on the same connection.
 *
 * A stale watermark is ambiguous on its own (see staleWatermark). The
 * other accounts settle it: if any of them has a recent transaction,
 * the connection was syncing recently and the stale account is merely
 * quiet, so there is no gap to fill. If EVERY account is stale, the
 * connection itself was down for more than 90 days, the recent window
 * cannot cover the outage, and the older pull is the only way to close
 * the hole in the user's history.
 */
export function needsOlderHistory(
  plan: InitialSyncPlan,
  allPlansOnConnection: readonly InitialSyncPlan[],
): boolean {
  if (plan.backfillOlderHistory) return true;
  if (!plan.staleWatermark) return false;
  const connectionSyncedRecently = allPlansOnConnection.some(
    (p) => !p.backfillOlderHistory && !p.staleWatermark,
  );
  return !connectionSyncedRecently;
}

/**
 * Pure planning step for the post-authorisation sync, separated from
 * the DB lookup so it can be unit-tested.
 *
 * Until 2026-10-03 every authorisation pulled the full 12 months for
 * every account, including when the user was re-authorising a bank we
 * already held years of history for. On a four-account HSBC Business
 * login that was eight heavy requests against a brand new consent, on
 * every single reconnect, to fetch rows the dedup layer then threw
 * away. A reconnect now costs the same as an ordinary scheduled sync:
 * one incremental request per account.
 */
export function planInitialSync(
  latestTransactionAt: string | Date | null | undefined,
  now: Date = new Date(),
): InitialSyncPlan {
  const raw = latestTransactionAt ? new Date(latestTransactionAt) : null;
  const hasStoredHistory = raw !== null && !Number.isNaN(raw.getTime());
  const window = computeTransactionWindow(hasStoredHistory ? raw : null, now);
  return {
    window,
    backfillOlderHistory: !hasStoredHistory,
    // computeTransactionWindow falls back to the full window exactly
    // when the watermark is too old (or absurd) to resume from.
    staleWatermark: hasStoredHistory && window.mode === 'full_history',
  };
}

/**
 * Looks up the newest stored transaction for one account and returns
 * the plan for its post-authorisation sync.
 *
 * Fails safe in the same direction as resolveTransactionWindow: if the
 * lookup errors we behave as though the account were new and pull
 * everything. Fetching history we already have is wasteful; skipping
 * history a new user needs is not recoverable once the bank's window
 * for it has closed.
 */
export async function resolveInitialSyncPlan(
  supabase: SupabaseClient,
  params: { userId: string; accountId: string; now?: Date },
): Promise<InitialSyncPlan> {
  const now = params.now ?? new Date();
  try {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('timestamp')
      .eq('user_id', params.userId)
      .eq('account_id', params.accountId)
      .order('timestamp', { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);

    const rows = data as Array<{ timestamp: string }> | null;
    return planInitialSync(rows?.[0]?.timestamp ?? null, now);
  } catch (err) {
    console.warn(
      `[sync-window] initial-sync watermark lookup failed for account=${params.accountId}, treating as a new account:`,
      err instanceof Error ? err.message : err,
    );
    return planInitialSync(null, now);
  }
}

/**
 * Looks up the newest stored transaction for one account and returns
 * the window to request.
 *
 * Fails safe: any DB error yields the full-history window. Syncing more
 * than we needed is wasteful; syncing less than we needed loses a user's
 * transactions, and only one of those is recoverable on the next run.
 */
export async function resolveTransactionWindow(
  supabase: SupabaseClient,
  params: { userId: string; accountId: string; now?: Date },
): Promise<TransactionWindow> {
  const now = params.now ?? new Date();
  try {
    const { data } = await supabase
      .from('bank_transactions')
      .select('timestamp')
      .eq('user_id', params.userId)
      .eq('account_id', params.accountId)
      .order('timestamp', { ascending: false })
      .limit(1);

    const rows = data as Array<{ timestamp: string }> | null;
    return computeTransactionWindow(rows?.[0]?.timestamp ?? null, now);
  } catch (err) {
    console.warn(
      `[sync-window] watermark lookup failed for account=${params.accountId} — falling back to full history:`,
      err instanceof Error ? err.message : err,
    );
    return computeTransactionWindow(null, now);
  }
}
