/**
 * Phase 2 — WhatsApp send-time optimisation.
 *
 * Holds non-urgent, non-critical WhatsApp alerts until the user's learned best
 * engagement hour (user_intelligence_profile.preferred_alert_hour, derived
 * nightly by update_preferred_alert_hours from the intelligence ledger).
 *
 * Design choices that keep this safe:
 *  - Only DEFERS FORWARD within the same day. If the preferred hour has already
 *    passed (or is the current hour), the alert sends immediately — we never
 *    delay an alert to tomorrow.
 *  - Only non-critical alerts in the summaries / reminders / marketing groups
 *    are eligible. Refunds, dispute replies, price hikes, DD warnings, etc.
 *    (critical / real-time) always send now.
 *  - Fail-open: any error returns false (send now). Returns true only after a
 *    row is successfully queued (or already queued), so an alert is never
 *    silently dropped.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_CATALOG } from '@/lib/notifications/events';
import type { WhatsAppPayload } from '@/lib/notifications/dispatch';

/** Event groups non-urgent enough to hold for the user's best hour. */
const DEFERRABLE_GROUPS = new Set(['summaries', 'reminders', 'marketing']);

export function isDeferrableEvent(event: string): boolean {
  const meta = EVENT_CATALOG.find((e) => e.event === event);
  if (!meta) return false;
  if (meta.critical) return false; // never defer critical/time-sensitive alerts
  return DEFERRABLE_GROUPS.has(meta.group);
}

function londonHour(d: Date): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        hour12: false,
      }).format(d),
    );
  } catch {
    return d.getUTCHours();
  }
}

export async function getPreferredHour(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  try {
    const { data } = await supabase
      .from('user_intelligence_profile')
      .select('preferred_alert_hour')
      .eq('user_id', userId)
      .maybeSingle();
    const h = data?.preferred_alert_hour;
    return typeof h === 'number' && h >= 0 && h <= 23 ? h : null;
  } catch {
    return null;
  }
}

export interface DeferInput {
  userId: string;
  eventType: string;
  whatsapp: WhatsAppPayload;
}

/**
 * Decide whether to hold this WhatsApp alert for the user's preferred hour.
 * Returns true only after the alert is queued (so the caller must NOT send it
 * now). Returns false to send immediately.
 */
export async function maybeDeferAlert(
  supabase: SupabaseClient,
  input: DeferInput,
): Promise<boolean> {
  try {
    if (!isDeferrableEvent(input.eventType)) return false;

    const pref = await getPreferredHour(supabase, input.userId);
    if (pref == null) return false; // no learned hour yet → send now

    const now = new Date();
    const nowHr = londonHour(now);
    // Only hold forward, same-day. Best hour now or already passed → send now.
    if (pref <= nowHr) return false;

    const releaseAfter = new Date(now.getTime() + (pref - nowHr) * 3_600_000);
    const dedupKey = `${input.eventType}:${input.whatsapp.templateName ?? 'text'}:${(
      input.whatsapp.templateParameters ?? []
    ).join('|')}`.slice(0, 250);

    const { error } = await supabase.from('whatsapp_alert_queue').insert({
      user_id: input.userId,
      event_type: input.eventType,
      template_name: input.whatsapp.templateName ?? null,
      payload: input.whatsapp,
      release_after: releaseAfter.toISOString(),
      dedup_key: dedupKey,
    });

    if (error) {
      // 23505 = already queued for this user+event → treat as deferred so we
      // don't double-send. Any other error → fail open (send now).
      if ((error as { code?: string }).code === '23505') return true;
      console.warn('[send-time] enqueue failed (sending now):', error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[send-time] maybeDeferAlert failed (sending now):', (e as Error)?.message ?? e);
    return false;
  }
}
