/**
 * Shared YapilyError handler — gives every bank-facing route the same
 * branching behaviour per HTTP status class (Migle's T7).
 *
 * Used by:
 *   /api/money-hub/*           — surface 403 as needs-reconsent
 *   /api/bank/sync-now         — surface 403 as needs-reconsent
 *   /api/cron/bank-sync        — pause the connection, log, move on
 *   /api/cron/sync-upcoming    — same
 *
 * Behaviour summary:
 *   400 → user-facing: "request was rejected"; logged at warn
 *   401 → critical: our app credentials are bad; logged at error
 *   403 → consent expired/invalid; flip connection to 'expired',
 *         caller should render ConsentRenewalBanner
 *   404 → benign: resource gone; logged at info
 *   429 → rate-limited; caller should backoff (not retried here)
 *   5xx → upstream wobble; logged at error
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { YapilyError } from '@/lib/yapily';

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type YapilyErrorOutcome =
  | { kind: 'reconsent'; userMessage: string }
  | { kind: 'rate_limited'; userMessage: string; retryAfterMs: number }
  | { kind: 'unauthorised'; userMessage: string }
  | { kind: 'bad_request'; userMessage: string }
  | { kind: 'not_found'; userMessage: string }
  | { kind: 'upstream_error'; userMessage: string }
  | { kind: 'unknown'; userMessage: string };

export interface HandleYapilyErrorContext {
  /** Identifies the call site (e.g. 'bank-sync', 'money-hub.transactions') */
  source: string;
  /** Optional connection id to flip to 'expired' on 403 */
  connectionId?: string;
}

/**
 * Inspect a YapilyError, log to business_log, and (on 403) mark the
 * affected bank_connections row as expired so the renewal banner fires.
 *
 * Returns a YapilyErrorOutcome the caller can use to construct an HTTP
 * response or branch the next step. Never re-throws.
 */
export async function handleYapilyError(
  err: unknown,
  ctx: HandleYapilyErrorContext,
): Promise<YapilyErrorOutcome> {
  const isYapily = err instanceof YapilyError;
  const status = isYapily ? err.status : 0;
  const code = isYapily ? err.code : undefined;
  const message = err instanceof Error ? err.message : String(err);

  // Pick severity per class (T7 coverage)
  let severity: 'info' | 'warn' | 'error' = 'warn';
  if (status === 401 || status >= 500) severity = 'error';
  else if (status === 404) severity = 'info';

  const admin = getAdmin();

  // Log to business_log — best-effort, never let logging break the route.
  try {
    await admin.from('business_log').insert({
      source: `yapily.${ctx.source}`,
      severity,
      summary: `Yapily ${status || '???'} — ${message}`.slice(0, 500),
      metadata: {
        status,
        code,
        connection_id: ctx.connectionId ?? null,
        message,
      },
    });
  } catch {
    /* swallow */
  }

  // 403 → flip the connection so the renewal banner picks it up (T6)
  if (status === 403 && ctx.connectionId) {
    await admin
      .from('bank_connections')
      .update({
        status: 'expired',
        consent_status: 'EXPIRED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.connectionId)
      .then(({ error: updErr }) => {
        if (updErr) {
          console.warn(
            `[yapily.error-handler] failed to flip connection ${ctx.connectionId} to expired:`,
            updErr.message,
          );
        }
      });
  }

  if (!isYapily) {
    return { kind: 'unknown', userMessage: 'Something went wrong contacting your bank. Please try again.' };
  }

  switch (status) {
    case 400:
      return { kind: 'bad_request', userMessage: 'Your bank rejected the request. Please try again.' };
    case 401:
      return { kind: 'unauthorised', userMessage: 'Bank connection is not configured correctly. Please contact support.' };
    case 403:
      return { kind: 'reconsent', userMessage: 'Your bank consent has expired. Please reconnect.' };
    case 404:
      return { kind: 'not_found', userMessage: 'The bank account or consent could not be found.' };
    case 429: {
      // Yapily includes a Retry-After hint sometimes; we keep the
      // simple default of 60s if absent.
      return { kind: 'rate_limited', userMessage: 'Your bank is rate-limiting requests. Try again in a minute.', retryAfterMs: 60_000 };
    }
    default:
      if (status >= 500) {
        return { kind: 'upstream_error', userMessage: 'Your bank is having trouble responding. We will retry automatically.' };
      }
      return { kind: 'unknown', userMessage: 'Something went wrong contacting your bank. Please try again.' };
  }
}
