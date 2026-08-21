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
  // Exclusive upper bound of tomorrow, so transactions booked later
  // today — and future-dated ones some banks emit — are not cut off.
  const before = new Date(now.getTime() + dayMs);
  const fullFrom = new Date(now.getTime() - FULL_HISTORY_DAYS * dayMs);

  const full = (): TransactionWindow => ({
    from: fullFrom.toISOString(),
    before: before.toISOString(),
    mode: 'full_history',
    spanDays: FULL_HISTORY_DAYS + 1,
  });

  if (!latestTransactionAt) return full();

  const latest = new Date(latestTransactionAt);
  if (Number.isNaN(latest.getTime())) return full();

  // A watermark in the future (bank clock skew, or a future-dated
  // transaction we stored) would otherwise produce an empty or
  // inverted window. Fall back rather than silently sync nothing.
  if (latest.getTime() > now.getTime()) return full();

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
