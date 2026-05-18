import type { SupabaseClient } from '@supabase/supabase-js';
import { CONSENT_FAILURE_THRESHOLD } from '@/lib/yapily';

/**
 * Tracks consecutive consent-expiry errors on a bank connection.
 *
 * Why this exists: a single Yapily 401/403 used to flip the connection
 * to 'expired' immediately, and the bank-sync cron's WHERE clause then
 * permanently excluded the row from recovery. With the threshold, we
 * require sustained failures across multiple sync runs before
 * disconnecting — single transient errors get logged and recovered
 * automatically on the next successful call.
 */

export interface FailureTrackResult {
  /** New failure count after this increment. */
  count: number;
  /** True when count has crossed the threshold and the caller should
   *  flip bank_connections.status to 'expired'. */
  shouldFlipExpired: boolean;
}

/**
 * Records a consent-expiry signal against a bank connection. Increments
 * the consecutive-failure counter and returns whether the threshold has
 * been crossed.
 *
 * Idempotent at the row level: every call increments by 1. Caller is
 * responsible for only invoking this once per Yapily call attempt.
 */
export async function recordConsentFailure(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<FailureTrackResult> {
  const now = new Date().toISOString();

  // Read-modify-write. We could RPC this but the inline approach keeps
  // the sync paths self-contained and the contention window is tiny
  // (5 cron runs/day * N connections, no concurrent writers per row).
  const { data: current } = await supabase
    .from('bank_connections')
    .select('consent_failure_count')
    .eq('id', connectionId)
    .maybeSingle();

  const previousCount = current?.consent_failure_count ?? 0;
  const nextCount = previousCount + 1;

  await supabase
    .from('bank_connections')
    .update({
      consent_failure_count: nextCount,
      consent_last_failure_at: now,
      updated_at: now,
    })
    .eq('id', connectionId);

  return {
    count: nextCount,
    shouldFlipExpired: nextCount >= CONSENT_FAILURE_THRESHOLD,
  };
}

/**
 * Resets the consecutive-failure counter to 0. Call after any
 * successful Yapily call against the connection — the counter
 * represents UNBROKEN failures, so a single success clears it.
 *
 * Also call on fresh reconnect / consent renew so the new consent
 * starts from a clean slate even if the row was reused via the
 * connection-store merge logic.
 *
 * Cheap no-op when the count is already 0 — only writes when there's
 * something to clear (avoids touching updated_at on every healthy sync).
 */
export async function clearConsentFailures(
  supabase: SupabaseClient,
  connectionId: string,
): Promise<void> {
  const { data: current } = await supabase
    .from('bank_connections')
    .select('consent_failure_count')
    .eq('id', connectionId)
    .maybeSingle();

  if (!current || (current.consent_failure_count ?? 0) === 0) return;

  await supabase
    .from('bank_connections')
    .update({
      consent_failure_count: 0,
      consent_last_failure_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connectionId);
}
