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

export type Channel = 'email' | 'telegram' | 'whatsapp' | 'push';

export interface EmailPayload {
  subject: string;
  html: string;
  to?: string; // overrides profile.email
}

export interface TelegramPayload {
  text: string; // Markdown-friendly — the bot already handles escaping
}

export interface WhatsAppPayload {
  /**
   * Free-form session text — only valid inside the 24h customer-service
   * window (i.e. the user has messaged us in the last 24h). Cheaper than
   * a template, no Meta fee.
   */
  text?: string;
  /**
   * Approved template name (matches `friendly_name` in Twilio Content
   * + `template_name` in `whatsapp_message_templates`). The provider
   * resolves this to a Twilio Content SID at send time.
   * Used outside the 24h window for proactive alerts. See
   * src/lib/whatsapp/template-registry.ts.
   */
  templateName?: string;
  /** Positional parameters that fill {{1}}, {{2}}, ... in the template. */
  templateParameters?: string[];
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
  whatsapp?: WhatsAppPayload;
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
  whatsappPhone: string | null;
  prefs: Record<
    string,
    { email: boolean; telegram: boolean; whatsapp: boolean; push: boolean }
  >;
}

async function loadUserRouting(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserRouting | null> {
  const [profileRes, telegramRes, whatsappRes, prefsRes] = await Promise.all([
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
      .from('whatsapp_sessions')
      .select('whatsapp_phone, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('notification_preferences')
      .select('event_type, email, telegram, whatsapp, push')
      .eq('user_id', userId),
  ]);

  if (!profileRes.data) return null;

  const prefs: UserRouting['prefs'] = {};
  for (const row of prefsRes.data ?? []) {
    prefs[row.event_type] = {
      email: row.email,
      telegram: row.telegram,
      // Defensive: the column was added 2026-04-27. Older rows may not
      // have it populated yet — `whatsapp` defaults to false in the DB.
      whatsapp: (row as { whatsapp?: boolean }).whatsapp ?? false,
      push: row.push,
    };
  }

  return {
    email: profileRes.data.email ?? null,
    tier: profileRes.data.subscription_tier ?? null,
    quietStart: profileRes.data.quiet_hours_start ?? null,
    quietEnd: profileRes.data.quiet_hours_end ?? null,
    timezone: profileRes.data.notification_timezone || 'Europe/London',
    telegramChatId: telegramRes.data?.telegram_chat_id ?? null,
    whatsappPhone: whatsappRes.data?.whatsapp_phone ?? null,
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
    ? {
        email: meta.defaultEmail,
        telegram: meta.defaultTelegram,
        whatsapp: meta.defaultWhatsapp,
        push: meta.defaultPush,
      }
    : { email: true, telegram: true, whatsapp: false, push: true };
  const override = routing.prefs[event];
  const wants = override ?? defaults;

  // Pro-only events (morning/evening/payday summaries) skip Free/Essential
  // users entirely — even if they've enabled the channels.
  if (meta?.proOnly && routing.tier !== 'pro') return [];

  // Pocket-agent mutex: a user can have telegram OR whatsapp but never
  // both active. The DB-level trigger enforces this, but resolving here
  // means even if both somehow exist (during a switch race) we only
  // route to one. WhatsApp wins because it's the explicit Pro choice.
  const pocketAgent: 'telegram' | 'whatsapp' | null = routing.whatsappPhone
    ? 'whatsapp'
    : routing.telegramChatId
      ? 'telegram'
      : null;

  const out: Channel[] = [];
  if (wants.email && hasPayload.email && routing.email) out.push('email');
  if (
    wants.telegram &&
    hasPayload.telegram &&
    routing.telegramChatId &&
    pocketAgent === 'telegram'
  ) {
    out.push('telegram');
  }
  if (
    wants.whatsapp &&
    hasPayload.whatsapp &&
    routing.whatsappPhone &&
    pocketAgent === 'whatsapp'
  ) {
    out.push('whatsapp');
  }
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

/**
 * Send a WhatsApp message via the active provider (Twilio or Meta direct).
 *
 * Two modes:
 *   - text-only (free, inside the 24h customer-service window)
 *   - template (Meta-approved, costs us per send, works any time)
 *
 * For proactive alerts initiated by us (no recent inbound), the caller
 * MUST supply a `templateSid`. If only `text` is given and we're outside
 * the 24h window, Meta will reject the message — Twilio surfaces this
 * as a 63016 / 63018 error. The caller logs it; we don't crash.
 */
async function sendWhatsApp(
  phone: string,
  payload: WhatsAppPayload,
): Promise<boolean> {
  try {
    if (payload.templateName) {
      const { sendWhatsAppTemplate } = await import('@/lib/whatsapp');
      await sendWhatsAppTemplate({
        to: phone,
        templateName: payload.templateName,
        parameters: payload.templateParameters ?? [],
      });
      return true;
    }
    if (payload.text) {
      const { sendWhatsAppText } = await import('@/lib/whatsapp');
      await sendWhatsAppText({ to: phone, text: payload.text });
      return true;
    }
    return false;
  } catch (err) {
    console.error('[notifications] whatsapp send failed:', err);
    return false;
  }
}

async function sendTelegram(chatId: number, payload: TelegramPayload): Promise<boolean> {
  // Route via the user-facing Pocket Agent bot (TELEGRAM_USER_BOT_TOKEN)
  // when available, same precedence as sendProactiveAlert in
  // `src/lib/telegram/user-bot.ts`. Falling back to the admin bot
  // (TELEGRAM_BOT_TOKEN) was landing user-facing alerts — price
  // increases, renewal reminders, dispute replies — in the founder\'s
  // "Paybacker Assistant" admin chat instead of the customer\'s
  // "Paybacker" chat.
  const token = process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
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
 * Delegates to src/lib/push/dispatch-push.ts which fans the payload
 * out to every registered device (APNs for ios rows, FCM for android
 * rows), cleans up bad tokens, and logs the outcome to
 * notification_log. Lazy-imported so non-push code paths don't drag
 * apns2 + firebase-admin into the bundle.
 *
 * Required env vars (set in Vercel — task #41):
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8, APNS_BUNDLE_ID, APNS_HOST
 *   FCM_SERVICE_ACCOUNT_JSON
 *
 * Returns true if at least one device was reached. False keeps email
 * + telegram fallbacks active so users aren't silenced when push
 * fails (no devices, all tokens dead, FCM/APNs outage, etc.).
 */
async function sendPush(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<boolean> {
  try {
    const { dispatchPushToUser } = await import('@/lib/push/dispatch-push');
    return await dispatchPushToUser(supabase, userId, payload);
  } catch (err) {
    console.error('[notifications] push dispatch failed:', err);
    return false;
  }
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
    whatsapp: !!input.whatsapp,
    push: !!input.push,
  };

  const channels = resolveChannels(routing, input.event, hasPayload);

  const quiet = !input.bypassQuietHours && inQuietHours(routing);
  const delivered: Channel[] = [];
  const skipped: Array<{ channel: Channel; reason: string }> = [];

  // Quiet-hours rule: push, telegram and whatsapp are suppressed (they
  // buzz the user's phone). Email still sends — it lives in an inbox
  // and is the polite quiet-hours fallback.
  for (const channel of channels) {
    if (
      quiet &&
      (channel === 'push' || channel === 'telegram' || channel === 'whatsapp')
    ) {
      skipped.push({ channel, reason: 'quiet hours' });
      continue;
    }

    if (channel === 'email' && input.email && routing.email) {
      if (await sendEmail(routing.email, input.email)) delivered.push('email');
      else skipped.push({ channel: 'email', reason: 'send failed' });
    } else if (channel === 'telegram' && input.telegram && routing.telegramChatId) {
      if (await sendTelegram(routing.telegramChatId, input.telegram)) delivered.push('telegram');
      else skipped.push({ channel: 'telegram', reason: 'send failed' });
    } else if (channel === 'whatsapp' && input.whatsapp && routing.whatsappPhone) {
      if (await sendWhatsApp(routing.whatsappPhone, input.whatsapp)) delivered.push('whatsapp');
      else skipped.push({ channel: 'whatsapp', reason: 'send failed' });
    } else if (channel === 'push' && input.push) {
      if (await sendPush(supabase, input.userId, input.push)) delivered.push('push');
      else skipped.push({ channel: 'push', reason: 'no transport yet' });
    }
  }

  return { delivered, skipped };
}
