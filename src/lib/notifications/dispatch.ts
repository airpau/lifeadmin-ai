/**
 * Unified notification dispatcher.
 *
 * One call — sendNotification() — decides whether the user wants this
 * event on email, telegram, push or a mix, respects quiet hours, and
 * fans out to the right transports.
 *
 * Legacy notification code paths still exist (each cron hits Resend /
 * Telegram directly). They will be migrated to this dispatcher as they
 * are touched. Behaviour is backwards-compatible: if a user has no
 * row in `notification_preferences` for an event, the defaults from
 * events.ts apply — which match the previous hard-coded behaviour.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENT_CATALOG, type NotificationEventType } from './events';

export type Channel = 'email' | 'telegram' | 'push';

export interface EmailPayload {
  subject: string;
  html: string;
  to?: string; // overrides profile.email
}

export interface TelegramPayload {
  text: string; // Markdown-friendly — the bot already handles escaping
}

export interface PushPayload {
  title: string;
  body: string;
  deepLink?: string; // e.g. /dashboard/complaints#entry-<id>
  data?: Record<string, string>;
}

export interface DispatchInput {
  userId: string;
  event: NotificationEventType;
  email?: EmailPayload;
  telegram?: TelegramPayload;
  push?: PushPayload;
  /** Non-transactional events respect email rate limits; default true */
  rateLimited?: boolean;
  /** Bypass quiet hours (only use for genuine urgencies) */
  bypassQuietHours?: boolean;
}

export interface DispatchResult {
  delivered: Channel[];
  skipped: Array<{ channel: Channel; reason: string }>;
}

interface UserRouting {
  email: string | null;
  tier: string | null;
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
  telegramChatId: number | null;
  prefs: Record<string, { email: boolean; telegram: boolean; push: boolean }>;
}

async function loadUserRouting(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRouting | null> {
  const [profileRes, telegramRes, prefsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, subscription_tier, quiet_hours_start, quiet_hours_end, notification_timezone')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('telegram_sessions')
      .select('telegram_chat_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('notification_preferences')
      .select('event_type, email, telegram, push')
      .eq('user_id', userId),
  ]);

  if (!profileRes.data) return null;

  const prefs: UserRouting['prefs'] = {};
  for (const row of prefsRes.data ?? []) {
    prefs[row.event_type] = { email: row.email, telegram: row.telegram, push: row.push };
  }

  return {
    email: profileRes.data.email ?? null,
    tier: profileRes.data.subscription_tier ?? null,
    quietStart: profileRes.data.quiet_hours_start ?? null,
    quietEnd: profileRes.data.quiet_hours_end ?? null,
    timezone: profileRes.data.notification_timezone || 'Europe/London',
    telegramChatId: telegramRes.data?.telegram_chat_id ?? null,
    prefs,
  };
}

/**
 * Returns true if the CURRENT time in the user's timezone falls
 * inside their quiet-hours window. Handles windows that cross
 * midnight (e.g. 22:00–07:00).
 */
function inQuietHours(routing: UserRouting): boolean {
  const { quietStart, quietEnd, timezone } = routing;
  if (!quietStart || !quietEnd) return false;
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const hh = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const mm = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    const nowMin = hh * 60 + mm;

    const [qsH, qsM] = quietStart.split(':').map((x) => parseInt(x, 10));
    const [qeH, qeM] = quietEnd.split(':').map((x) => parseInt(x, 10));
    const startMin = qsH * 60 + qsM;
    const endMin = qeH * 60 + qeM;

    if (startMin <= endMin) {
      return nowMin >= startMin && nowMin < endMin;
    }
    // Window crosses midnight
    return nowMin >= startMin || nowMin < endMin;
  } catch {
    return false;
  }
}

/**
 * Decide which channels a notification should fan out to for this user.
 * Combines the event's default, any explicit pref row, and what the
 * caller actually provided payloads for.
 */
function resolveChannels(
  routing: UserRouting,
  event: NotificationEventType,
  hasPayload: Record<Channel, boolean>,
): Channel[] {
  const meta = EVENT_CATALOG.find((e) => e.event === event);
  const defaults = meta
    ? { email: meta.defaultEmail, telegram: meta.defaultTelegram, push: meta.defaultPush }
    : { email: true, telegram: true, push: true };
  const override = routing.prefs[event];
  const wants = override ?? defaults;

  const out: Channel[] = [];
  if (wants.email && hasPayload.email && routing.email) out.push('email');
  if (wants.telegram && hasPayload.telegram && routing.telegramChatId) out.push('telegram');
  if (wants.push && hasPayload.push) out.push('push');
  return out;
}

