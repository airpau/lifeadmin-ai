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

  const [prefsRes, profileRes, tgRes, waRes] = await Promise.all([
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
    quiet_hours_start: profileRes.data?.quiet_hours_start ?? null,
    quiet_hours_end: profileRes.data?.quiet_hours_end ?? null,
    timezone: profileRes.data?.notification_timezone ?? 'Europe/London',
  });
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
    const update: Record<string, unknown> = {};
    if (body.quiet_hours_start !== undefined) update.quiet_hours_start = body.quiet_hours_start;
    if (body.quiet_hours_end !== undefined) update.quiet_hours_end = body.quiet_hours_end;
    const { error } = await supabase.from('profiles').update(update).eq('id', user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
