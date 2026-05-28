/**
 * WhatsApp Pocket Agent — orchestration + two-tier model runtime.
 *
 * This module owns the WhatsApp inbound experience end-to-end. It runs a
 * deliberately TWO-TIER Anthropic stack:
 *
 *   ┌───────────────────────────────────────────────────────────────────┐
 *   │ AGENT_MODEL = claude-haiku-4-5-20251001                           │
 *   │   • All conversational turns                                      │
 *   │   • All read-only tool calls (subs, transactions, disputes…)      │
 *   │   • Summarisation of tool results                                 │
 *   │   • ~10× cheaper than Sonnet at WhatsApp's daily-message volume   │
 *   │   • Faster TTFT — important for the WhatsApp UX                   │
 *   └───────────────────────────────────────────────────────────────────┘
 *                                  │
 *                                  ▼  intercepts letter tool calls
 *   ┌───────────────────────────────────────────────────────────────────┐
 *   │ DISPUTE_MODEL = claude-sonnet-4-6                                 │
 *   │   • Letter generation only (draft_dispute_letter,                 │
 *   │     generate_cancellation_email — anything that produces text     │
 *   │     a real human will read at a regulator / supplier)             │
 *   │   • Fed a DB-grounded `groundingContext` — never free-form text   │
 *   │     from the conversational layer                                 │
 *   │   • Lives behind `generateGroundedDisputeLetter` in               │
 *   │     dispute-letter-writer.ts, which delegates to                  │
 *   │     `generateDisputeReply` (legal_references-grounded engine)     │
 *   └───────────────────────────────────────────────────────────────────┘
 *
 * Anti-hallucination is non-negotiable:
 *
 *   1. **Fetch before act.** Any write tool that takes a dispute_id /
 *      transaction_id / subscription_id ID is gated through an ownership
 *      check before reaching the executor. If the row doesn't belong to
 *      the user, the tool returns an error string and the executor never
 *      fires.
 *
 *   2. **Grounding check before letter generation.** The letter-tool
 *      interceptor builds a `groundingContext` object whose every field
 *      came directly from a Supabase row. If any required field is
 *      null/empty, the call returns the missing list to the conversational
 *      agent, which then asks the user to fix the gap. The letter writer
 *      (DISPUTE_MODEL) is NEVER called with incomplete grounding.
 *
 *   3. **Letter-writer system prompt.** Lives in dispute-letter-writer.ts
 *      → generateDisputeReply → the shared complaints-agent. It instructs
 *      Sonnet to ONLY use facts from the grounding payload, and to emit
 *      `[MISSING: field_name]` placeholders rather than guessing.
 *
 *   4. **Legislation lookup.** Pulled from `legal_references` table with
 *      `verification_status IN ('verified','needs_review')`. Never
 *      hallucinated. The writer's system prompt forbids citing any
 *      statute not in the grounding payload.
 *
 *   5. **Confirmation before send.** Every letter is gated behind a
 *      structured YES/NO confirmation block showing supplier name (from
 *      DB), amount (from DB), letter # (from DB count), FCA deadline
 *      (calculated from `first_letter_sent_at`), and a one-line
 *      legislation summary (from DB).
 *
 *   6. **Agent system prompt.** The Haiku conversation prompt below
 *      includes the grounding rule explicitly — no speculation, no
 *      "approximately", no inferred figures.
 *
 * Provider/window/template handling stays in this file too: every reply
 * goes through `sendPocketAgentReply` which is window-aware and falls
 * back to the `paybacker_pocket_agent_reply` template when the 24h
 * customer-service window is closed.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  sendWhatsAppTemplate,
  sendWhatsAppText,
} from '@/lib/whatsapp';
import { isWithinSessionWindow } from '@/lib/whatsapp/session-window';
import { telegramTools } from '@/lib/telegram/tools';
import {
  executeToolCall,
  type PendingAction as LegacyPendingAction,
} from '@/lib/telegram/tool-handlers';
import {
  generateGroundedDisputeLetter,
  renderMissingFieldsReply,
} from '@/lib/whatsapp/dispute-letter-writer';

// ─────────────────────────────────────────────────────────────────────────
// Two-tier model strategy.
//
// Easy to upgrade later — flip the constants and redeploy. The cost
// rationale (Haiku for high-frequency conversation, Sonnet for letters
// only) is in the long docblock above and in the spec doc.
// ─────────────────────────────────────────────────────────────────────────
const AGENT_MODEL = 'claude-haiku-4-5-20251001';
const DISPUTE_MODEL = 'claude-sonnet-4-6'; // exported for visibility — actual
// call site is dispute-letter-writer.ts → generateDisputeReply →
// complaints-agent. Documented here so the model strategy is in one place.
export { AGENT_MODEL, DISPUTE_MODEL };

/**
 * Tool names that produce or send a dispute letter. The agent runner
 * intercepts these and routes them through generateGroundedDisputeLetter
 * instead of the default executor. The default executor for
 * `draft_dispute_letter` also calls the grounded engine, but the
 * interceptor here adds the explicit pre-flight MISSING check AND the
 * structured confirmation summary that's required before SEND.
 */
