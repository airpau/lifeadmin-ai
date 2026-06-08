/**
 * Phase 3 — detection threshold overrides.
 *
 * The bank-sync detection layer historically used hard-coded thresholds:
 *   - price_increase: >= 5% above rolling baseline
 *   - unusual_charge: >= 20% above 90-day merchant average
 *
 * These constants worked when we had no engagement data. Now that the
 * intelligence layer is recording dismiss / acted_on per alert, we can
 * tune per-(kind, merchant) automatically: if a merchant's alerts get
 * dismissed 5/6 times in a row, the user's telling us the threshold is
 * too sensitive for that merchant. Raise it and watch what happens.
 *
 * Source of truth: intelligence_events with action_kind='threshold_raised'.
 * Each row carries:
 *   subject_kind = 'detection_threshold'
 *   subject_id   = '<kind>:<merchant_normalised>'    (or '<kind>:*' for default)
 *   predicted    = { kind, merchant, old_value, new_value, reason }
 *
 * `getEffectiveThreshold` reads the most recent raise for the given
 * (kind, merchant) pair and returns it; if none exists, returns the
 * caller-supplied default. The auto-tune step in the daily rollup is the
 * only writer. Founders can read the per-merchant override log in the
 * admin dashboard and can manually clear them (writes a separate
 * 'threshold_reset' event the resolver respects).
 *
 * Caching: each call hits Supabase. That's fine for crons (one read per
 * detection candidate) but could be hot for tighter loops; for now we
 * keep it simple, no in-memory cache.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DetectionKind = 'price_increase' | 'unusual_charge';

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface OverrideRow {
  emitted_at: string;
  predicted: { new_value?: number } | null;
  action_kind: string;
}

/**
 * Look up the current effective threshold for (kind, merchantNormalised).
 *
 * Resolution order:
 *   1. most-recent 'threshold_raised' OR 'threshold_reset' event for
 *      subject_id `<kind>:<merchant>` — whichever event happened last
 *      wins. Reset events reinstate the default.
 *   2. Fall through to the caller-supplied `defaultValue`.
 *
 * Returns the default on any error so the detection cron never
 * silently stops emitting alerts because of a Supabase outage.
 */
export async function getEffectiveThreshold(
  kind: DetectionKind,
  merchantNormalised: string | null,
  defaultValue: number,
): Promise<number> {
  if (!merchantNormalised) return defaultValue;
  const sb = admin();
  if (!sb) return defaultValue;
  try {
    const subjectId = `${kind}:${merchantNormalised}`;
    const { data } = await sb
      .from('intelligence_events')
      .select('emitted_at, predicted, action_kind')
      .eq('subject_kind', 'detection_threshold')
      .eq('subject_id', subjectId)
      .in('action_kind', ['threshold_raised', 'threshold_reset'])
      .order('emitted_at', { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as OverrideRow | undefined;
    if (!row) return defaultValue;
    if (row.action_kind === 'threshold_reset') return defaultValue;
    if (typeof row.predicted?.new_value === 'number') return row.predicted.new_value;
    return defaultValue;
  } catch (err) {
    console.warn('[intelligence/threshold] lookup failed, using default:', err);
    return defaultValue;
  }
}

/**
 * Record that the auto-tune step raised a threshold. Used by the daily
 * rollup. Fire-and-forget — failures log a warning.
 */
export async function recordThresholdRaise(args: {
  kind: DetectionKind;
  merchantNormalised: string;
  oldValue: number;
  newValue: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const sb = admin();
  if (!sb) return;
  try {
    await sb.from('intelligence_events').insert({
      user_id: null,
      actor: 'system',
      action_kind: 'threshold_raised',
      subject_kind: 'detection_threshold',
      subject_id: `${args.kind}:${args.merchantNormalised}`,
      predicted: {
        kind: args.kind,
        merchant: args.merchantNormalised,
        old_value: args.oldValue,
        new_value: args.newValue,
        reason: args.reason,
      },
      metadata: {
        source: 'cron/intelligence-rollup-daily',
        ...(args.metadata ?? {}),
      },
    });
  } catch (err) {
    console.warn('[intelligence/threshold] raise failed:', err);
  }
}

/**
 * Record a founder-initiated reset (clears the auto-tune override and
 * reinstates the default). Not used by the cron; exposed for the admin
 * dashboard.
 */
export async function recordThresholdReset(args: {
  kind: DetectionKind;
  merchantNormalised: string;
  resetByUserId?: string | null;
}): Promise<void> {
  const sb = admin();
  if (!sb) return;
  try {
    await sb.from('intelligence_events').insert({
      user_id: args.resetByUserId ?? null,
      actor: 'user',
      action_kind: 'threshold_reset',
      subject_kind: 'detection_threshold',
      subject_id: `${args.kind}:${args.merchantNormalised}`,
      predicted: { kind: args.kind, merchant: args.merchantNormalised },
      metadata: { source: 'admin/detection-thresholds' },
    });
  } catch (err) {
    console.warn('[intelligence/threshold] reset failed:', err);
  }
}
