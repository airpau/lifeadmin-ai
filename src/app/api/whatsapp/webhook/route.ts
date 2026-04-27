/**
 * WhatsApp inbound webhook.
 *
 * Both Twilio and Meta POST inbound messages here. Provider selection is
 * env-driven (WHATSAPP_PROVIDER), so this endpoint is provider-agnostic.
 *
 * - GET: Meta Cloud API verification handshake (returns the hub.challenge).
 *        Twilio doesn't use this — they only POST.
 * - POST: verify signature, parse, dedupe, log, and pass to the user-bot.
 *
 * NOTE: The user-bot itself (Claude tool calls etc.) is a port of
 * src/lib/telegram/user-bot.ts and lands in a follow-up commit. For now this
 * endpoint just acks + logs so we can prove end-to-end delivery in the
 * sandbox before the bot brain is wired in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  parseWhatsAppWebhook,
  sendWhatsAppText,
  verifyWhatsAppWebhook,
} from '@/lib/whatsapp';
import { verifyMetaWebhookChallenge } from '@/lib/whatsapp/meta-provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Meta Cloud API verification: GET with hub.mode=subscribe & hub.challenge.
export async function GET(req: NextRequest) {
  const challenge = verifyMetaWebhookChallenge(req.nextUrl.searchParams);
  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Header bag for signature verification (provider-agnostic).
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  // Reject anything we cannot verify in production. Allow in dev for local testing.
  const isVerified = verifyWhatsAppWebhook(rawBody, headers);
  if (!isVerified && process.env.NODE_ENV === 'production') {
    return new NextResponse('Invalid signature', { status: 403 });
  }

  let messages;
  try {
    messages = parseWhatsAppWebhook(rawBody);
  } catch (err) {
    console.error('[whatsapp/webhook] parse error', err);
    return new NextResponse('Bad payload', { status: 400 });
  }

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const sb = admin();
  let processed = 0;

  for (const msg of messages) {
    // Idempotency: skip if we've already logged this provider message ID.
    const { data: existing } = await sb
      .from('whatsapp_message_log')
      .select('id')
      .eq('provider_message_id', msg.providerMessageId)
      .maybeSingle();
    if (existing) continue;

    // Look up the linked Paybacker user (may be null if number is unlinked).
    const { data: session } = await sb
      .from('whatsapp_sessions')
      .select('user_id')
      .eq('whatsapp_phone', msg.from)
      .eq('is_active', true)
      .maybeSingle();

    const userId = session?.user_id ?? null;

    // Log inbound
    await sb.from('whatsapp_message_log').insert({
      user_id: userId,
      whatsapp_phone: msg.from,
      direction: 'inbound',
      message_type: 'text',
      message_text: msg.text,
      provider: msg.provider,
      provider_message_id: msg.providerMessageId,
    });

    if (!userId) {
      // Unlinked number: prompt them to link via the website.
      await safeReply(msg.from,
        `Hi! To use Paybacker via WhatsApp, link your account at https://paybacker.co.uk/dashboard/profile (look for "Connect WhatsApp"). Your account stays under your control.`,
      );
      continue;
    }

    // Update last_message_at on the session
    await sb
      .from('whatsapp_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('whatsapp_phone', msg.from);

    // PHASE 1: simple ack. The Claude tool-calling bot lives in src/lib/whatsapp/user-bot.ts
    // and gets wired in once the Telegram port is reviewed.
    await safeReply(msg.from,
      `Got it — we'll surface this in your dashboard. The full WhatsApp Pocket Agent goes live during the launch sprint. Reply STOP at any time to opt out.`,
    );

    processed += 1;
  }

  return NextResponse.json({ ok: true, processed });
}

async function safeReply(to: string, text: string): Promise<void> {
  try {
    const result = await sendWhatsAppText({ to, text });
    const sb = admin();
    await sb.from('whatsapp_message_log').insert({
      whatsapp_phone: to,
      direction: 'outbound',
      message_type: 'text',
      message_text: text,
      provider: result.provider,
      provider_message_id: result.providerMessageId,
    });
  } catch (err) {
    console.error('[whatsapp/webhook] reply failed', err);
  }
}
