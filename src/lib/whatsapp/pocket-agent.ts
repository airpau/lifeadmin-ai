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
 *   2. **Pre-flight grounding gate.** Before the DISPUTE_MODEL call
 *      fires, the letter-tool interceptor builds a `groundingContext`
 *      from real DB rows and runs `validateGroundingForLetter`. If any
 *      required field (supplierName, amount, transactionDate,
 *      userFullName; priorLetters for chase letters) is missing, the
 *      call returns a friendly, conversational message to the agent —
 *      not a technical error, not a placeholder. The agent then asks
 *      the user in plain English and we queue a `pending_action` slot
 *      with `awaiting_field` so the next inbound is routed as the
 *      answer. Sonnet is NEVER called with incomplete grounding.
 *
 *   3. **No placeholders in letters.** Optional fields (address,
 *      account name) are omitted naturally by the writer when absent —
 *      users never see `[MISSING: …]` markers. The pre-flight gate
 *      guarantees the writer always has every required field.
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
  type GroundingValidationFail,
  type WriteTarget,
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
 * instead of the default executor. The grounded writer runs a pre-flight
 * validation gate; if any required field is missing it returns a
 * friendly conversational message AND a `WriteTarget` so the awaiting-
 * input flow can persist the user's answer on the next turn.
 */
const LETTER_GENERATION_TOOLS = new Set(['draft_dispute_letter']);

/**
 * WhatsApp-only write-back tools. Telegram has its own field-update
 * surface; these two live here so the Pocket Agent can persist data the
 * user provides over chat (their address, their name, a missing dispute
 * date, etc.) into the canonical DB tables. Same data the website would
 * see immediately.
 *
 * Both handlers verify `user_id` ownership before any write. The agent
 * is forbidden from passing a `user_id` argument — we wire it from the
 * authenticated session.
 */
const WHATSAPP_WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'update_profile_field',
    description:
      "Persist a single field on the user's Paybacker profile. Use when the user provides personal data over chat (address, full name, phone). The value lands on the same `profiles` row the website reads. Allowed fields: 'full_name', 'address', 'postcode', 'phone'. Always confirm what was saved.",
    input_schema: {
      type: 'object' as const,
      properties: {
        field: {
          type: 'string',
          enum: ['full_name', 'address', 'postcode', 'phone'],
          description: 'Which profile column to update.',
        },
        value: {
          type: 'string',
          description: 'The value provided by the user, trimmed.',
        },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'update_dispute_field',
    description:
      'Persist a single field on a specific dispute row. Use when the user clarifies dispute-specific data the writer needs (amount, transaction date, corrected supplier name). Allowed fields: `disputed_amount` (number), `transaction_date` (YYYY-MM-DD), `provider_name` (string). The dispute_id MUST be one the agent has previously seen from get_disputes / get_dispute_detail / a draft_dispute_letter interception — never invented.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dispute_id: {
          type: 'string',
          description: 'UUID of the dispute row to update.',
        },
        field: {
          type: 'string',
          enum: ['disputed_amount', 'transaction_date', 'provider_name'],
          description: 'Which dispute column to update.',
        },
        value: {
          type: 'string',
          description:
            'New value as a string. Numbers are parsed server-side. Dates must be DD/MM/YYYY or YYYY-MM-DD.',
        },
      },
      required: ['dispute_id', 'field', 'value'],
    },
  },
];

const WHATSAPP_WRITE_TOOL_NAMES = new Set(
  WHATSAPP_WRITE_TOOLS.map((t) => t.name),
);

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

PRE-FLIGHT GATE: draft_dispute_letter runs a strict validation gate BEFORE writing — it checks supplier, amount, transaction date, and the user's full name are on file. If any are missing, the tool returns a friendly user-facing message starting with "[BLOCKED: …]". That message has ALREADY been formatted to send to the user verbatim — just echo it back in your reply, never paraphrase it, never add caveats. The next inbound from the user will be the answer; the system routes it back to you with explicit instructions to persist via update_profile_field or update_dispute_field and then continue.

WRITE-BACK PRINCIPLE: When the user tells you factual data about themselves (address, name, transaction date, etc.), persist it IMMEDIATELY via update_profile_field or update_dispute_field. Never ask twice. Confirm in one short line ("Saved — address on your profile.") then continue the action that prompted the question.

