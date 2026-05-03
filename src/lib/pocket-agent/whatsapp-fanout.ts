/**
 * whatsappFanoutForCron — shared helper for the digest-style crons
 * (telegram-morning-summary, weekly-money-digest,
 * telegram-savings-milestone) that need to fan out to WhatsApp Pro
 * users without owning any of the cost / window / opt-in logic.
 *
 * Why this exists
 * ---------------
 * Each of those crons has its own rich Telegram-Markdown formatter
 * we don't want to disturb (touched ones already break in subtle
 * ways). What was missing was a parallel WhatsApp branch that:
 *   1. Filters to Pro users only (canUseWhatsApp gate).
 *   2. Reads the user's active WhatsApp session.
 *   3. Builds the per-template variables the caller supplies.
 *   4. Defers the actual send to dispatchPocketAgentAlert which
 *      already handles the 24h service-window text fallback,
 *      marketing opt-in gate, 24h frequency cap, and the
 *      last_marketing_template_at stamp.
 *
 * The cron just iterates its own user list, calls this helper with
 * an `(userId) → vars` builder, and gets back a count of what
 * happened. No template SIDs, no rate-limit logic, no marketing
 * gate — all of that lives in dispatchPocketAgentAlert.
 */

import { canUseWhatsApp } from '@/lib/plan-limits';
import {
  dispatchPocketAgentAlert,
  type AlertType,
  type ActiveSession,
} from '@/lib/pocket-agent/dispatch';

// Loose type — the cron passes an admin-role Supabase client, the
// generic instantiation differs from this lib's defaults but we
// only call .from().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export interface WhatsAppFanoutResult {
  /** Pro users we attempted to send to. */
  attempted: number;
  /** Sends that succeeded (text path or template path). */
  sent: number;
  /** Skips the dispatcher returned (no opt-in, cap, no template, etc.). */
  skipped: Array<{ user_id: string; reason: string }>;
  /** Hard errors. */
  errors: Array<{ user_id: string; error: string }>;
}

interface UserSessionRow {
  user_id: string;
  whatsapp_phone: string;
}

/**
 * Fan out a single alert type to every Pro WhatsApp user the caller
 * specifies. The vars builder is called once per user — return
 * `null` to skip that user (e.g. they have no relevant data).
 *
 * The caller MUST gate on subscription tier itself if it has a
 * cheaper way to do it. We always also call canUseWhatsApp as a
 * second-line guard — so a Pro-tier change mid-cron doesn't
 * accidentally fire a paid template at a free user.
 */
export async function whatsappFanoutForCron(args: {
  supabase: AdminClient;
  alertType: AlertType;
  /** User IDs the cron has already determined are eligible for the alert. */
  userIds: string[];
  /**
   * Build the WhatsApp template variables for one user. Return
   * `null` to silently skip them (e.g. no data, threshold not hit).
   * Throw to surface as a hard error — the loop continues with the
   * next user.
   */
  buildVars: (userId: string) => Promise<Record<string, string | number> | null>;
  /**
   * Optional alert-type label for log lines. Defaults to alertType.
   */
  logLabel?: string;
}): Promise<WhatsAppFanoutResult> {
  const { supabase, alertType, userIds, buildVars } = args;
  const label = args.logLabel ?? alertType;

  const result: WhatsAppFanoutResult = {
    attempted: 0,
    sent: 0,
    skipped: [],
    errors: [],
  };

  if (userIds.length === 0) return result;

  // One round trip to load all linked WhatsApp sessions for these users.
  const { data: rows } = await supabase
    .from('whatsapp_sessions')
    .select('user_id, whatsapp_phone')
    .in('user_id', userIds)
    .eq('is_active', true)
    .is('opted_out_at', null);

  const sessionByUser = new Map<string, UserSessionRow>(
    (rows ?? []).map((r: UserSessionRow) => [r.user_id, r]),
  );

  for (const userId of userIds) {
    const row = sessionByUser.get(userId);
    if (!row) continue; // No WhatsApp session → handled by Telegram path or no-op.

    // Belt-and-braces tier check. The cron should already have
    // filtered to Pro users, but a tier change mid-loop would
    // otherwise leak a paid template to a free user.
    const allowed = await canUseWhatsApp(userId);
    if (!allowed) {
      result.skipped.push({ user_id: userId, reason: 'not_pro' });
      continue;
    }

    let vars: Record<string, string | number> | null;
    try {
      vars = await buildVars(userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-fanout/${label}] buildVars threw for ${userId}:`, message);
      result.errors.push({ user_id: userId, error: message });
      continue;
    }

    if (vars === null) continue;

    const session: ActiveSession = {
      user_id: userId,
      channel: 'whatsapp',
      destination: row.whatsapp_phone,
    };

    result.attempted += 1;
    try {
      const dispatchResult = await dispatchPocketAgentAlert({
        session,
        alertType,
        // The detected_issues row is optional for Telegram inline
        // buttons; the WhatsApp path doesn't use it. Pass a stable
        // synthetic id so logs can correlate cron runs to sends.
        detectedIssueId: `${alertType}:${userId}:${new Date().toISOString().slice(0, 10)}`,
        whatsappVars: vars,
        supabase,
      });

      if (dispatchResult.ok) {
        result.sent += 1;
      } else {
        result.skipped.push({
          user_id: userId,
          reason: dispatchResult.error ?? 'dispatch failed',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-fanout/${label}] dispatch threw for ${userId}:`, message);
      result.errors.push({ user_id: userId, error: message });
    }
  }

  return result;
}
