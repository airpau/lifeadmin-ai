/**
 * WhatsApp link-code endpoints.
 *
 * Mirror of /api/telegram/link-code, but for WhatsApp. The flow:
 *
 *   1. User clicks "Connect WhatsApp" in /dashboard/settings/whatsapp.
 *   2. Front-end POSTs here → we generate a 6-char code, save to
 *      `whatsapp_link_codes` with expires_at = NOW() + 10 min.
 *   3. UI shows the code + a wa.me deep link prefilled with the code.
 *   4. User WhatsApps the code to +447883318406.
 *   5. The webhook (`/api/whatsapp/webhook`) sees an inbound from an
 *      unlinked number containing the code, looks up the
 *      `whatsapp_link_codes` row, creates a `whatsapp_sessions` row for
 *      (user_id, phone), and replies "✓ Linked!".
 *
 * This pattern is nicer than asking for the phone number in a form
 * because:
 *   - We learn the phone from the inbound `From:` header (no typos).
 *   - We verify the user owns that number (they had to send FROM it).
 *   - It's a single step from the user's POV.
 *
 * GET    — read current link state (linked? pending code? expiry?)
 * POST   — generate a fresh link code (Pro-gated; deactivates Telegram via mutex)
 * DELETE — unlink (deactivates the WhatsApp session)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canUseWhatsApp } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODE_LENGTH = 6;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 min

function generateCode(): string {
  // Avoid 0/O/1/I to make read-aloud-able and unambiguous in WhatsApp.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [sessionRes, codeRes, tierFlagRes] = await Promise.all([
    supabase
      .from('whatsapp_sessions')
      .select('whatsapp_phone, linked_at, last_message_at, is_active, opted_in_at')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('whatsapp_link_codes')
      .select('code, expires_at')
      .eq('user_id', user.id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    canUseWhatsApp(user.id),
  ]);

  return NextResponse.json({
    canUse: tierFlagRes,
    linked: !!sessionRes.data,
    session: sessionRes.data ?? null,
    pendingCode: codeRes.data ?? null,
    senderPhone: process.env.TWILIO_WHATSAPP_FROM?.replace('whatsapp:', '') ?? '+447883318406',
  });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Pro-tier gate.
  const allowed = await canUseWhatsApp(user.id);
  if (!allowed) {
    return NextResponse.json(
      {
        error: 'WhatsApp is part of Paybacker Pro',
        upgradeUrl: '/pricing?from=whatsapp',
      },
      { status: 403 },
    );
  }

  // Mutex: switch the user's Pocket Agent channel to whatsapp BEFORE we
  // create the code. This deactivates any active Telegram session so
  // the trigger on whatsapp_sessions won't bite when the webhook later
  // inserts the row. The flip itself doesn't create a whatsapp session
  // yet — that happens on first valid inbound.
  await supabase.rpc('set_pocket_agent_channel', {
    p_user_id: user.id,
    p_channel: 'whatsapp',
  });

  // Invalidate any prior unused codes for this user — only one live at a time.
  await supabase
    .from('whatsapp_link_codes')
    .update({ used: true })
    .eq('user_id', user.id)
    .eq('used', false);

  // Generate a fresh code.
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS).toISOString();

  const { error } = await supabase
    .from('whatsapp_link_codes')
    .insert({
      user_id: user.id,
      code,
      expires_at: expiresAt,
      used: false,
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const senderPhone =
    process.env.TWILIO_WHATSAPP_FROM?.replace('whatsapp:', '') ?? '+447883318406';
  const senderForUrl = senderPhone.replace(/^\+/, ''); // wa.me wants no plus

  return NextResponse.json({
    code,
    expiresAt,
    senderPhone,
    /**
     * Deep link the user can tap on mobile to open WhatsApp with the
     * message pre-filled. wa.me/<phone>?text=<encoded text>
     */
    deepLink: `https://wa.me/${senderForUrl}?text=${encodeURIComponent(`LINK ${code}`)}`,
    /**
     * Friendly instructions the UI should display alongside the code.
     */
    instructions: [
      `1. Open WhatsApp on your phone.`,
      `2. Tap the link below (or message ${senderPhone}).`,
      `3. Send: LINK ${code}`,
      `4. We'll confirm here once it arrives — usually within 5 seconds.`,
    ],
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({ is_active: false, opted_out_at: new Date().toISOString() })
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
