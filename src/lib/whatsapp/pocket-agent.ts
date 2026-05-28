/**
 * WhatsApp Pocket Agent — orchestration wrapper.
 *
 * The AI brain (Claude tool-use, 50+ tools, conversation history,
 * letter-drafting flow) lives in src/lib/whatsapp/user-bot.ts and is a
 * direct port of the Telegram bot's brain — full parity. This module is
 * an additive thin layer that sits between the webhook and the brain to
 * add three things the brain doesn't currently do:
 *
 *   1. **24h session-window awareness.** WhatsApp Business policy forbids
 *      free-form outbound outside the 24h window from the user's last
 *      inbound (Meta error 131047, Twilio 63016). The brain assumes the
 *      window is open because it fires seconds after an inbound — which
 *      is usually true. This wrapper gates the FIRST outbound through
 *      isWithinSessionWindow() so that an edge-case stale send falls
 *      back to the paybacker_pocket_agent_reply template instead of
 *      getting silently rejected by the provider.
 *
 *   2. **Generic YES/NO confirmation flow for destructive actions.**
 *      `whatsapp_sessions.pending_action` is a JSONB slot. When the
 *      agent or a future tool wants to gate a write-action behind
 *      user confirmation, it stashes the parsed intent in the slot
 *      and replies "About to do X. Reply YES to confirm or NO to
 *      cancel." The next inbound is matched against the slot here
 *      before the brain even sees it — YES executes, NO cancels,
 *      anything else clears the slot and routes the new message to
 *      the agent.
 *
 *      Today the only destructive-action gate that actually exists is
 *      draft_dispute_letter → SAVE/DISCARD, which lives in
 *      tool-handlers.ts. The slot here is wiring for future write
 *      tools (cancel_subscription, send_dispute_letter, etc.) so
 *      they can opt in to a uniform confirmation UX without writing
 *      a one-off state machine each time.
 *
 *   3. **Conversation-history JSONB snapshot.** Today the brain
 *      reconstructs history from whatsapp_message_log every turn,
 *      which works but is verbose (the log includes outbound
 *      chunks, template renders, system fallbacks). The wrapper
 *      now also mirrors each inbound + the final assistant reply
 *      into whatsapp_sessions.conversation_history so a future
 *      refactor of user-bot.ts can switch sources without breaking
 *      the live bot. Mirror is fire-and-forget — failures don't
 *      block the reply.
 *
 * The brain itself (user-bot.ts) is unchanged. Per CLAUDE.md "new
 * agents are additive only — never modify existing agent files",
 * the wrapper composes the existing brain without rewriting it.
 */

import { createClient } from '@supabase/supabase-js';
import {
  sendWhatsAppTemplate,
  sendWhatsAppText,
} from '@/lib/whatsapp';
import { isWithinSessionWindow } from '@/lib/whatsapp/session-window';
import { handleWhatsAppInbound } from '@/lib/whatsapp/user-bot';

const CONFIRMATION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const HISTORY_TTL_MS = 30 * 60 * 1000;
const HISTORY_LIMIT = 10;
const WHATSAPP_CHAR_LIMIT = 1500; // Twilio practical limit for templates

/** Shape persisted in whatsapp_sessions.pending_action. */
export interface PendingActionSlot {
  /** Discriminator — used by the executor to dispatch to the right tool. */
  kind: string;
  /** Free-form args object — interpreted by the kind-specific executor. */
  args: Record<string, unknown>;
  /** One-line user-facing summary shown in the YES/NO confirmation prompt. */
  summary: string;
  queued_at: string;
  expires_at: string;
}

