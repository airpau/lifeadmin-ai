/**
 * Fire-and-forget logger for alert_interactions.
 *
 * Every place in the codebase where a user acts on / dismisses /
 * snoozes / views one of our alerts should call this. The insert is
 * non-blocking — failures are swallowed so a misconfigured DB or
 * missing column can never slow the UX path.
 *
 * Don't `await` this from a hot path. Just call and move on.
 */

import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Canonical alert categories. Keep in sync with the alert event
 * types defined in src/lib/notifications/events.ts.
 *
 * The string is plain text on the DB side, so any new value is
 * accepted at runtime — but adding it to this union forces every
 * call site to be type-checked at build time.
 */
export type AlertType =
  | 'price_increase'
  | 'renewal'
  | 'contract_expiry'
  | 'budget'
  | 'dispute'
  | 'dispute_reply'
  | 'dispute_no_response'
  | 'dispute_agent_recommendation'
  | 'detected_issues'
  | 'overcharge'
  | 'unused_subscription'
  | 'bank_prompt'
  | 'opportunity'
  | 'action_item'
  | 'money_hub_alert'
  | 'task'
  | 'price_alert'
  | 'notification'
  | 'subscription'
  | 'morning_brief'
  | 'income_received'
  | 'reconnect_required';

export type AlertAction = 'dismissed' | 'acted' | 'snoozed' | 'viewed';

export type AlertSurface = 'web' | 'telegram' | 'whatsapp' | 'email' | 'api';

export interface LogAlertInteractionParams {
  userId: string;
  alertType: AlertType | string;
  alertKey?: string | null;
  action: AlertAction;
  responseTimeSeconds?: number | null;
  surface?: AlertSurface;
  metadata?: Record<string, unknown> | null;
  /**
   * Pass an existing Supabase client (server / admin) to avoid
   * re-creating one per call. If omitted we build a service-role
   * client on the fly.
   */
  client?: SupabaseClient;
}

let cachedAdmin: SupabaseClient | null = null;

function adminClient(): SupabaseClient | null {
  if (cachedAdmin) return cachedAdmin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedAdmin = createServiceClient(url, key, { auth: { persistSession: false } });
  return cachedAdmin;
}

/**
 * Insert an alert_interactions row. Returns a Promise but should NOT
 * be awaited from request handlers — fire it and move on. Errors are
 * swallowed (logged once with a warning) to guarantee non-blocking
 * behaviour.
 */
export function logAlertInteraction(params: LogAlertInteractionParams): Promise<void> {
  const {
    userId,
    alertType,
    alertKey = null,
    action,
    responseTimeSeconds = null,
    surface = 'web',
    metadata = null,
    client,
  } = params;

  // Defensive guard — don't pollute the table with malformed rows.
  if (!userId || !alertType || !action) {
    return Promise.resolve();
  }

  const sb = client ?? adminClient();
  if (!sb) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[alert-interactions] no supabase client available; skipping log');
    }
    return Promise.resolve();
  }

  // Master's alert_interactions table (migration 20260516000000) only has:
  //   user_id, alert_type, alert_key, action, response_time_seconds, created_at
  // The `surface` and `metadata` parameters are still accepted by this
  // helper (so call sites stay expressive), but we don't try to write
  // them — they'd be dropped by the schema. Once the table gains those
  // columns we can start persisting them.
  void surface;
  void metadata;
  const row: Record<string, unknown> = {
    user_id: userId,
    alert_type: alertType,
    alert_key: alertKey ? String(alertKey).slice(0, 200) : null,
    action,
  };
  if (responseTimeSeconds != null && Number.isFinite(responseTimeSeconds)) {
    row.response_time_seconds = Math.max(0, Math.floor(responseTimeSeconds));
  }

  // Wrap in an explicit Promise so we always return a real Promise
  // (the supabase PostgrestBuilder is PromiseLike, no `.catch`).
  return new Promise<void>((resolve) => {
    Promise.resolve(sb.from('alert_interactions').insert(row))
      .then(({ error }: { error: { message?: string } | null }) => {
        if (error) {
          const msg = error.message || '';
          if (!/violates|does not exist|column .* not found|relation .* does not exist/i.test(msg)) {
            console.warn('[alert-interactions] insert failed', msg);
          }
        }
        resolve();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[alert-interactions] insert threw', msg);
        resolve();
      });
  });
}

/**
 * Compute response_time_seconds from a created_at-style ISO string.
 * Returns null if the timestamp can't be parsed.
 */
export function responseTimeFrom(isoCreatedAt: string | null | undefined): number | null {
  if (!isoCreatedAt) return null;
  const t = Date.parse(isoCreatedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}
