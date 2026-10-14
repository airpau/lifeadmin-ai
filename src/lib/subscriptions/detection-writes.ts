// src/lib/subscriptions/detection-writes.ts
//
// Write helpers shared by the bank subscription detector and the daily
// re-validation cron. They tolerate the detection_* columns not existing
// yet (migration 20261014120000 not applied): the write is retried
// without them, so deploying the code before the migration is safe.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DetectionResult, DetectionStatus, DetectedCadence } from './recurrence-detector';

export interface DetectionColumns {
  detection_status?: DetectionStatus;
  detection_confidence?: number | null;
  detection_cadence?: DetectedCadence | null;
  detection_reason?: string | null;
  detection_checked_at?: string;
}

let detectionColumnsMissing = false;

function isMissingColumnError(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === '42703' || err.code === 'PGRST204') return true;
  return /detection_(status|confidence|cadence|reason|checked_at)/.test(err.message || '');
}

function strip<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row };
  for (const k of Object.keys(out)) if (k.startsWith('detection_')) delete out[k];
  return out;
}

/** UPDATE one subscription row, dropping detection_* if the columns are absent. */
export async function updateSubscriptionDetection(
  supabase: SupabaseClient,
  id: string,
  fields: Record<string, unknown> & DetectionColumns,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const payload = detectionColumnsMissing ? strip(fields) : fields;
  if (Object.keys(payload).length === 0) return { error: null };
  const { error } = await supabase.from('subscriptions').update(payload).eq('id', id);
  if (error && !detectionColumnsMissing && isMissingColumnError(error)) {
    detectionColumnsMissing = true;
    const rest = strip(fields);
    if (Object.keys(rest).length === 0) return { error: null };
    const retry = await supabase.from('subscriptions').update(rest).eq('id', id);
    return { error: retry.error };
  }
  return { error };
}

/** INSERT one subscription row, dropping detection_* if the columns are absent. */
export async function insertSubscriptionDetection(
  supabase: SupabaseClient,
  row: Record<string, unknown> & DetectionColumns,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const payload = detectionColumnsMissing ? strip(row) : row;
  const { error } = await supabase.from('subscriptions').insert(payload);
  if (error && !detectionColumnsMissing && isMissingColumnError(error)) {
    detectionColumnsMissing = true;
    const retry = await supabase.from('subscriptions').insert(strip(row));
    return { error: retry.error };
  }
  return { error };
}

/**
 * billing_cycle only allows monthly / quarterly / yearly / one-time
 * (subscriptions_billing_cycle_check). Weekly and fortnightly charges
 * are stored as their monthly equivalent; the true cadence goes in
 * detection_cadence. The old detector tried to write 'weekly', which
 * the CHECK rejected, so weekly subscriptions never appeared at all.
 */
export function storedCycleAndAmount(
  result: Pick<DetectionResult, 'cadence' | 'amount'>,
): { billing_cycle: 'monthly' | 'quarterly' | 'yearly'; amount: number } {
  const amount = result.amount ?? 0;
  switch (result.cadence) {
    case 'weekly':
      return { billing_cycle: 'monthly', amount: Math.round(((amount * 52) / 12) * 100) / 100 };
    case 'fortnightly':
      return { billing_cycle: 'monthly', amount: Math.round(((amount * 26) / 12) * 100) / 100 };
    case 'quarterly':
      return { billing_cycle: 'quarterly', amount };
    case 'yearly':
      return { billing_cycle: 'yearly', amount };
    default:
      return { billing_cycle: 'monthly', amount };
  }
}

export function detectionColumnsFor(
  status: DetectionStatus,
  reason: string,
  result: DetectionResult | null,
): DetectionColumns {
  return {
    detection_status: status,
    detection_confidence: result ? result.confidence : null,
    detection_cadence: result?.cadence ?? null,
    detection_reason: reason.slice(0, 80),
    detection_checked_at: new Date().toISOString(),
  };
}