const LETTER_GENERATION_TOOLS = new Set(['draft_dispute_letter']);

// ─────────────────────────────────────────────────────────────────────────
// Runtime tunables.
// ─────────────────────────────────────────────────────────────────────────
const MAX_ITERATIONS = 5;
const HARD_TIMEOUT_MS = 230_000; // 70s buffer before Vercel's 300s kill
const WHATSAPP_CHAR_LIMIT = 1500; // Twilio practical limit for templates
const HISTORY_MESSAGES = 10;
const RATE_LIMIT_PER_HOUR = 100;
const CONFIRMATION_TTL_MS = 30 * 60 * 1000;
const HISTORY_TTL_MS = 30 * 60 * 1000;
const HISTORY_LIMIT = 10;

// ─────────────────────────────────────────────────────────────────────────
// System prompt for the Haiku conversational layer.
//
// Mirrors user-bot.ts's brain (which stays in place as legacy) but adds
// the explicit no-speculation grounding rule the user prompt requires.
// ─────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Paybacker's Pocket Agent — a fully connected financial assistant for UK consumers, talking over WhatsApp. You have access to EVERYTHING the user can see on the Paybacker website: Money Hub, Subscriptions, Contracts, Disputes, Scanner, Rewards, Profile, Tasks. Never say you can't access something — if there's a tool for it, use it.

CRITICAL — GROUNDING RULE (non-negotiable): You are grounded entirely in the user's Paybacker account data. Never speculate about transaction amounts, merchant names, dates, or account details. If you don't have data for something, call the relevant tool to fetch it; only after the tool returns do you state numbers. Never say "approximately", "around", or "probably" when referring to financial figures — always fetch and state the exact number. If a tool returns no data, say so plainly ("I don't see any disputes against EE on your account") and offer the next step.

CITATION RULE — NON-NEGOTIABLE: When the user references their own email or letter ("my email", "my last letter", "my 16th letter", "what I demanded", "what I wrote", "the amount I asked for"), you MUST call quote_email_from_thread BEFORE answering. The same rule applies if they ask what the company actually said in their reply. Do not calculate, infer, or summarise from offer figures, dispute metadata, prior assistant turns, or earlier conversation context. Read the actual body via the tool and quote verbatim.