CONFIRMATION FLOW: After draft_dispute_letter runs successfully, the user will see a STRUCTURED confirmation block (supplier, amount, letter #, FCA deadline, citations). They reply YES to send, NO to cancel, or describe changes. You do NOT need to ask "would you like me to send?" — the confirmation block does it. If the user replies YES, call record_letter_sent. If NO, call discard_letter_draft. If they want changes, call draft_dispute_letter again with an adjusted tone/brief.

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
- Tier-1 parents: mortgage, housing, council_tax, energy, water, broadband, mobile, bills, groceries, eating_out, transport, travel, shopping, entertainment, streaming, software, health, personal_care, insurance, loans, savings, fees, tax, education, family, pets, charity, gambling, wages, payroll, income, transfers, other. Anything outside this list must be a CUSTOM SUBCATEGORY under one of these parents (call upsert_user_subcategory first).

PAYROLL AND STAFF PAYMENTS (non-negotiable):
- Transactions whose description/merchant contains "payroll", "salary", "wages", "staff", "PAYE", "net pay", or a person's name that the user identifies as an employee are STAFF PAYMENTS, not subscriptions. They are legitimate business costs.
- NEVER treat a staff payment as a subscription, a trial, or a renewal, and NEVER suggest cancelling one or "reply CANCEL". If you ever told the user one was a subscription/trial, apologise briefly and fix it.
- If the user says something is an employee / salary / wages / staff payment, recategorise it to "wages" (staff wages) or "payroll" — NEVER "bills" or "subscriptions". Use recategorise_transactions to update every matching transaction in one go.
- A staff payment should not live in the subscriptions list. If one was mis-detected as a subscription, recategorise the subscription to "wages"/"payroll" and dismiss/cancel it so it stops generating renewal alerts.

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
  /**
   * The agent action that's queued. Two shapes today:
   *   - `send_dispute_letter` — a draft is ready, user must YES/NO to send.
   *   - `awaiting_input` — the action was blocked by a missing field;
   *     the user's next reply is the answer.
   * Other kinds may be added by future tools.
   */
  kind: string;
  /** Arbitrary action-specific args. */
  args: Record<string, unknown>;
  /** One-line summary used in YES ack copy + the agent's view of the slot. */
  summary: string;
  queued_at: string;
  expires_at: string;
  /**
   * When set, the next inbound is treated as the user's answer to the
   * missing field rather than a fresh conversational turn. The agent
   * sees an explicit instruction to persist via the appropriate
   * write-back tool and then resume the `original_action`.
   */
  awaiting_field?: string;
  /** Write target hint for the agent (which table + field to persist to). */
  awaiting_write_target?: WriteTarget;
  /**
   * The user-facing question we sent. Stored so we can resurface it on
   * the next turn if needed (e.g. for telemetry / debug).
   */
  awaiting_question?: string;
  /**
   * The original action that was blocked. After the user provides the
   * missing field, the agent re-fires this verbatim.
   */
  original_action?: { kind: string; args: Record<string, unknown> };
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
  /** Dispute id resolved (when known). */
  disputeId?: string;
  /**
   * When the pre-flight gate failed, the validation payload — used to
   * queue an awaiting_field pending_action so the user's next reply is
   * routed as the answer.
   */
  blockedBy?: GroundingValidationFail;
  /**
   * Original action args, captured at interception time. Stored on the
   * awaiting slot so we can replay the SAME draft_dispute_letter call
   * after the user fills in the gap. The user shouldn't have to
   * re-state "draft a complaint to British Gas".
   */
  originalArgs?: Record<string, unknown>;
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

  if (!result.ok && result.validation) {
    // Pre-flight gate failed. Hand the friendly message back to the
    // model with a "[BLOCKED]" prefix so the system prompt's PRE-FLIGHT
    // GATE rule fires — the agent echoes the message verbatim. We also
    // surface the validation payload to the caller so it can queue an
    // awaiting_field slot for the auto-resume flow.
    return {
      toolResultText: `[BLOCKED: ${result.validation.field}] ${result.validation.friendlyMessage}`,
      blockedBy: result.validation,
      disputeId: result.disputeId,
      originalArgs: { provider, reply_tone: tone, user_reply_brief: userBrief },
    };
  }

  if (!result.ok) {
    return {
      toolResultText:
        "I couldn't draft the letter — internal validation failed without a clear reason. Try again in a moment.",
    };
  }

  // The grounded confirmation is what the user sees BEFORE the YES/NO.
  // We hand the confirmation back to the model so the model knows what
  // it told the user, and we ALSO surface the letter body as a follow-up
  // chunk that the runner sends separately.
  const letterNumber =
    result.grounding != null ? result.grounding.priorLetterCount + 1 : 1;
  return {
    toolResultText: `Grounded letter drafted for ${provider}. Letter #${letterNumber}. Confirmation summary below has been sent to the user — do NOT repeat it. Just acknowledge and wait for their YES/NO/changes reply.`,
    confirmation: result.confirmation,
    letter: result.letter,
    disputeId: result.disputeId,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Write-back tool handlers — update_profile_field, update_dispute_field.
//
// Both verify ownership before any write. The agent never passes a
// user_id — we wire it from the authenticated session.
// ─────────────────────────────────────────────────────────────────────────

const ALLOWED_PROFILE_FIELDS = new Set([
  'full_name',
  'address',
  'postcode',
  'phone',
]);
const ALLOWED_DISPUTE_FIELDS = new Set([
  'disputed_amount',
  'transaction_date',
  'provider_name',
]);

/** Normalise a user-supplied date string to YYYY-MM-DD. Returns null on parse fail. */
function normaliseDate(input: string): string | null {
  const t = input.trim();
  // DD/MM/YYYY
  const ukm = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ukm) {
    const dd = ukm[1].padStart(2, '0');
    const mm = ukm[2].padStart(2, '0');
    const yyyy = ukm[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // Date.parse fallback (handles "23 May 2026" etc.)
  const ms = Date.parse(t);
  if (Number.isFinite(ms)) {
    const d = new Date(ms);
    if (Number.isFinite(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

async function handleUpdateProfileField(
  userId: string,
  toolInput: Record<string, unknown>,
): Promise<{ text: string }> {
  const field = String(toolInput.field ?? '').trim();
  const value = String(toolInput.value ?? '').trim();
  if (!ALLOWED_PROFILE_FIELDS.has(field)) {
    return {
      text: `update_profile_field: '${field}' is not an allowed field. Allowed: ${Array.from(ALLOWED_PROFILE_FIELDS).join(', ')}.`,
    };
  }
  if (!value) {
    return {
      text: `update_profile_field: value is empty — nothing to save.`,
    };
  }
  const sb = admin();
  // Ownership check is implicit on profiles: the primary key IS the user_id.
  // We use the user_id filter to be defensive against a future schema shift.
  const { error } = await sb
    .from('profiles')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) {
    console.error(
      '[whatsapp/pocket-agent] update_profile_field failed',
      error,
    );
    return {
      text: `update_profile_field: write failed (${error.message}). Don't retry — surface the failure to the user.`,
    };
  }
  return {
    text: `Saved '${value}' to profile.${field}. Confirm to the user in one short line and immediately re-fire any blocked action that needed it.`,
  };
}

async function handleUpdateDisputeField(
  userId: string,
  toolInput: Record<string, unknown>,
): Promise<{ text: string }> {
  const disputeId = String(toolInput.dispute_id ?? '').trim();
  const field = String(toolInput.field ?? '').trim();
  const rawValue = String(toolInput.value ?? '').trim();
  if (!disputeId) {
    return { text: 'update_dispute_field: dispute_id is required.' };
  }
  if (!ALLOWED_DISPUTE_FIELDS.has(field)) {
    return {
      text: `update_dispute_field: '${field}' is not an allowed field. Allowed: ${Array.from(ALLOWED_DISPUTE_FIELDS).join(', ')}.`,
    };
  }
  if (!rawValue) {
    return { text: `update_dispute_field: value is empty — nothing to save.` };
  }

  // Ownership check — confirm the dispute belongs to this user BEFORE write.
  const sb = admin();
  const { data: owner } = await sb
    .from('disputes')
    .select('id, user_id')
    .eq('id', disputeId)
    .maybeSingle();
  if (!owner) {
    return {
      text: `update_dispute_field: dispute ${disputeId} not found.`,
    };
  }
  if (owner.user_id !== userId) {
    console.warn(
      '[whatsapp/pocket-agent] update_dispute_field BLOCKED cross-user write',
      { userId, disputeId, owner_user_id: owner.user_id },
    );
    return {
      text: `update_dispute_field: this dispute doesn't belong to the authenticated user — write blocked.`,
    };
  }

  // Field-specific coercion.
  let coerced: string | number | null = null;
  if (field === 'disputed_amount') {
    const cleaned = rawValue.replace(/[£,\s]/g, '');
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) {
      return {
        text: `update_dispute_field: '${rawValue}' isn't a valid £ amount. Ask the user to re-state.`,
      };
    }
    coerced = n;
  } else if (field === 'transaction_date') {
    const iso = normaliseDate(rawValue);
    if (!iso) {
      return {
        text: `update_dispute_field: '${rawValue}' isn't a valid date. Ask for DD/MM/YYYY.`,
      };
    }
    coerced = iso;
  } else if (field === 'provider_name') {
    if (rawValue.length < 2) {
      return {
        text: `update_dispute_field: provider name is too short — ask the user to re-state.`,
      };
    }
    coerced = rawValue;
  }

  const { error } = await sb
    .from('disputes')
    .update({ [field]: coerced, updated_at: new Date().toISOString() })
    .eq('id', disputeId)
    .eq('user_id', userId);
  if (error) {
    console.error(
      '[whatsapp/pocket-agent] update_dispute_field failed',
      error,
    );
    return {
      text: `update_dispute_field: write failed (${error.message}).`,
    };
  }
  return {
    text: `Saved '${String(coerced)}' to disputes.${field} for dispute ${disputeId}. Confirm to the user in one short line and immediately re-fire any blocked action that needed it.`,
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
  /**
   * Pre-flight gate failure (if any) on the last draft_dispute_letter
   * call this turn. Drives the awaiting_field pending_action slot.
   */
  blockedBy?: GroundingValidationFail;
  /** Original args for the blocked action, so we can replay after fix. */
  blockedOriginalArgs?: Record<string, unknown>;
}

/** Build the full tools array — telegram registry + WhatsApp-only write-backs. */
function buildToolList(): Anthropic.Tool[] {
  const all: Anthropic.Tool[] = [...telegramTools, ...WHATSAPP_WRITE_TOOLS];
  // Cache the LAST tool so subsequent turns prompt-cache the whole list.
  return all.map((tool, idx) =>
    idx === all.length - 1
      ? { ...tool, cache_control: { type: 'ephemeral' as const } }
      : tool,
  );
}

async function runAgent(
  userId: string,
  phone: string,
  userMessage: string,
  opts: { systemAddendum?: string } = {},
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

  const cachedTools = buildToolList();
  const systemBlocks: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];
  if (opts.systemAddendum) {
    systemBlocks.push({ type: 'text', text: opts.systemAddendum });
  }

  let response = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens: 2048,
    system: systemBlocks,
    tools: cachedTools,
    messages,
  });

  let iterations = 0;
  const loopStart = Date.now();
  let interceptedConfirmation: string | undefined;
  let interceptedLetter: string | undefined;
  let interceptedDisputeId: string | undefined;
  let interceptedBlockedBy: GroundingValidationFail | undefined;
  let interceptedBlockedArgs: Record<string, unknown> | undefined;

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
          if (intercept.blockedBy) {
            interceptedBlockedBy = intercept.blockedBy;
            interceptedBlockedArgs = intercept.originalArgs;
            // Latest write wins — a successful retry later this turn
            // clears the block.
            interceptedConfirmation = undefined;
            interceptedLetter = undefined;
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

      // WhatsApp-only write-back tools — inline handlers, never reach
      // the telegram dispatcher.
      if (WHATSAPP_WRITE_TOOL_NAMES.has(block.name)) {
        try {
          const writeResult =
            block.name === 'update_profile_field'
              ? await handleUpdateProfileField(
                  userId,
                  block.input as Record<string, unknown>,
                )
              : await handleUpdateDisputeField(
                  userId,
                  block.input as Record<string, unknown>,
                );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: writeResult.text,
          });
        } catch (err) {
          console.error(
            `[whatsapp/pocket-agent] ${block.name} failed:`,
            err,
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `${block.name} failed: ${
              err instanceof Error ? err.message : 'unknown error'
            }`,
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
      system: systemBlocks,
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
    blockedBy: interceptedBlockedBy,
    blockedOriginalArgs: interceptedBlockedArgs,
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

  // 2. Pending-action gate. Three branches:
  //    (a) awaiting_field set → route as answer to the missing field.
  //    (b) draft ready (no awaiting_field) → YES/NO intent handling.
  //    (c) anything else with a slot → treat as new message but clear stale slot.
  const { slot, expired } = await readPendingAction(phone);
  if (slot && expired) {
    await clearPendingAction(phone);
    const reply =
      "That confirmation expired (we hold them for 30 minutes). Tell me again what you'd like to do.";
    await sendChunked(phone, userId, reply);
    return { ok: true, reason: 'pending_action_expired' };
  }

  // 2a. Awaiting-input branch — the previous turn asked the user for
  //     a missing field. Route this message to the agent with explicit
  //     instructions to persist via the write-back tool AND re-fire the
  //     original action. The agent decides whether the reply is the
  //     answer or a pivot (new question), and acts accordingly.
  if (slot && slot.awaiting_field && slot.original_action) {
    const target = slot.awaiting_write_target;
    const targetHint =
      target?.table === 'profiles'
        ? `update_profile_field({field: '${target.field}', value: <the user's answer>})`
        : target?.table === 'disputes'
          ? `update_dispute_field({dispute_id: '${target.dispute_id}', field: '${target.field}', value: <the user's answer>})`
          : '(no direct write target — re-evaluate the dispute and continue)';

    const addendum = [
      'AWAITING-INPUT CONTEXT (active for this turn only):',
      `You previously asked the user for their ${slot.awaiting_field} so you could complete:`,
      `  Action: ${slot.original_action.kind}`,
      `  Args:   ${JSON.stringify(slot.original_action.args)}`,
      `The user's reply follows. Decide which case applies:`,
      `  (a) Reply provides the value. Call ${targetHint} to persist it. After the write succeeds, IMMEDIATELY call ${slot.original_action.kind}(${JSON.stringify(slot.original_action.args)}) again — the validation gate should pass this time. Confirm the save in one short line ("Saved — address on your profile.").`,
      `  (b) Reply is a new question. Ignore the awaiting context; just answer normally. The awaiting state will clear automatically.`,
    ].join('\n');

    await clearPendingAction(phone); // Clear pre-run; the agent may queue a fresh slot.
    try {
      const result = await runAgent(userId, phone, text, {
        systemAddendum: addendum,
      });
      if (result.text) {
        await sendChunked(phone, userId, result.text);
      }
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
      } else if (result.blockedBy) {
        // Still blocked — likely a different missing field, OR the user
        // pivoted and the agent re-attempted out of curiosity. Re-queue
        // a fresh awaiting slot for the new field.
        await queuePendingAction(phone, {
          kind: 'awaiting_input',
          args: {},
          summary: `Awaiting ${result.blockedBy.field}`,
          awaiting_field: result.blockedBy.field,
          awaiting_write_target: result.blockedBy.writeTarget,
          awaiting_question: result.blockedBy.friendlyMessage,
          original_action: slot.original_action,
        });
      }
      await appendHistorySnapshot(
        phone,
        text,
        result.text || result.confirmation || '(awaiting-input continued)',
      );
      return { ok: true, reason: 'normal_reply' };
    } catch (err) {
      console.error(
        '[whatsapp/pocket-agent] awaiting-input run failed',
        err,
      );
      await sendChunked(
        phone,
        userId,
        `I hit an error processing that — try again in a moment.`,
      );
      return { ok: false, reason: 'agent_error' };
    }
  }

  // 2b. YES/NO intent handling for a queued draft.
  if (slot && !slot.awaiting_field) {
    const intent = detectIntent(text);
    if (intent === 'yes') {
      await clearPendingAction(phone);
      const ackReply = `OK — ${slot.summary}`;
      await sendChunked(phone, userId, ackReply);
      await appendHistorySnapshot(phone, text, ackReply);

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

  // 3. Run the agent — normal path.
  try {
    const result = await runAgent(userId, phone, text);

    // 3a. Conversational reply (always present).
    if (result.text) {
      await sendChunked(phone, userId, result.text);
    }

    // 3b. Letter pre-flight blocked — queue an awaiting_field slot so
    //     the user's next reply is routed as the answer. We rely on the
    //     agent's text reply (containing the friendly message) for the
    //     user-facing prompt; this slot is the orchestration state.
    if (result.blockedBy && result.blockedOriginalArgs) {
      await queuePendingAction(phone, {
        kind: 'awaiting_input',
        args: {},
        summary: `Awaiting ${result.blockedBy.field}`,
        awaiting_field: result.blockedBy.field,
        awaiting_write_target: result.blockedBy.writeTarget,
        awaiting_question: result.blockedBy.friendlyMessage,
        original_action: {
          kind: 'draft_dispute_letter',
          args: result.blockedOriginalArgs,
        },
      });
    } else if (result.confirmation && result.letter) {
      // 3c. Letter ready — queue YES/NO slot.
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
