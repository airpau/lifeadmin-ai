/**
 * WhatsApp opt-in.
 *
 * POST /api/whatsapp/opt-in
 *   body: { phone: string }      // E.164, e.g. "+447700900123"
 *
 * Records the user's WhatsApp number against their auth.users row, marks
 * opted_in_at = NOW(). Compliant with Meta WhatsApp Business policy and UK
 * GDPR (explicit, demonstrable consent, easy revocation).
 *
 * The user can revoke at any time via DELETE /api/whatsapp/opt-in or by
 * replying "STOP" inside WhatsApp (handled by the inbound webhook).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canUseWhatsApp } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const E164 = /^\+[1-9]\d{6,14}$/;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Tier gate — WhatsApp is a Pro-only channel because every outbound
  // template costs us money on Meta's side. Telegram remains free for all.
  // Confirmed with Paul 2026-04-27.
  const allowed = await canUseWhatsApp(user.id);
  if (!allowed) {
    return NextResponse.json(
      {
        error: 'WhatsApp is part of Paybacker Pro',
        upgrade: 'whatsapp',
        upgradeUrl: '/pricing?from=whatsapp',
        alternative: {
          channel: 'telegram',
          message: 'Use the Telegram Pocket Agent free on any plan: https://t.me/paybacker_bot',
        },
      },
      { status: 403 },
    );
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone = (body.phone ?? '').trim();
  if (!E164.test(phone)) {
    return NextResponse.json(
      { error: 'Invalid phone — use E.164 format like +447700900123' },
      { status: 400 },
    );
  }

  // Upsert: same number can re-opt-in after opting out.
  const { error } = await supabase
    .from('whatsapp_sessions')
    .upsert(
      {
        user_id: user.id,
        whatsapp_phone: phone,
        is_active: true,
        opted_in_at: new Date().toISOString(),
        opted_out_at: null,
        provider: process.env.WHATSAPP_PROVIDER ?? 'twilio',
      },
      { onConflict: 'whatsapp_phone' },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, phone });
}

export async function DELETE(req: NextRequest) {
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