async function sendEmail(email: string, payload: EmailPayload): Promise<boolean> {
  try {
    const { resend, FROM_EMAIL } = await import('@/lib/resend');
    await resend.emails.send({
      from: FROM_EMAIL,
      to: payload.to ?? email,
      subject: payload.subject,
      html: payload.html,
    });
    return true;
  } catch (err) {
    console.error('[notifications] email send failed:', err);
    return false;
  }
}

async function sendTelegram(chatId: number, payload: TelegramPayload): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: payload.text, parse_mode: 'Markdown' }),
    });
    return res.ok;
  } catch (err) {
    console.error('[notifications] telegram send failed:', err);
    return false;
  }
}

/**
 * Push transport.
 *
 * Reads the user's registered devices from `push_tokens` (populated
 * by /api/push/register when the mobile shell boots). If no tokens
 * exist yet — the user hasn't installed the app or denied permission
 * — we log "push_pending" and exit silently.
 *
 * Real APNs / FCM delivery is stubbed pending two env vars:
 *   APNS_KEY_ID + APNS_TEAM_ID + APNS_KEY_P8  (iOS)
 *   FCM_SERVICE_ACCOUNT_JSON                  (Android)
 * When those land, the marked TODO below becomes an apns2 +
 * firebase-admin call. Returning false keeps the event routed
 * through email/telegram fallbacks so users aren\'t silenced.
 */
async function sendPush(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<boolean> {
  try {
    const { data: tokens } = await supabase
      .from('push_tokens')
      .select('platform, token')
      .eq('user_id', userId);
    if (!tokens || tokens.length === 0) {
      await supabase.from('notification_log').insert({
        user_id: userId,
        notification_type: 'push_no_device',
        reference_key: `${payload.title}|${Date.now()}`,
      });
      return false;
    }
    // TODO: wire APNs (iOS) + FCM (Android) senders here. For each
    // token row, dispatch based on row.platform. Today we log
    // intent — users with the app installed will start receiving
    // pushes once the credentials env vars are set.
    await supabase.from('notification_log').insert({
      user_id: userId,
      notification_type: 'push_pending_transport',
      reference_key: `${payload.title}|${tokens.length}|${Date.now()}`,
    });
  } catch {
    // notification_log may not have this shape — log and move on
  }
  return false;
}

export async function sendNotification(
  supabase: SupabaseClient,
  input: DispatchInput,
): Promise<DispatchResult> {
  const routing = await loadUserRouting(supabase, input.userId);
  if (!routing) {
    return { delivered: [], skipped: [{ channel: 'email', reason: 'user not found' }] };
  }

  const hasPayload: Record<Channel, boolean> = {
    email: !!input.email,
    telegram: !!input.telegram,
    push: !!input.push,
  };

  const channels = resolveChannels(routing, input.event, hasPayload);

  const quiet = !input.bypassQuietHours && inQuietHours(routing);
  const delivered: Channel[] = [];
  const skipped: Array<{ channel: Channel; reason: string }> = [];

  // Quiet-hours rule: push + telegram are suppressed; email still sends
  // (it goes to an inbox, not a buzz, so it's the polite fallback).
  for (const channel of channels) {
    if (quiet && (channel === 'push' || channel === 'telegram')) {
      skipped.push({ channel, reason: 'quiet hours' });
      continue;
    }

    if (channel === 'email' && input.email && routing.email) {
      if (await sendEmail(routing.email, input.email)) delivered.push('email');
      else skipped.push({ channel: 'email', reason: 'send failed' });
    } else if (channel === 'telegram' && input.telegram && routing.telegramChatId) {
      if (await sendTelegram(routing.telegramChatId, input.telegram)) delivered.push('telegram');
      else skipped.push({ channel: 'telegram', reason: 'send failed' });
    } else if (channel === 'push' && input.push) {
      if (await sendPush(supabase, input.userId, input.push)) delivered.push('push');
      else skipped.push({ channel: 'push', reason: 'no transport yet' });
    }
  }

  return { delivered, skipped };
}
