/**
 * POST /api/admin/test-whatsapp
 *
 * Admin-only. Fires a one-shot WhatsApp message to a user's linked
 * Pocket Agent number via the same adapter the cron + webhook use,
 * so we can verify provider routing (Twilio/Meta) end-to-end without
 * waiting for a scheduled alert.
 *
 * Mirrors /api/admin/test-notification (Telegram) — same auth, same
 * lookup shape (userId or email), same masked-recipient response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron, ADMIN_EMAIL } from '@/lib/admin-auth';
import { sendWhatsAppText } from '@/lib/whatsapp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function maskPhone(phone: string): string {
  if (phone.length <= 7) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const body = (await request.json().catch(() => ({}))) as { userId?: string; email?: string };
  const admin = getAdmin();

  let userId = body.userId ?? null;
  let userEmail: string | null = null;

  if (userId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: `User ${userId} not found` }, { status: 404 });
    userEmail = profile.email;
  } else {
    const targetEmail = (body.email ?? ADMIN_EMAIL).toLowerCase();
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email')
      .eq('email', targetEmail)
      .maybeSingle();
    if (!profile) return NextResponse.json({ error: `User ${targetEmail} not found` }, { status: 404 });
    userId = profile.id;
    userEmail = profile.email;
  }

  const { data: session } = await admin
    .from('whatsapp_sessions')
    .select('whatsapp_phone, is_active, provider')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (!session?.whatsapp_phone) {
    return NextResponse.json(
      { error: 'No active WhatsApp session for this user', userId, email: userEmail },
      { status: 404 },
    );
  }

  const text =
    "👋 Test from Paybacker Pocket Agent — your WhatsApp alerts are live! Reply with anything to start a conversation.";

  try {
    const result = await sendWhatsAppText({ to: session.whatsapp_phone, text });
    return NextResponse.json({
      success: true,
      to: maskPhone(session.whatsapp_phone),
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      acceptedAt: result.acceptedAt,
      userId,
      email: userEmail,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        to: maskPhone(session.whatsapp_phone),
        provider: session.provider,
      },
      { status: 502 },
    );
  }
}