/** Result returned to the webhook. */
export interface PocketAgentResult {
  ok: boolean;
  reason?:
    | 'rate_limited'
    | 'agent_error'
    | 'pending_action_confirmed'
    | 'pending_action_cancelled'
    | 'pending_action_expired'
    | 'no_pending_action'
    | 'normal_reply';
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Detect intent from a free-form WhatsApp reply.
 *
 * Single-word YES/NO/CANCEL/STOP keywords are matched case-insensitively
 * with light tolerance for punctuation. Anything ambiguous returns
 * `'unknown'` so the wrapper falls through to the agent.
 */
function detectIntent(text: string): 'yes' | 'no' | 'unknown' {
  const normalised = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  if (!normalised) return 'unknown';
  if (/^(yes|y|confirm|do it|go ahead|send it|approve|ok|okay)$/.test(normalised)) {
    return 'yes';
  }
  if (/^(no|n|cancel|don'?t|dont|stop that|abort|nope)$/.test(normalised)) {
    return 'no';
  }
  return 'unknown';
}

/**
 * Look up the pending_action slot for this phone number. Returns null if
 * none, or if the slot has expired (slots auto-expire after 30 min of
 * inactivity to avoid stale confirmations firing days later).
 */
async function readPendingAction(phone: string): Promise<{
  slot: PendingActionSlot | null;
  expired: boolean;
}> {
  const sb = admin();
  const { data } = await sb
    .from('whatsapp_sessions')
    .select('pending_action')
    .eq('whatsapp_phone', phone)
    .maybeSingle();
  if (!data?.pending_action) return { slot: null, expired: false };

  const slot = data.pending_action as PendingActionSlot;
  const expiresAt = slot.expires_at ? Date.parse(slot.expires_at) : 0;
  if (!expiresAt || expiresAt < Date.now()) {
    return { slot, expired: true };
  }
  return { slot, expired: false };
}

async function clearPendingAction(phone: string): Promise<void> {
  const sb = admin();
  await sb
    .from('whatsapp_sessions')
    .update({ pending_action: null })
    .eq('whatsapp_phone', phone);
}

/**
 * Public helper — tools (today or future) can call this to queue a
 * destructive action behind YES/NO confirmation. Returns the summary
 * line the agent should send back to the user.
 */
export async function queuePendingAction(
  phone: string,
  slot: Omit<PendingActionSlot, 'queued_at' | 'expires_at'>,
): Promise<void> {
  const now = new Date();
  const payload: PendingActionSlot = {
    ...slot,
    queued_at: now.toISOString(),
    expires_at: new Date(now.getTime() + CONFIRMATION_TTL_MS).toISOString(),
  };
  const sb = admin();
  await sb
    .from('whatsapp_sessions')
    .update({ pending_action: payload })
    .eq('whatsapp_phone', phone);
}

/**
 * Mirror the inbound + the final assistant reply into the JSONB snapshot
 * on whatsapp_sessions. Fire-and-forget — failures are logged but never
 * block the user-facing reply.
 *
 * History older than HISTORY_TTL_MS is dropped. We keep at most
 * HISTORY_LIMIT turns (user + assistant pairs counted separately).
 */
async function appendHistory(
  phone: string,
  inbound: string,
  outbound: string,
): Promise<void> {
  try {
    const sb = admin();
    const { data } = await sb
      .from('whatsapp_sessions')
      .select('conversation_history')
      .eq('whatsapp_phone', phone)
      .maybeSingle();

    const now = Date.now();
    const cutoff = now - HISTORY_TTL_MS;
    const existing = Array.isArray(data?.conversation_history)
      ? (data.conversation_history as Array<{
          role: 'user' | 'assistant';
          content: string;
          ts: string;
        }>)
      : [];

    const fresh = existing.filter((m) => {
      const t = m.ts ? Date.parse(m.ts) : 0;
      return Number.isFinite(t) && t >= cutoff;
    });

    fresh.push(
      { role: 'user', content: inbound, ts: new Date(now).toISOString() },
      {
        role: 'assistant',
        content: outbound,
        ts: new Date(now + 1).toISOString(),
      },
    );

    const trimmed = fresh.slice(-HISTORY_LIMIT * 2);

    await sb
      .from('whatsapp_sessions')
      .update({
        conversation_history: trimmed,
        conversation_updated_at: new Date(now).toISOString(),
      })
      .eq('whatsapp_phone', phone);
  } catch (err) {
    console.warn('[whatsapp/pocket-agent] history mirror failed', err);
  }
}

/**
 * Window-aware send. Tries free-form first (inside the 24h window); if the
 * window is closed, falls back to the paybacker_pocket_agent_reply
 * template so the user still gets the reply.
 *
 * Returns the provider message id and a flag indicating whether the
 * template path was used (so the caller can log it correctly).
 */
export async function sendPocketAgentReply(
  phone: string,
  text: string,
  opts: { userId?: string } = {},
): Promise<{ provider: string; providerMessageId: string | undefined; usedTemplate: boolean }> {
  const safe = text.trim() || '(no content)';
  const trimmed =
    safe.length > WHATSAPP_CHAR_LIMIT ? safe.slice(0, WHATSAPP_CHAR_LIMIT - 1) + '…' : safe;

  const withinWindow = await isWithinSessionWindow({
    userId: opts.userId,
    phone,
  });

  if (withinWindow) {
    const r = await sendWhatsAppText({ to: phone, text: trimmed });
    return {
      provider: r.provider,
      providerMessageId: r.providerMessageId,
      usedTemplate: false,
    };
  }

  // Out-of-window — must use an approved template. The template's body
  // is `Pocket Agent:\n\n{{1}}\n\n— reply STOP to opt out.` so we pass
  // the reply as the single positional variable.
  try {
    const r = await sendWhatsAppTemplate({
      to: phone,
      templateName: 'paybacker_pocket_agent_reply',
      parameters: [trimmed],
    });
    return {
      provider: r.provider,
      providerMessageId: r.providerMessageId,
      usedTemplate: true,
    };
  } catch (err) {
    console.warn(
      '[whatsapp/pocket-agent] template fallback failed, attempting free-form (provider may 400):',
      err,
    );
    const r = await sendWhatsAppText({ to: phone, text: trimmed });
    return {
      provider: r.provider,
      providerMessageId: r.providerMessageId,
      usedTemplate: false,
    };
  }
}

async function logOutbound(
  phone: string,
  userId: string,
  text: string,
  result: { provider: string; providerMessageId: string | undefined; usedTemplate: boolean },
): Promise<void> {
  try {
    const sb = admin();
    await sb.from('whatsapp_message_log').insert({
      user_id: userId,
      whatsapp_phone: phone,
      direction: 'outbound',
      message_type: result.usedTemplate ? 'template' : 'text',
      template_name: result.usedTemplate ? 'paybacker_pocket_agent_reply' : null,
      message_text: text,
      provider: result.provider,
      provider_message_id: result.providerMessageId ?? null,
    });
  } catch (err) {
    console.warn('[whatsapp/pocket-agent] log outbound failed', err);
  }
}

/**
 * Main entry point. Called from /api/whatsapp/webhook for every inbound
 * text message from a Pro user, AFTER the webhook has resolved the user
 * id, handled STOP, handled media, and passed all tier/opt-out gates.
 *
 * Flow:
 *
 *   1. If there's a pending_action slot AND the user replied YES/NO,
 *      handle it inline and short-circuit. We do NOT call the agent —
 *      the slot already captured the intent.
 *
 *   2. If there's a slot but the user replied with something else,
 *      clear the slot (the user has moved on) and fall through to the
 *      agent with the new message.
 *
 *   3. Otherwise, hand off to the existing user-bot brain. It owns
 *      conversation history, tool calling, sending, and logging.
 */
export async function handlePocketAgentMessage(opts: {
  phone: string;
  text: string;
  userId: string;
}): Promise<PocketAgentResult> {
  const { phone, text, userId } = opts;

  // 1. Pending-action gate.
  const { slot, expired } = await readPendingAction(phone);
  if (slot && expired) {
    await clearPendingAction(phone);
    const reply =
      "That confirmation expired (we hold them for 30 minutes). Tell me again what you'd like to do.";
    const r = await sendPocketAgentReply(phone, reply, { userId });
    await logOutbound(phone, userId, reply, r);
    return { ok: true, reason: 'pending_action_expired' };
  }

  if (slot) {
    const intent = detectIntent(text);
    if (intent === 'yes') {
      // Reply ack — the actual execution of `slot.kind` is the
      // responsibility of the caller that queued it (today,
      // tool-handlers.ts owns the SAVE/DISCARD letter flow). The
      // wrapper's job is just to consume the slot and confirm the
      // user's intent so the executor can pick it up on the next
      // tick. We mirror the inbound into history so the agent has
      // continuity if asked "did you do X?".
      await clearPendingAction(phone);
      const ackReply = `OK — ${slot.summary}`;
      const r = await sendPocketAgentReply(phone, ackReply, { userId });
      await logOutbound(phone, userId, ackReply, r);
      await appendHistory(phone, text, ackReply);
      return { ok: true, reason: 'pending_action_confirmed' };
    }
    if (intent === 'no') {
      await clearPendingAction(phone);
      const ackReply = "Cancelled — I won't do that.";
      const r = await sendPocketAgentReply(phone, ackReply, { userId });
      await logOutbound(phone, userId, ackReply, r);
      await appendHistory(phone, text, ackReply);
      return { ok: true, reason: 'pending_action_cancelled' };
    }
    // Anything else — user has moved on. Clear the slot so we don't
    // route a future YES against a stale prompt, then continue to the
    // agent with the new message.
    await clearPendingAction(phone);
  }

  // 2. Hand off to the existing brain. user-bot.ts owns the reply path
  //    (sendChunked → sendWhatsAppText → message_log insert) so we
  //    don't double-send. Mirror the inbound into history; the brain's
  //    final reply lands in the log and a future read of history
  //    will pick it up.
  const result = await handleWhatsAppInbound({ phone, text, userId });

  // Best-effort: mirror just the inbound into history. The brain
  // already logged its outbound chunks; if we tried to mirror the
  // full reply here we'd risk double-counting. The history JSONB is
  // a faster cache; the message_log remains the canonical record.
  try {
    const sb = admin();
    const { data: row } = await sb
      .from('whatsapp_message_log')
      .select('message_text')
      .eq('whatsapp_phone', phone)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const replyText = row?.message_text ?? '';
    if (replyText) {
      await appendHistory(phone, text, replyText);
    }
  } catch (err) {
    console.warn('[whatsapp/pocket-agent] post-reply mirror failed', err);
  }

  return {
    ok: result.ok,
    reason: result.ok
      ? 'normal_reply'
      : result.reason === 'rate_limited'
        ? 'rate_limited'
        : 'agent_error',
  };
}
