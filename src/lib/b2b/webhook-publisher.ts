/**
 * B2B outbound webhook publisher.
 *
 * Single helper for the legal-monitoring cron and any other server-side
 * code that needs to fan a `statute.updated` (or other supported)
 * event out to every customer who's subscribed to it.
 *
 * Delivery model: each delivery is attempted inline (single-shot, 8s
 * timeout) and the outcome lands in b2b_webhook_deliveries. Five
 * consecutive failures auto-disable the webhook (matched to the
 * portal's existing rule). Retries on transient failures are NOT
 * automatic; the customer's portal "Recent deliveries" view shows the
 * failure and they can hit "Replay" to re-send.
 *
 * Signing limitation (2026-04-28): we currently store only the SHA-256
 * hash of each webhook's signing secret, not the plaintext, so the
 * outbound `Paybacker-Signature` header is set to the literal value
 * `unsigned` for now. The customer-facing documentation reflects this
 * honestly. A follow-up encrypted-at-rest migration will unblock real
 * HMAC signing without changing this helper's contract.
 */

import { createClient } from '@supabase/supabase-js';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const FAILURE_AUTO_DISABLE_THRESHOLD = 5;
const PER_DELIVERY_TIMEOUT_MS = 8000;

interface ActiveWebhook {
  id: string;
  url: string;
  events: string[];
  consecutive_failures: number | null;
}

export async function fanOut(event: string, payload: Record<string, unknown>): Promise<{ delivered: number; failed: number }> {
  const sb = admin();

  const { data: hooks, error } = await sb
    .from('b2b_webhooks')
    .select('id, url, events, consecutive_failures')
    .eq('is_active', true)
    .contains('events', [event]);

  if (error) {
    console.warn('[webhook-publisher] active-webhook lookup failed', error.message);
    return { delivered: 0, failed: 0 };
  }
  if (!hooks || hooks.length === 0) return { delivered: 0, failed: 0 };

  const body = JSON.stringify({
    type: event,
    sent_at: new Date().toISOString(),
    data: payload,
  });

  let delivered = 0;
  let failed = 0;

  await Promise.all(
    (hooks as ActiveWebhook[]).map(async (hook) => {
      const t0 = Date.now();
      let status: number | null = null;
      let err: string | null = null;

      try {
        const r = await fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Paybacker-Event': event,
            // Plaintext secrets are not stored (only SHA-256 hash) so
            // signed delivery isn't possible until the secret-storage
            // upgrade ships. Customers verify by URL receipt + 200
            // status until then.
            'Paybacker-Signature': 'unsigned',
            'Paybacker-Delivery-Id': crypto.randomUUID(),
          },
          body,
          signal: AbortSignal.timeout(PER_DELIVERY_TIMEOUT_MS),
        });
        status = r.status;
        if (status >= 200 && status < 300) delivered++;
        else failed++;
      } catch (e) {
        err = e instanceof Error ? e.message : String(e);
        failed++;
      }

      const latency = Date.now() - t0;
      const success = status !== null && status >= 200 && status < 300;

      // Record the delivery. Failure increments consecutive_failures
      // and auto-disables at the threshold; success resets the counter.
      try {
        await sb.from('b2b_webhook_deliveries').insert({
          webhook_id: hook.id,
          event,
          status_code: status,
          latency_ms: latency,
          error: err,
        });

        if (success) {
          await sb
            .from('b2b_webhooks')
            .update({
              last_delivery_at: new Date().toISOString(),
              last_delivery_status: status,
              consecutive_failures: 0,
            })
            .eq('id', hook.id);
        } else {
          const nextFailures = (hook.consecutive_failures ?? 0) + 1;
          await sb
            .from('b2b_webhooks')
            .update({
              last_delivery_at: new Date().toISOString(),
              last_delivery_status: status,
              consecutive_failures: nextFailures,
              is_active: nextFailures < FAILURE_AUTO_DISABLE_THRESHOLD,
            })
            .eq('id', hook.id);
        }
      } catch (logErr) {
        console.warn(
          '[webhook-publisher] delivery log failed',
          logErr instanceof Error ? logErr.message : logErr,
        );
      }
    }),
  );

  return { delivered, failed };
}

/**
 * Fire `statute.updated` to every customer subscribed to it.
 *
 * Called from the legal-monitoring crons (verify-legal-refs,
 * legal-updates) immediately after a row's verification_status flips
 * to `updated` — i.e. the engine has noticed a material change to a
 * UK statute, regulator code, or guidance note that the API can cite.
 *
 * Payload shape matches what the docs at /for-business/docs §7 promise:
 *   { category, law_name, change_summary, effective_date, source_url }
 *
 * This is fire-and-forget for the cron — failures are logged in
 * b2b_webhook_deliveries (visible in the customer portal) but never
 * propagate up to the cron's own success/failure status.
 */
