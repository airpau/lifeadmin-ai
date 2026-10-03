// src/lib/yapily/callback-claim.ts
//
// Makes sure one bank authorisation is turned into a connection ONCE.
//
// Two routes can finish a Hosted Pages journey: the redirect callback
// (the normal path) and the abandonment poller (the fallback when the
// redirect never lands). Each one, when it finishes, fetches /accounts,
// writes the connection and fires the background sync. Nothing stopped
// the same authorisation being finished twice, and bank_sync_log shows
// it happening: two "initial" sync rows seconds apart for the same
// connect on 15 Aug, 26 Aug, 17 Sep, 24 Sep and 1 Oct 2026. Each
// duplicate doubled every call made against a consent that was only
// seconds old.
//
// The claim is a timestamp on the pending row, taken with a conditional
// UPDATE so only one caller can win. It goes stale after two minutes,
// so a callback that claimed and then crashed does not strand the
// authorisation: the poller picks it up on a later tick.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Both finishing routes have a maxDuration of 60s; two minutes is clear of that. */
export const CALLBACK_CLAIM_STALE_MS = 2 * 60_000;

export type ConsentRequestClaim =
  /** We hold the claim. Finish the journey. */
  | 'claimed'
  /** Someone else is finishing it, or already has. Do nothing further. */
  | 'duplicate'
  /**
   * Nothing to claim against (no pending row, a row in a terminal
   * failure state, or the lookup itself failed). Carry on exactly as
   * before this guard existed.
   */
  | 'proceed';

export function callbackClaimCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - CALLBACK_CLAIM_STALE_MS).toISOString();
}

/**
 * Tries to take the claim for a hosted consent request.
 *
 * Fails open by design. This guard exists to stop duplicate work; it
 * must never be the reason a user who authorised at their bank ends up
 * without a connection. Any error, and any state it does not
 * understand, returns 'proceed'.
 */
export async function claimConsentRequest(
  admin: SupabaseClient,
  consentRequestId: string,
  logPrefix = '[yapily.claim]',
): Promise<ConsentRequestClaim> {
  try {
    const { data: row, error: readErr } = await admin
      .from('yapily_pending_consent_requests')
      .select('id, status')
      .eq('consent_request_id', consentRequestId)
      .maybeSingle<{ id: string; status: string }>();

    if (readErr) {
      console.error(`${logPrefix} lookup failed for ${consentRequestId}, proceeding unguarded:`, readErr.message);
      return 'proceed';
    }
    if (!row) return 'proceed';
    if (row.status === 'completed') return 'duplicate';
    // 'failed' / 'abandoned': the journey was written off but the user
    // has turned up with a valid authorisation after all. Honour it.
    if (row.status !== 'pending') return 'proceed';

    const { data: won, error: claimErr } = await admin
      .from('yapily_pending_consent_requests')
      .update({ callback_claimed_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .or(`callback_claimed_at.is.null,callback_claimed_at.lt.${callbackClaimCutoff()}`)
      .select('id');

    if (claimErr) {
      console.error(`${logPrefix} claim failed for ${consentRequestId}, proceeding unguarded:`, claimErr.message);
      return 'proceed';
    }
    return won && won.length > 0 ? 'claimed' : 'duplicate';
  } catch (err) {
    console.error(
      `${logPrefix} claim threw for ${consentRequestId}, proceeding unguarded:`,
      err instanceof Error ? err.message : err,
    );
    return 'proceed';
  }
}
