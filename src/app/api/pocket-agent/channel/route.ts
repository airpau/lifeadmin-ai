/**
 * Pocket Agent channel switcher.
 *
 * GET — return the user's currently-active Pocket Agent channel
 *       ('telegram' | 'whatsapp' | 'none'), tier, and helpers for
 *       linking the chosen channel.
 *
 * PUT — switch channel. Body: { channel: 'telegram' | 'whatsapp' | 'none' }.
 *       Hands off to the `set_pocket_agent_channel` Postgres function
 *       which atomically deactivates the OTHER channel's session row.
 *       Activating the chosen channel still requires the user to
 *       complete the link flow (open the Telegram bot / opt-in WhatsApp).
 *
 * Why this exists alongside /api/whatsapp/opt-in: that endpoint is
 *   the WhatsApp-specific opt-in flow. This one is the universal
 *   "I want to switch channels" toggle wired to the settings UI.
 *
 * Pro-tier gate: WhatsApp is Pro only. Switching to whatsapp on a
 *   Free/Essential account returns 403.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getEffectiveTier } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Channel = 'telegram' | 'whatsapp' | 'none';

const VALID_CHANNELS: Channel[] = ['telegram', 'whatsapp', 'none'];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tier = await getEffectiveTier(user.id);

  // Single Postgres call resolves the active channel via the helper
  // function added in 20260427120000_whatsapp_channel_and_mutex.sql.
  const { data, error } = await supabase.rpc('get_pocket_agent_channel', {
    p_user_id: user.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    channel: (data as Channel) ?? 'none',
    tier,
    canUseWhatsapp: tier === 'pro',
  });
}

export async function PUT(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { channel?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const channel = (body.channel ?? '') as Channel;
  if (!VALID_CHANNELS.includes(channel)) {
    return NextResponse.json(
      { error: `Invalid channel. Must be one of ${VALID_CHANNELS.join(', ')}` },
      { status: 400 },
    );
  }

  // Pro gate
  if (channel === 'whatsapp') {
    const tier = await getEffectiveTier(user.id);
    if (tier !== 'pro') {
      return NextResponse.json(
        {
          error: 'WhatsApp Pocket Agent is part of Paybacker Pro',
          upgradeUrl: '/pricing?from=whatsapp',
        },
        { status: 403 },
      );
    }
  }

  const { error } = await supabase.rpc('set_pocket_agent_channel', {
    p_user_id: user.id,
    p_channel: channel,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    channel,
    next:
      channel === 'telegram'
        ? '/dashboard/settings/telegram'
        : channel === 'whatsapp'
          ? '/dashboard/profile?connect=whatsapp'
          : null,
  });
}