export async function publishStatuteUpdated(input: {
  category: string;
  law_name: string;
  change_summary: string;
  effective_date?: string | null;
  source_url?: string | null;
  ref_id?: string;
}): Promise<{ delivered: number; failed: number }> {
  return fanOut('statute.updated', {
    category: input.category,
    law_name: input.law_name,
    change_summary: input.change_summary,
    effective_date: input.effective_date ?? null,
    source_url: input.source_url ?? null,
    ref_id: input.ref_id ?? null,
  });
}

/**
 * Fire `key.created` to every customer subscribed.
 * Called from /api/v1/free-pilot and the Stripe webhook (paid-tier mint).
 */
export async function publishKeyCreated(input: {
  key_prefix: string;
  tier: 'starter' | 'growth' | 'enterprise';
  owner_email: string;
  source: 'free_pilot' | 'stripe_checkout' | 'stripe_subscription_renewed';
  actor_ip?: string | null;
  user_agent?: string | null;
}): Promise<{ delivered: number; failed: number }> {
  return fanOut('key.created', {
    key_prefix: input.key_prefix,
    tier: input.tier,
    owner_email: input.owner_email,
    source: input.source,
    actor_ip: input.actor_ip ?? null,
    user_agent: input.user_agent ?? null,
    created_at: new Date().toISOString(),
  });
}

/**
 * Fire `key.revoked` to every customer subscribed. Called from the
 * customer portal revoke / re-issue actions and from the Stripe
 * subscription-deleted webhook.
 */
export async function publishKeyRevoked(input: {
  key_prefix: string;
  owner_email: string;
  reason: 'customer_revoked' | 'reissue_revoke' | 'subscription_cancelled' | 'free_to_paid_upgrade';
  actor_email?: string | null;
  actor_ip?: string | null;
  user_agent?: string | null;
}): Promise<{ delivered: number; failed: number }> {
  return fanOut('key.revoked', {
    key_prefix: input.key_prefix,
    owner_email: input.owner_email,
    reason: input.reason,
    actor_email: input.actor_email ?? null,
    actor_ip: input.actor_ip ?? null,
    user_agent: input.user_agent ?? null,
    revoked_at: new Date().toISOString(),
  });
}

/**
 * Fire `key.reissued` to every customer subscribed. Called from the
 * customer portal re-issue action.
 */
export async function publishKeyReissued(input: {
  key_prefix_new: string;
  key_prefix_old: string;
  owner_email: string;
  tier: 'starter' | 'growth' | 'enterprise';
  actor_email?: string | null;
  actor_ip?: string | null;
  user_agent?: string | null;
}): Promise<{ delivered: number; failed: number }> {
  return fanOut('key.reissued', {
    key_prefix_new: input.key_prefix_new,
    key_prefix_old: input.key_prefix_old,
    owner_email: input.owner_email,
    tier: input.tier,
    actor_email: input.actor_email ?? null,
    actor_ip: input.actor_ip ?? null,
    user_agent: input.user_agent ?? null,
    reissued_at: new Date().toISOString(),
  });
}

/**
 * Fire `key.usage_threshold_60` or `key.usage_threshold_90` when a key
 * crosses the threshold. Called from the request-counting path on
 * authenticate/logUsage at the moment the count tips over. Idempotent
 * via b2b_api_keys.notified_thresholds — a key only fires each
 * threshold once per calendar month.
 */
export async function publishUsageThreshold(input: {
  threshold: 60 | 90;
  key_prefix: string;
  owner_email: string;
  tier: 'starter' | 'growth' | 'enterprise';
  calls_used: number;
  monthly_limit: number;
  period_resets_at: string;
}): Promise<{ delivered: number; failed: number }> {
  const event = input.threshold === 60 ? 'key.usage_threshold_60' : 'key.usage_threshold_90';
  return fanOut(event, {
    key_prefix: input.key_prefix,
    owner_email: input.owner_email,
    tier: input.tier,
    calls_used: input.calls_used,
    monthly_limit: input.monthly_limit,
    percent_used: Math.round((input.calls_used / input.monthly_limit) * 100),
    period_resets_at: input.period_resets_at,
  });
}

/**
 * Fire `usage.daily_summary` to every customer subscribed. One row
 * per active api key, summarising the previous calendar day. Called
 * from the daily b2b-usage-summary cron.
 */
export async function publishUsageDailySummary(input: {
  date: string;
  per_key: Array<{
    key_prefix: string;
    owner_email: string;
    total_calls: number;
    error_count: number;
    p50_ms: number;
    p95_ms: number;
  }>;
  total_calls: number;
  total_errors: number;
}): Promise<{ delivered: number; failed: number }> {
  return fanOut('usage.daily_summary', {
    date: input.date,
    total_calls: input.total_calls,
    error_count: input.total_errors,
    per_key: input.per_key,
  });
}
