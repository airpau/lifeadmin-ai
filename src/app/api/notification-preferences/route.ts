/**
 * GET  — read the current user's notification preferences (merged
 *        with defaults from the event catalog), the user's tier (so
 *        the UI can lock WhatsApp behind Pro), and the active Pocket
 *        Agent channel (telegram | whatsapp | none).
 * PUT  — replace preferences for one or many events, plus optional
 *        quiet hours update.
 *
 * Both routes require a logged-in session (RLS on the table enforces
 * the user can only see/write their own rows — service-role not used).
 *
 * The `whatsapp` channel was added 2026-04-27. It's Pro-only because
 * every Meta template send costs us money. The dispatcher silently
 * skips WhatsApp for non-Pro users even if they've toggled it on, but
 * we also reject the toggle here so the UI stays honest.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { EVENT_CATALOG, type NotificationEventType } from '@/lib/notifications/events';
import { getEffectiveTier } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChannelState = {
  email: boolean;
  telegram: boolean;
  whatsapp: boolean;
  push: boolean;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [prefsRes, profileRes, tgRes, waRes, alertPrefsRes] = await Promise.all([
    supabase
      .from('notification_preferences')
      .select('event_type, email, telegram, whatsapp, push')
      .eq('user_id', user.id),
    supabase
      .from('profiles')
      .select('quiet_hours_start, quiet_hours_end, notification_timezone')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('telegram_sessions')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('whatsapp_sessions')
      .select('is_active, whatsapp_phone')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    // alerts_paused_until lives on telegram_alert_preferences. Bot's
    // pause_alerts_until tool writes it; this page surfaces a banner
    // + "Resume now" button when it's in the future.
    supabase
      .from('telegram_alert_preferences')
      .select('alerts_paused_until')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const tier = await getEffectiveTier(user.id);
  const pocketAgentChannel: 'telegram' | 'whatsapp' | 'none' = waRes.data
    ? 'whatsapp'
    : tgRes.data
      ? 'telegram'
      : 'none';

  const overrides = new Map<string, ChannelState>();
  for (const row of prefsRes.data ?? []) {
    overrides.set(row.event_type, {
      email: row.email,
      telegram: row.telegram,
      whatsapp: (row as { whatsapp?: boolean }).whatsapp ?? false,
      push: row.push,
    });
  }

  const events = EVENT_CATALOG.map((meta) => ({
    event: meta.event,
    label: meta.label,
    description: meta.description,
    group: meta.group,
    allowedChannels: meta.allowedChannels,
    proOnly: !!meta.proOnly,
    critical: !!meta.critical,
    channels: overrides.get(meta.event) ?? {
      email: meta.defaultEmail,
      telegram: meta.defaultTelegram,
      whatsapp: meta.defaultWhatsapp,
      push: meta.defaultPush,
    },
  }));

  return NextResponse.json({
    tier,
    pocketAgentChannel,
    whatsappPhone: waRes.data?.whatsapp_phone ?? null,
    events,
    // Postgres `time` columns serialise as "HH:MM:SS" but the
    // `<input type="time">` UI control and the client-side preset
    // comparison both want "HH:MM". Strip the seconds so the saved
    // value re-loads cleanly into the picker on next visit (and the
    // active preset highlights as expected). Without this trim, the
    // user's quiet-hours selection appeared not to stick.
    quiet_hours_start: trimTimeOfDay(profileRes.data?.quiet_hours_start),
    quiet_hours_end: trimTimeOfDay(profileRes.data?.quiet_hours_end),
    timezone: profileRes.data?.notification_timezone ?? 'Europe/London',
    alerts_paused_until: alertPrefsRes.data?.alerts_paused_until ?? null,
  });
}

function trimTimeOfDay(value: string | null | undefined): string | null {
  if (!value) return null;
  // Accept "HH:MM" or "HH:MM:SS" — collapse to "HH:MM".
  const m = /^(\d{2}:\d{2})(?::\d{2})?$/.exec(value);
  return m ? m[1] : null;
}

/**
 * PATCH — partial updates. Currently used by the Pocket Agent
 * settings page's "Resume now" button (clears alerts_paused_until)
 * and by any future granular settings the bot writes.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as { alerts_paused_until?: string | null };

  if (body.alerts_paused_until !== undefined) {
    const { error } = await supabase
      .from('telegram_alert_preferences')
      .upsert(
        {
          user_id: user.id,
          alerts_paused_until: body.alerts_paused_until,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

interface PutBody {
  events?: Array<{
    event: NotificationEventType;
    email: boolean;
    telegram: boolean;
    whatsapp: boolean;
    push: boolean;
  }>;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as PutBody;

  if (body.events && body.events.length > 0) {
    // Pro-tier gate: a non-Pro user can't enable WhatsApp on any event.
    // We force `whatsapp: false` server-side rather than 403 the request,
    // so the rest of their settings still save cleanly.
    const tier = await getEffectiveTier(user.id);
    const isPro = tier === 'pro';

    const validEvents = new Set(EVENT_CATALOG.map((e) => e.event));
    const rows = body.events
      .filter((e) => validEvents.has(e.event))
      .map((e) => ({
        user_id: user.id,
        event_type: e.event,
        email: !!e.email,
        telegram: !!e.telegram,
        whatsapp: isPro ? !!e.whatsapp : false,
        push: !!e.push,
        updated_at: new Date().toISOString(),
      }));
    if (rows.length > 0) {
      const { error } = await supabase
        .from('notification_preferences')
        .upsert(rows, { onConflict: 'user_id,event_type' });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  if (body.quiet_hours_start !== undefined || body.quiet_hours_end !== undefined) {
    // Defensive normalisation: accept "HH:MM" / "HH:MM:SS" / null /
    // empty string. Coerce empty string to null so Postgres clears the
    // time column rather than rejecting it. Reject anything else so a
    // bad value never silently overwrites the user's saved window.
    const normalise = (v: unknown): string | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === '') return null;
      if (typeof v !== 'string') return undefined;
      const m = /^(\d{2}:\d{2})(?::\d{2})?$/.exec(v);
      return m ? m[1] : undefined;
    };
    const start = normalise(body.quiet_hours_start);
    const end = normalise(body.quiet_hours_end);
    const update: Record<string, unknown> = {};
    if (start !== undefined) update.quiet_hours_start = start;
    if (end !== undefined) update.quiet_hours_end = end;
    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