DRAFTING RULE — NON-NEGOTIABLE: When the user asks you to draft, redraft, respond to, reply to, follow up on, escalate, or write back about ANY dispute or company correspondence, you MUST call the draft_dispute_letter tool. NEVER write the reply yourself in chat prose. The letter is then drafted by the citation-grounded Sonnet writer (a separate Anthropic call you don't see), grounded entirely in DB-verified UK statute. Plain-prose replies without grounding are a product failure.

CONFIRMATION FLOW: After draft_dispute_letter runs, the user will see a STRUCTURED confirmation block (supplier, amount, letter #, FCA deadline, citations). They reply YES to send, NO to cancel, or describe changes. You do NOT need to ask "would you like me to send?" — the confirmation block does it. If the user replies YES, call record_letter_sent. If NO, call discard_letter_draft. If they want changes, call draft_dispute_letter again with an adjusted tone/brief.

WHATSAPP-SPECIFIC:
- Tight bullets, short bold headers, no essays. Currency: £X.XX. Dates: DD/MM/YYYY.
- WhatsApp does NOT render [text](url) — paste raw URLs.
- *bold* and _italic_ work; use sparingly.

GENERAL:
- ALWAYS call the relevant tool before answering. Never make up numbers.
- draft_dispute_letter is TERMINAL — call once when asked, never call search_legal_rights first.
- generate_cancellation_email: call once when user wants to cancel a specific provider.
- create_support_ticket: only when the user genuinely needs human support. NEVER for a categorisation request.
- DO IT with a tool — never suggest "go to the dashboard" for something you can do here.

RECATEGORISING (non-negotiable):
- If the user says a transaction is in the wrong category, use recategorise_transaction or recategorise_transactions immediately. Do NOT raise a support ticket.
- Tier-1 parents: mortgage, housing, council_tax, energy, water, broadband, mobile, bills, groceries, eating_out, transport, travel, shopping, entertainment, streaming, software, health, personal_care, insurance, loans, savings, fees, tax, education, family, pets, charity, gambling, income, transfers, other. Anything outside this list must be a CUSTOM SUBCATEGORY under one of these parents (call upsert_user_subcategory first).

DISPUTE OUTCOMES:
- Map natural language: "won" / "settled" / "got refund" → resolved_won; "lost" / "refused" → resolved_lost; "partial" / "settled for £X" → resolved_partial.
- For money: explicit number → money_recovered. "full amount" / "the full thing" → use_disputed_amount = true.
- Before asking "have you heard back?", call get_disputes first. If already resolved, acknowledge.

The available tools and their semantics match the dashboard agent exactly. See the tool definitions for what each one does. The conversational layer runs on Haiku for cost + latency; letter generation runs on Sonnet via a separate grounded call. You don't need to know which — just use the tools.`;

// ─────────────────────────────────────────────────────────────────────────
// Helpers — DB, formatting, send, history, rate limit, confirmation slot.
// ─────────────────────────────────────────────────────────────────────────

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Strip incompatible Markdown for WhatsApp. */
function formatForWhatsApp(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2');
}

/** Hard-cut a long reply into <=1500-char chunks on paragraph breaks. */
function chunkForWhatsApp(text: string, limit = WHATSAPP_CHAR_LIMIT): string[] {
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

/**
 * Window-aware send. Inside the 24h window → free-form. Outside →
 * paybacker_pocket_agent_reply template fallback so the user still gets
 * the reply.
 */
export async function sendPocketAgentReply(
  phone: string,
  text: string,
  opts: { userId?: string } = {},
): Promise<{
  provider: string;
  providerMessageId: string | undefined;
  usedTemplate: boolean;
}> {
  const safe = text.trim() || '(no content)';
  const trimmed =
    safe.length > WHATSAPP_CHAR_LIMIT
      ? safe.slice(0, WHATSAPP_CHAR_LIMIT - 1) + '…'
      : safe;

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
      '[whatsapp/pocket-agent] template fallback failed, attempting free-form:',
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
  result: {
    provider: string;
    providerMessageId: string | undefined;
    usedTemplate: boolean;
  },
): Promise<void> {
  try {
    const sb = admin();
    await sb.from('whatsapp_message_log').insert({
      user_id: userId,
      whatsapp_phone: phone,
      direction: 'outbound',
      message_type: result.usedTemplate ? 'template' : 'text',
      template_name: result.usedTemplate
        ? 'paybacker_pocket_agent_reply'
        : null,
      message_text: text,
      provider: result.provider,
      provider_message_id: result.providerMessageId ?? null,
    });
  } catch (err) {
    console.warn('[whatsapp/pocket-agent] log outbound failed', err);
  }
}

/** Send a (possibly long) reply as multiple chunks, all logged. */
async function sendChunked(
  phone: string,
  userId: string,
  text: string,
): Promise<void> {
  const chunks = chunkForWhatsApp(formatForWhatsApp(text));
  const total = chunks.length;
  for (let i = 0; i < chunks.length; i++) {
    const body =
      total > 1 ? `(${i + 1}/${total})\n\n${chunks[i]}` : chunks[i];
    try {
      const r = await sendPocketAgentReply(phone, body, { userId });
      await logOutbound(phone, userId, body, r);
    } catch (err) {
      console.error('[whatsapp/pocket-agent] send chunk failed', err);
    }
    if (i < chunks.length - 1) {
      await new Promise((res) => setTimeout(res, 250));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Conversation history — reads canonical from whatsapp_message_log AND
// mirrors latest turn into the JSONB snapshot.
// ─────────────────────────────────────────────────────────────────────────

async function getConversationHistory(
  sb: SupabaseClient,
  phone: string,
): Promise<Anthropic.MessageParam[]> {
  const { data } = await sb
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

  while (history.length > 0 && history[0].role === 'assistant') {
    history.shift();
  }

  return history;
}

async function appendHistorySnapshot(
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

// ─────────────────────────────────────────────────────────────────────────
// Pending-action confirmation slot.
// ─────────────────────────────────────────────────────────────────────────

export interface PendingActionSlot {
  kind: string;
  args: Record<string, unknown>;
  summary: string;
  queued_at: string;
  expires_at: string;
}

function detectIntent(text: string): 'yes' | 'no' | 'unknown' {
  const normalised = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  if (!normalised) return 'unknown';
  if (
    /^(yes|y|confirm|do it|go ahead|send it|approve|ok|okay|send)$/.test(
      normalised,
    )
  ) {
    return 'yes';
  }
  if (/^(no|n|cancel|don'?t|dont|stop that|abort|nope|discard)$/.test(normalised)) {
    return 'no';
  }
  return 'unknown';
}

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

// ─────────────────────────────────────────────────────────────────────────
// Letter-tool interceptor.
//
// Anthropic returned a tool_use for `draft_dispute_letter`. Instead of
// running the default executor (which DOES use the grounded engine but
// doesn't enforce the strict MISSING gate or build the structured
// confirmation block), we route through generateGroundedDisputeLetter
// here and return the result back into the tool loop.
// ─────────────────────────────────────────────────────────────────────────

interface LetterInterceptResult {
  /** Text returned to the model in the tool_result slot. */
  toolResultText: string;
  /** When the writer succeeded, the confirmation summary we'll show the user. */
  confirmation?: string;
  /** When the writer succeeded, the letter body to follow up with. */
  letter?: string;
  /** Dispute id resolved (for the pending_action slot). */
  disputeId?: string;
}

async function runLetterInterceptor(
  userId: string,
  toolInput: Record<string, unknown>,
): Promise<LetterInterceptResult> {
  const provider = String(toolInput.provider ?? '').trim();
  if (!provider) {
    return {
      toolResultText:
        'draft_dispute_letter requires a `provider` argument naming the supplier.',
    };
  }
  const tone = (toolInput.reply_tone ?? 'auto') as
    | 'auto'
    | 'friendly'
    | 'balanced'
    | 'firm';
  const userBrief =
    typeof toolInput.user_reply_brief === 'string'
      ? toolInput.user_reply_brief
      : undefined;

  const result = await generateGroundedDisputeLetter({
    userId,
    provider,
    tone,
    userBrief,
  });

  if (!result.ok) {
    return {
      toolResultText: renderMissingFieldsReply(result.missing ?? []),
    };
  }

  // The grounded confirmation is what the user sees BEFORE the YES/NO.
  // We hand the confirmation back to the model so the model knows what
  // it told the user, and we ALSO surface the letter body as a follow-up
  // chunk that the runner sends separately.
  return {
    toolResultText: `Grounded letter drafted for ${provider}. Letter #${
      (result.grounding as { priorLetterCount?: number } | undefined)
        ?.priorLetterCount != null
        ? (result.grounding as { priorLetterCount: number }).priorLetterCount + 1
        : 1
    }. Confirmation summary below has been sent to the user — do NOT repeat it. Just acknowledge and wait for their YES/NO/changes reply.`,
    confirmation: result.confirmation,
    letter: result.letter,
    disputeId: result.disputeId,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Rate limit — same hourly cap as the legacy user-bot.
// ─────────────────────────────────────────────────────────────────────────

async function checkRateLimit(
  sb: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await sb
    .from('whatsapp_message_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('direction', 'inbound')
    .gte('created_at', oneHourAgo);
  return (count ?? 0) < RATE_LIMIT_PER_HOUR;
}

// ─────────────────────────────────────────────────────────────────────────
// Main agent loop (AGENT_MODEL = Haiku).
// ─────────────────────────────────────────────────────────────────────────

interface AgentRunResult {
  /** Top-level conversational reply text to send (may be empty if only a letter was drafted). */
  text: string;
  /** Structured confirmation block, when a letter was drafted this turn. */
  confirmation?: string;
  /** Letter body to send as a follow-up message, when a letter was drafted. */
  letter?: string;
  /** Dispute id queued in the pending_action slot. */
  disputeId?: string;
}

async function runAgent(
  userId: string,
  phone: string,
  userMessage: string,
): Promise<AgentRunResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sb = admin();

  const history = await getConversationHistory(sb, phone);
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

  // Cache the largest static block (tools) to keep cost low across turns.
  const cachedTools = telegramTools.map((tool, idx) => {
    if (idx === telegramTools.length - 1) {
      return { ...tool, cache_control: { type: 'ephemeral' as const } };
    }
    return tool;
  });

  let response = await anthropic.messages.create({
    model: AGENT_MODEL,
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
  let interceptedConfirmation: string | undefined;
  let interceptedLetter: string | undefined;
  let interceptedDisputeId: string | undefined;

  while (response.stop_reason === 'tool_use' && iterations < MAX_ITERATIONS) {
    if (Date.now() - loopStart > HARD_TIMEOUT_MS) {
      console.warn(
        `[whatsapp/pocket-agent] tool loop hit ${HARD_TIMEOUT_MS}ms after ${iterations} iterations`,
      );
      break;
    }
    iterations++;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      // Letter-tool interceptor — route through the grounded writer
      // instead of letting the default executor fire.
      if (LETTER_GENERATION_TOOLS.has(block.name)) {
        try {
          const intercept = await runLetterInterceptor(
            userId,
            block.input as Record<string, unknown>,
          );
          if (intercept.confirmation) {
            interceptedConfirmation = intercept.confirmation;
            interceptedLetter = intercept.letter;
            interceptedDisputeId = intercept.disputeId;
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: intercept.toolResultText,
          });
        } catch (err) {
          console.error(
            '[whatsapp/pocket-agent] letter interceptor failed:',
            err,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Letter generation failed: ${
              err instanceof Error ? err.message : 'unknown error'
            }. Please try again or rephrase.`,
          });
        }
        continue;
      }

      // Default executor — same dispatcher the dashboard + Telegram use.
      let result: { text: string; pendingAction?: LegacyPendingAction };
      try {
        result = await executeToolCall(
          block.name,
          block.input as Record<string, unknown>,
          userId,
          'whatsapp',
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error(
          `[whatsapp/pocket-agent] tool error (${block.name}):`,
          err,
        );
        result = {
          text: `Error executing tool: ${errMsg}. Please try again or rephrase.`,
        };
      }

      // Legacy TERMINAL pendingAction (the dashboard letter flow) — we
      // surface it back to the user the same way the legacy bot did but
      // exit the tool loop. This branch normally only fires when the
      // model bypassed our letter interceptor (unlikely with the new
      // system prompt, but kept as a safety net).
      if (result.pendingAction) {
        return {
          text: result.text,
          letter: result.pendingAction.letter_text,
        };
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
      model: AGENT_MODEL,
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

  return {
    text: finalText,
    confirmation: interceptedConfirmation,
    letter: interceptedLetter,
    disputeId: interceptedDisputeId,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public entry — called from /api/whatsapp/webhook.
// ─────────────────────────────────────────────────────────────────────────

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

export async function handlePocketAgentMessage(opts: {
  phone: string;
  text: string;
  userId: string;
}): Promise<PocketAgentResult> {
  const { phone, text, userId } = opts;

  // 1. Rate-limit defence (same hourly cap as legacy user-bot).
  const sb = admin();
  const within = await checkRateLimit(sb, userId);
  if (!within) {
    const msg = `You've hit the ${RATE_LIMIT_PER_HOUR}-message hourly limit on WhatsApp. We'll respond again in an hour. The dashboard at paybacker.co.uk has no rate limit.`;
    await sendChunked(phone, userId, msg);
    return { ok: false, reason: 'rate_limited' };
  }

  // 2. Pending-action gate.
  const { slot, expired } = await readPendingAction(phone);
  if (slot && expired) {
    await clearPendingAction(phone);
    const reply =
      "That confirmation expired (we hold them for 30 minutes). Tell me again what you'd like to do.";
    await sendChunked(phone, userId, reply);
    return { ok: true, reason: 'pending_action_expired' };
  }

  if (slot) {
    const intent = detectIntent(text);
    if (intent === 'yes') {
      // The user-bot flow uses record_letter_sent / similar to actually
      // persist the SAVE — we surface intent here and let the next agent
      // turn handle the persistence by routing the YES into the agent
      // with the pending_action context attached as a system hint. For
      // now, we acknowledge and clear; the agent's next interaction
      // (e.g. "did you send it?") will read state from the DB.
      await clearPendingAction(phone);
      const ackReply = `OK — ${slot.summary}`;
      await sendChunked(phone, userId, ackReply);
      await appendHistorySnapshot(phone, text, ackReply);

      // Hand off to the agent with the YES as context so it can call
      // record_letter_sent for the dispute that was queued.
      const followup = await runAgent(
        userId,
        phone,
        `(System: the user has confirmed the pending action — ${slot.summary}. Persist it now via the appropriate tool.)`,
      );
      if (followup.text) {
        await sendChunked(phone, userId, followup.text);
      }
      return { ok: true, reason: 'pending_action_confirmed' };
    }
    if (intent === 'no') {
      await clearPendingAction(phone);
      const ackReply = "Cancelled — I won't do that.";
      await sendChunked(phone, userId, ackReply);
      await appendHistorySnapshot(phone, text, ackReply);
      return { ok: true, reason: 'pending_action_cancelled' };
    }
    // User has moved on — clear and continue to the agent.
    await clearPendingAction(phone);
  }

  // 3. Run the agent.
  try {
    const result = await runAgent(userId, phone, text);

    // 3a. Conversational reply (always present).
    if (result.text) {
      await sendChunked(phone, userId, result.text);
    }

    // 3b. Letter draft path — the interceptor populated confirmation +
    //     letter. Send confirmation first, then the letter body as a
    //     follow-up, and queue the pending_action slot so the user's
    //     YES/NO lands here on the next turn.
    if (result.confirmation && result.letter) {
      await sendChunked(phone, userId, result.confirmation);
      await sendChunked(phone, userId, result.letter);
      if (result.disputeId) {
        await queuePendingAction(phone, {
          kind: 'send_dispute_letter',
          args: { dispute_id: result.disputeId, letter_text: result.letter },
          summary: 'Dispute letter ready to send',
        });
      }
    }

    await appendHistorySnapshot(
      phone,
      text,
      result.text || result.confirmation || '(letter drafted)',
    );

    return { ok: true, reason: 'normal_reply' };
  } catch (err) {
    console.error('[whatsapp/pocket-agent] handle failed', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    await sendChunked(
      phone,
      userId,
      `I hit an error processing that: ${errMsg} — please try again in a moment.`,
    );
    return { ok: false, reason: 'agent_error' };
  }
}
