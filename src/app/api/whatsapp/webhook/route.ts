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
import { canUseWhatsApp } from '@/lib/plan-limits';
import { handleWhatsAppInbound } from '@/lib/whatsapp/user-bot';

const NON_PRO_UPGRADE_NUDGE =
  "Hi! 👋 The WhatsApp Pocket Agent is part of Paybacker Pro (£9.99/mo).\n\n" +
  "Upgrade in 30 seconds: https://paybacker.co.uk/pricing?from=whatsapp\n\n" +
  "Prefer free? Our Telegram Pocket Agent works on every plan: " +
  "https://t.me/paybacker_bot";

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

    // Look up the linked Paybacker user. We deliberately DO NOT filter by
    // is_active=true here — a Pro user whose session got flipped to
    // inactive (mutex switch, accidental disconnect, transient cron) was
    // previously treated as a brand-new unlinked number and pitched the
    // upgrade-to-Pro intro. That's the bug Paul hit on 2026-04-28: his
    // session existed and is_active was true at lookup time afterwards,
    // but at the moment of his "Hello" the row was inactive, so the
    // webhook fell through to the unlinked branch.
    //
    // New behaviour: if a session exists for this phone, attribute the
    // message to that user. If the session is inactive but the user
    // didn't explicitly opt out (opted_out_at IS NULL), the message
    // itself is consent to reactivate — flip is_active back on and
    // continue. If they DID opt out (sent STOP), leave it dormant and
    // tell them how to re-enable manually.
    const { data: session } = await sb
      .from('whatsapp_sessions')
      .select('user_id, is_active, opted_out_at')
      .eq('whatsapp_phone', msg.from)
      .maybeSingle();

    let userId = session?.user_id ?? null;

    // Reactivation path: the row exists, the user didn't explicitly STOP,
    // but is_active was flipped off. Treat the inbound as intent to use
    // WhatsApp again. Mutex via set_pocket_agent_channel so any active
    // Telegram session gets stood down before we flip WhatsApp back on.
    if (session && !session.is_active && !session.opted_out_at) {
      const { error: mutexErr } = await sb.rpc('set_pocket_agent_channel', {
        p_user_id: session.user_id,
        p_channel: 'whatsapp',
      });
      if (mutexErr) {
        console.warn('[whatsapp/webhook] reactivate mutex failed', mutexErr);
      }
      const { error: reactErr } = await sb
        .from('whatsapp_sessions')
        .update({ is_active: true, opted_out_at: null })
        .eq('whatsapp_phone', msg.from);
      if (reactErr) {
        console.warn('[whatsapp/webhook] reactivate flip failed', reactErr);
      } else {
        userId = session.user_id;
      }
    }

    // Log inbound (attributed to user when we have one).
    await sb.from('whatsapp_message_log').insert({
      user_id: userId,
      whatsapp_phone: msg.from,
      direction: 'inbound',
      message_type: 'text',
      message_text: msg.text,
      provider: msg.provider,
      provider_message_id: msg.providerMessageId,
    });

    // Honour an explicit prior STOP. If they opted out, only the link-flow
    // on the website should bring them back — auto-reactivating would
    // violate Meta's opt-out policy. Send a single one-line nudge to the
    // dashboard and short-circuit so the unlinked-number / agent paths
    // below don't fire.
    if (session && !session.is_active && session.opted_out_at) {
      await safeReply(
        msg.from,
        `You opted out of WhatsApp Pocket Agent on ${new Date(session.opted_out_at).toLocaleDateString('en-GB')}. To turn it back on, reconnect at https://paybacker.co.uk/dashboard/pocket-agent`,
      );
      processed += 1;
      continue;
    }

    if (!userId) {
      // Unlinked number — try to redeem a link code first.
      // Accepted formats (case-insensitive):
      //   "LINK ABC123"   "link abc123"   "ABC123"
      // We grab the last 6-char alphanumeric run from the message.
      const codeMatch = (msg.text ?? '')
        .toUpperCase()
        .match(/\b([A-Z2-9]{6})\b/);
      if (codeMatch) {
        const code = codeMatch[1];
        const { data: codeRow } = await sb
          .from('whatsapp_link_codes')
          .select('id, user_id, expires_at, used')
          .eq('code', code)
          .eq('used', false)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (codeRow) {
          // Mark code used + create session row. The mutex trigger on
          // whatsapp_sessions enforces no-conflicting-Telegram. If it
          // does fire, /api/whatsapp/link-code's POST already called
          // set_pocket_agent_channel('whatsapp') so this should be safe.
          await sb
            .from('whatsapp_link_codes')
            .update({ used: true })
            .eq('id', codeRow.id);

          const { error: sessErr } = await sb.from('whatsapp_sessions').upsert(
            {
              user_id: codeRow.user_id,
              whatsapp_phone: msg.from,
              is_active: true,
              opted_in_at: new Date().toISOString(),
              opted_out_at: null,
              provider: msg.provider,
              last_message_at: new Date().toISOString(),
            },
            { onConflict: 'whatsapp_phone' },
          );

          if (sessErr) {
            console.error('[whatsapp/webhook] link redeem failed', sessErr);
            await safeReply(
              msg.from,
              `Hmm — couldn't link your account: ${sessErr.message}. Try again from the dashboard, or reply STOP to opt out.`,
            );
          } else {
            // Backfill profiles.phone if it's empty — the user has just
            // verified ownership of this number, so we can safely use it
            // as their primary phone. We DO NOT overwrite an existing
            // phone (they may have given a landline / different mobile
            // for OTP / dispute correspondence).
            const { data: profile } = await sb
              .from('profiles')
              .select('phone')
              .eq('id', codeRow.user_id)
              .maybeSingle();
            if (profile && !profile.phone) {
              await sb
                .from('profiles')
                .update({ phone: msg.from })
                .eq('id', codeRow.user_id);
            }

            await safeReply(
              msg.from,
              `✓ Linked! I'm your Paybacker Pocket Agent.\n\n` +
                `Ask me anything — "show my subs", "write a complaint to EE", "what's due this week", or forward me a bill to look at. Reply STOP any time to opt out.`,
            );
          }
          processed += 1;
          continue;
        }
      }

      // Either no code in the message, or the code was invalid/expired.
      // We can tell which, so the reply is more useful.
      const looksLikeCodeAttempt = /\b[A-Z2-9]{6}\b/i.test(msg.text ?? '');

      const reply = looksLikeCodeAttempt
        ? (
          `That code didn't match — it might have expired (codes are valid for 10 minutes) or already been used.\n\n` +
          `Generate a fresh one here: https://paybacker.co.uk/dashboard/settings/whatsapp`
        )
        : (
          `👋 Hi! I'm the Paybacker Pocket Agent — your personal financial assistant on WhatsApp.\n\n` +
          `I can fight unfair bills, write complaint letters citing UK consumer law, track every subscription, and recover your money — all from this chat.\n\n` +
          `*To get started:*\n\n` +
          `1️⃣  Sign in or sign up at paybacker.co.uk/pocket-agent\n` +
          `2️⃣  Go to Dashboard → Profile → Pocket Agent\n` +
          `3️⃣  Tap *Set up* on the WhatsApp card to generate a 6-character code\n` +
          `4️⃣  Send it back to me here (e.g. "LINK ABC123")\n\n` +
          `WhatsApp Pocket Agent is part of Paybacker Pro (£9.99/mo). Free and Essential users can use the Telegram Pocket Agent instead — same brain, no charge.\n\n` +
          `Already have an account? Quickest path: paybacker.co.uk/dashboard/settings/whatsapp`
        );

      await safeReply(msg.from, reply);
      continue;
    }

    // Tier gate — WhatsApp Pocket Agent is Pro-only. For Free / Essential
    // users we send ONE upgrade nudge inside the 24h session window, then
    // mark `upgrade_nudge_sent_at` so we don't spam them.
    const proAllowed = await canUseWhatsApp(userId);
    if (!proAllowed) {
      const { data: nudgeRow } = await sb
        .from('whatsapp_sessions')
        .select('upgrade_nudge_sent_at')
        .eq('whatsapp_phone', msg.from)
        .maybeSingle();

      if (!nudgeRow?.upgrade_nudge_sent_at) {
        await safeReply(msg.from, NON_PRO_UPGRADE_NUDGE);
        await sb
          .from('whatsapp_sessions')
          .update({
            upgrade_nudge_sent_at: new Date().toISOString(),
            last_message_at: new Date().toISOString(),
          })
          .eq('whatsapp_phone', msg.from);
      } else {
        // Already nudged — silent log only.
        await sb
          .from('whatsapp_sessions')
          .update({ last_message_at: new Date().toISOString() })
          .eq('whatsapp_phone', msg.from);
      }
      processed += 1;
      continue;
    }

    // Update last_message_at on the session
    await sb
      .from('whatsapp_sessions')
      .update({ last_message_at: new Date().toISOString() })
      .eq('whatsapp_phone', msg.from);

    // Handle STOP for compliance — user can opt out at any time per
    // Meta WhatsApp Business policy + UK GDPR.
    if (msg.text && /^\s*stop\s*$/i.test(msg.text)) {
      await sb
        .from('whatsapp_sessions')
        .update({
          is_active: false,
          opted_out_at: new Date().toISOString(),
        })
        .eq('whatsapp_phone', msg.from);
      await safeReply(msg.from,
        `You've been opted out. We won't message you on WhatsApp again. To re-enable, link WhatsApp from your Paybacker dashboard.`,
      );
      processed += 1;
      continue;
    }

    // Hand off to the Pocket Agent. Pro users get the full Claude
    // tool-calling brain — same intelligence as the Telegram bot,
    // same dashboard data. user-bot.ts handles rate limits, history,
    // sending and logging.
    const agentResult = await handleWhatsAppInbound({
      phone: msg.from,
      text: msg.text ?? '',
      userId,
    });
    if (!agentResult.ok) {
      console.warn('[whatsapp/webhook] agent reported issue', agentResult.reason);
    }

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
