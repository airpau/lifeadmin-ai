/**
 * WhatsApp User Bot — port of src/lib/telegram/user-bot.ts.
 *
 * Reuses the channel-agnostic tool registry (`telegramTools`) and dispatcher
 * (`executeToolCall`) from the Telegram bot — same intelligence, same UK
 * consumer-rights brain, just over WhatsApp instead of Telegram.
 *
 * What's different vs the Telegram port:
 * 1. I/O layer — uses sendWhatsAppText (Twilio/Meta adapter) instead of
 *    grammy's ctx.reply.
 * 2. Conversation history — reads from `whatsapp_message_log` keyed on
 *    phone number, not telegram_chat_id.
 * 3. Formatting — strips Telegram MarkdownV1's `[text](url)` link syntax
 *    (WhatsApp won't render it). Bold (*foo*) and italic (_foo_) survive
 *    — same on both platforms.
 * 4. Chunking — 1500 chars per message (WhatsApp's hard limit is 4096
 *    but staying conservative until we see real-world delivery rates).
 * 5. Rate limit — 100/hour vs Telegram's 200/hour. Each WhatsApp inbound
 *    can trigger an outbound that costs us money in the 24h session
 *    window (still cheaper than templates, but not free).
 *
 * Inline keyboards / callback queries — Telegram-only. The WhatsApp v1
 * surface is text-in, text-out. v1.1 will add quick-reply buttons via
 * Twilio's Content API for outcome-checks etc.
 *
 * Pending actions (e.g. draft_dispute_letter) — same TERMINAL semantics
 * as Telegram. The tool returns the letter as PendingAction; we send it
 * to the user as a follow-up message and stop the tool loop.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { telegramTools } from '@/lib/telegram/tools';
import {
  executeToolCall,
  type PendingAction,
} from '@/lib/telegram/tool-handlers';
import { sendWhatsAppText } from '@/lib/whatsapp';

// Tunables — calibrated against WhatsApp's actual constraints.
const MAX_ITERATIONS = 5;
const HARD_TIMEOUT_MS = 230_000; // 70s buffer before Vercel's 300s kill
const WHATSAPP_CHAR_LIMIT = 1500;
const RATE_LIMIT_PER_HOUR = 100;
const HISTORY_MESSAGES = 10;

// Deliberately the same brain as the Telegram bot — tool list and rules
// are identical. WhatsApp-specific guidance is layered on top.
// If a tool/rule changes here, mirror it in src/lib/telegram/user-bot.ts.
const SYSTEM_PROMPT = `You are Paybacker's Pocket Agent — a fully connected financial assistant for UK consumers, now talking over WhatsApp. You have access to EVERYTHING the user can see on the Paybacker website. Money Hub, Subscriptions, Contracts, Disputes, Scanner, Rewards, Profile, Tasks, all financial data. Never say you can't access something — if there's a tool for it, use it.

The available tools and their semantics are identical to the dashboard agent. See the tool definitions for what each one does.

WHATSAPP-SPECIFIC RULES:
- Keep replies tight: WhatsApp users are mobile, often one-handed. Short bullets + bold headers, no essays.
- WhatsApp does NOT render [text](url) links. When citing a URL, paste the raw URL on its own line.
- *bold* and _italic_ work; use sparingly.
- No "tap below" — v1 is text-in / text-out. Quick-reply buttons land in v1.1.
- Currency: £X.XX. Dates: DD/MM/YYYY (UK).
- You have conversation history — reference previous messages naturally.

GENERAL RULES (mirror the dashboard agent):
- ALWAYS call the relevant tool before answering — never make up numbers or say "I can't access that".
- draft_dispute_letter is TERMINAL: call once when asked for a complaint letter. Do NOT call search_legal_rights first. Do NOT call anything after it.
- generate_cancellation_email: call once when user wants to cancel a specific provider.
- create_support_ticket: only when the user genuinely needs human support.
- DO IT with a tool — never suggest "go to the dashboard" for something you can do here.
- Always show data the tool returns — never withhold results.
- Be specific about financial impact: "that's £276/year" not "your bill went up".
- For dispute follow-ups: always mention the FCA 8-week deadline.

REPLYING TO A SUPPLIER — same as dashboard agent: if the user asks you to draft / send / reply / chase / follow up with a named supplier, call get_disputes FIRST with status="open" to find the matching dispute (fuzzy-compare provider names), then get_dispute_detail, then draft_dispute_letter with supplier_latest_message verbatim and user_reply_brief in the user's words. Don't embellish.`;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function checkRateLimit(
  supabase: ReturnType<typeof getAdmin>,
  userId: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('whatsapp_message_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('direction', 'inbound')
    .gte('created_at', oneHourAgo);
  return (count ?? 0) < RATE_LIMIT_PER_HOUR;
}

async function getConversationHistory(
  supabase: ReturnType<typeof getAdmin>,
  phone: string,
): Promise<Anthropic.MessageParam[]> {
  const { data } = await supabase
    .from('whatsapp_message_log')
    .select('direction, message_text')
    .eq('whatsapp_phone', phone)
    .order('created_at', { ascending: false })
    .limit(HISTORY_MESSAGES);

  if (!data || data.length === 0) return [];

  const history: Anthropic.MessageParam[] = [];
  for (const msg of data.reverse()) {
    if (!msg.message_text) continue;
    const role = msg.direction === 'inbound' ? 'user' : 'assistant';
    if (history.length > 0 && history[history.length - 1].role === role) {
      const prev = history[history.length - 1];
      history[history.length - 1] = {
        role,
        content:
          typeof prev.content === 'string'
            ? prev.content + '\n' + msg.message_text
            : msg.message_text,
      };
    } else {
      history.push({ role, content: msg.message_text });
    }
  }
  return history;
}

async function callClaudeWithTools(
  userId: string,
  userMessage: string,
  phone: string,
): Promise<{ text: string; pendingAction?: PendingAction }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const supabase = getAdmin();

  const history = await getConversationHistory(supabase, phone);
  const messages: Anthropic.MessageParam[] = [...history];
  if (
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user' &&
    typeof messages[messages.length - 1].content === 'string'
  ) {
    messages[messages.length - 1] = {
      role: 'user',
      content:
        (messages[messages.length - 1].content as string) +
        '\n\n' +
        userMessage,
    };
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  // Prompt-cache the last tool — same trick as the Telegram bot to cut
  // Anthropic costs by ~75% on subsequent turns.
  const cachedTools = telegramTools.map((tool, idx) => {
    if (idx === telegramTools.length - 1) {
      return { ...tool, cache_control: { type: 'ephemeral' as const } };
    }
    return tool;
  });

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: cachedTools,
    messages,
  });

  let iterations = 0;
  const loopStart = Date.now();

  while (
    response.stop_reason === 'tool_use' &&
    iterations < MAX_ITERATIONS
  ) {
    if (Date.now() - loopStart > HARD_TIMEOUT_MS) {
      console.warn(
        `[whatsapp/user-bot] tool loop hit ${HARD_TIMEOUT_MS}ms after ${iterations} iterations`,
      );
      break;
    }
    iterations++;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result: { text: string; pendingAction?: PendingAction };
      try {
        result = await executeToolCall(
          block.name,
          block.input as Record<string, unknown>,
          userId,
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[whatsapp/user-bot] tool error (${block.name}):`, err);
        result = {
          text: `Error executing tool: ${errMsg}. Please try again or rephrase.`,
        };
      }

      // TERMINAL: pending actions (draft letter etc.) bypass the loop —
      // same semantics as user-bot.ts:351 in the Telegram bot.
      if (result.pendingAction) {
        return { text: result.text, pendingAction: result.pendingAction };
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.text,
      });
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResults });

    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: cachedTools,
      messages,
    });
  }

  let finalText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  if (!finalText.trim()) {
    finalText =
      "I'm having trouble retrieving that right now. Could you rephrase or try again?";
  }

  return { text: finalText };
}

/**
 * Strip incompatible Markdown for WhatsApp.
 * - `[text](url)` → `text: url` (WhatsApp doesn't render Markdown links)
 *
 * Bold (*foo*) and italic (_foo_) work on both platforms — leave alone.
 */
