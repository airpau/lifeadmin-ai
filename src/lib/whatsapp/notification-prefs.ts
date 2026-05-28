/**
 * WhatsApp notification preference helpers.
 *
 * The 17 user-facing WhatsApp alert keys (matching the toggles on the
 * /dashboard/profile?tab=notifications surface) map onto the underlying
 * `notification_preferences.event_type` rows. Calling sites use the
 * stable `WhatsAppAlertKey` strings so they don't need to know which
 * event_type backs them.
 *
 * Default behaviour when no row exists for the user:
 *   - All keys default to TRUE (per product spec, 2026-05-28).
 *   - If a row exists with `whatsapp = false`, the alert is skipped.
 *
 * This is intentionally lenient — the unified dispatcher
 * (`sendNotification`) in `src/lib/notifications/dispatch.ts` already
 * checks the row; this helper exists for crons or send-sites that
 * dispatch outside of that helper and want a single boolean answer.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationEventType } from '@/lib/notifications/events';

/** Stable user-facing key for each WhatsApp alert toggle. */
export type WhatsAppAlertKey =
  | 'whatsapp_price_increase'
  | 'whatsapp_renewal_reminder'
  | 'whatsapp_unusual_charge'
  | 'whatsapp_trial_ending'
  | 'whatsapp_budget_alert'
  | 'whatsapp_savings_milestone'
  | 'whatsapp_better_deal'
  | 'whatsapp_weekly_recovery'
  | 'whatsapp_letter_ready'
  | 'whatsapp_money_recovered'
  | 'whatsapp_reconnect_required'
  | 'whatsapp_morning_summary'
  | 'whatsapp_dispute_reply'
  | 'whatsapp_dispute_agent_action'
  | 'whatsapp_payment_received'
  | 'whatsapp_payment_outgoing'
  | 'whatsapp_dd_warning';

/** Stable alert-key → underlying notification event_type mapping. */
export const ALERT_KEY_TO_EVENT: Record<WhatsAppAlertKey, NotificationEventType> = {
  whatsapp_price_increase: 'price_increase',
  whatsapp_renewal_reminder: 'renewal_reminder',
  whatsapp_unusual_charge: 'unusual_charge',
  whatsapp_trial_ending: 'trial_ending',
  whatsapp_budget_alert: 'budget_alert',
  whatsapp_savings_milestone: 'savings_milestone',
  whatsapp_better_deal: 'deal_alert',
  whatsapp_weekly_recovery: 'recovery_weekly',
  whatsapp_letter_ready: 'complaint_letter_ready',
  whatsapp_money_recovered: 'money_recovered',
  whatsapp_reconnect_required: 'reconnect_required',
  whatsapp_morning_summary: 'morning_summary',
  whatsapp_dispute_reply: 'dispute_reply',
  whatsapp_dispute_agent_action: 'dispute_agent_action',
  whatsapp_payment_received: 'payment_received',
  whatsapp_payment_outgoing: 'payment_outgoing',
  whatsapp_dd_warning: 'dd_warning',
};

export const ALL_WHATSAPP_ALERT_KEYS = Object.keys(ALERT_KEY_TO_EVENT) as WhatsAppAlertKey[];

/**
 * Returns the per-user record of `{ whatsapp_xxx: boolean }` for every
 * known WhatsApp alert key. Defaults missing rows to TRUE — the spec
 * is opt-out, not opt-in.
 */
export async function getUserNotificationPrefs(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<WhatsAppAlertKey, boolean>> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('event_type, whatsapp')
    .eq('user_id', userId);

  const eventState = new Map<string, boolean>();
  for (const row of data ?? []) {
    eventState.set(row.event_type as string, (row as { whatsapp?: boolean }).whatsapp ?? true);
  }

  const out = {} as Record<WhatsAppAlertKey, boolean>;
  for (const key of ALL_WHATSAPP_ALERT_KEYS) {
    const event = ALERT_KEY_TO_EVENT[key];
    out[key] = eventState.has(event) ? !!eventState.get(event) : true;
  }
  return out;
}

/**
 * Cheap point-check used by send-sites. Returns TRUE when no explicit
 * row exists (opt-out semantics). Returns FALSE only when the user has
 * a row that explicitly sets `whatsapp = false`.
 */
export async function isAlertEnabled(
  supabase: SupabaseClient,
  userId: string,
  alertKey: WhatsAppAlertKey,
): Promise<boolean> {
  const event = ALERT_KEY_TO_EVENT[alertKey];
  if (!event) return true;
  const { data } = await supabase
    .from('notification_preferences')
    .select('whatsapp')
    .eq('user_id', userId)
    .eq('event_type', event)
    .maybeSingle();
  if (!data) return true;
  return (data as { whatsapp?: boolean }).whatsapp ?? true;
}

/** Bulk pref upsert — UI calls this to flip a single toggle. */
export async function setAlertEnabled(
  supabase: SupabaseClient,
  userId: string,
  alertKey: WhatsAppAlertKey,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const event = ALERT_KEY_TO_EVENT[alertKey];
  if (!event) return { ok: false, error: 'unknown alert key' };
  // Preserve existing per-channel flags for the row by reading first,
  // then upserting back. If the row is brand new we use the event's
  // catalog defaults for the non-WhatsApp channels.
  const { data: existing } = await supabase
    .from('notification_preferences')
    .select('email, telegram, push')
    .eq('user_id', userId)
    .eq('event_type', event)
    .maybeSingle();

  const upsert = {
    user_id: userId,
    event_type: event,
    email: existing?.email ?? true,
    telegram: existing?.telegram ?? true,
    push: existing?.push ?? true,
    whatsapp: enabled,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(upsert, { onConflict: 'user_id,event_type' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