function formatForWhatsApp(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2');
}

/**
 * WhatsApp accepts up to 4096 chars but some clients truncate above ~1500.
 * Split on paragraph breaks first, then sentences, then hard-cut.
 */
function chunkForWhatsApp(
  text: string,
  limit = WHATSAPP_CHAR_LIMIT,
): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = '';
  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length <= limit) {
      current = current ? current + '\n\n' + p : p;
    } else {
      if (current) out.push(current);
      if (p.length <= limit) {
        current = p;
      } else {
        // Single paragraph too long — hard split on newlines, then by limit.
        let remaining = p;
        while (remaining.length > limit) {
          const cutAt = remaining.lastIndexOf('\n', limit);
          const cut = cutAt > 0 ? cutAt : limit;
          out.push(remaining.slice(0, cut));
          remaining = remaining.slice(cut).trimStart();
        }
        current = remaining;
      }
    }
  }
  if (current) out.push(current);
  return out;
}

async function sendChunked(phone: string, text: string): Promise<void> {
  const chunks = chunkForWhatsApp(formatForWhatsApp(text));
  const sb = getAdmin();
  for (const chunk of chunks) {
    try {
      const r = await sendWhatsAppText({ to: phone, text: chunk });
      await sb.from('whatsapp_message_log').insert({
        whatsapp_phone: phone,
        direction: 'outbound',
        message_type: 'text',
        message_text: chunk,
        provider: r.provider,
        provider_message_id: r.providerMessageId,
      });
    } catch (err) {
      console.error('[whatsapp/user-bot] send chunk failed', err);
    }
  }
}

/**
 * Main entry point — called from the inbound webhook for Pro users only.
 *
 * Non-Pro users hit the upgrade-nudge branch in the webhook route and
 * never reach this function. Tier check is done upstream.
 */
export async function handleWhatsAppInbound(opts: {
  phone: string;
  text: string;
  userId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const { phone, text, userId } = opts;
  const supabase = getAdmin();

  // Rate-limit defence — protects us from runaway template costs (a
  // misbehaving client could otherwise loop us into Anthropic + Twilio
  // bills) and protects the user from auto-reply storms.
  const within = await checkRateLimit(supabase, userId);
  if (!within) {
    await sendChunked(
      phone,
      `You've hit the ${RATE_LIMIT_PER_HOUR}-message hourly limit on WhatsApp. We'll respond again in an hour. For unlimited use, the dashboard at paybacker.co.uk has no rate limit.`,
    );
    return { ok: false, reason: 'rate_limited' };
  }

  try {
    const result = await callClaudeWithTools(userId, text, phone);
    await sendChunked(phone, result.text);

    // Pending action — same handling as Telegram. The result.text is the
    // intro ("Here's your letter to EE..."); the actual letter body is
    // in result.pendingAction.letter_text. Send it as a follow-up so the
    // user can copy/paste it from WhatsApp.
    if (result.pendingAction?.letter_text) {
      await sendChunked(phone, result.pendingAction.letter_text);
    }

    return { ok: true };
  } catch (err) {
    console.error('[whatsapp/user-bot] handle failed', err);
    await sendChunked(
      phone,
      "I hit an error processing that — please try again in a moment.",
    );
    return { ok: false, reason: 'agent_error' };
  }
}
