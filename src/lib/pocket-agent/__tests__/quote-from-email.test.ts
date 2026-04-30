/**
 * Smoke / wiring assertions for the `quote_email_from_thread` tool.
 *
 * Like the rest of `src/lib/__tests__/*.ts` in this repo, this file is
 * compiled by `tsc --noEmit` and used for contract drift detection — it
 * never runs end-to-end (that would need a live Anthropic + Supabase).
 *
 * The bug it exists to prevent regressing:
 * On 2026-04-29 a real WhatsApp Pocket Agent conversation showed the
 * agent answering "what amount did I demand in my 16th letter to
 * OneStream?" by inferring ~£74 pro-rata from the company's offer
 * figures, when the user's actual letter demanded ~£500+ driven by
 * Ofcom Automatic Compensation Scheme day rates. The agent had access
 * to the linked email thread but composed the answer from in-context
 * summary instead of reading the body. Full screenshot trail in
 * docs/marketing/pocket-agent-onestream-thread-link-2026-04-30.md.
 *
 * The fix layered three things; we assert each is wired:
 *   1. Tool registered in the shared tool list (`telegramTools`)
 *      — both Telegram and WhatsApp pull from this list, so one
 *      registration covers both surfaces.
 *   2. Tool description carries the assertive "ALWAYS / NEVER" language
 *      that pushes Claude away from inference.
 *   3. System prompts on BOTH channels (Telegram + WhatsApp) carry the
 *      "CITATION RULE — NON-NEGOTIABLE" preamble so the model reaches
 *      for the tool before composing.
 */

import { telegramTools } from '@/lib/telegram/tools';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ----------------------------------------------------------------------
// 1. Tool exists in the registered list
// ----------------------------------------------------------------------

const quoteTool = telegramTools.find((t) => t.name === 'quote_email_from_thread');

if (!quoteTool) {
  throw new Error(
    'quote_email_from_thread is missing from telegramTools — Pocket Agent will hallucinate email content again. See docs/marketing/pocket-agent-onestream-thread-link-2026-04-30.md.',
  );
}

// ----------------------------------------------------------------------
// 2. Tool description is assertive about WHEN to call it
// ----------------------------------------------------------------------

const desc = quoteTool.description ?? '';
const REQUIRED_PHRASES = [
  'ALWAYS call this tool',
  'NEVER infer',
  'verbatim',
];
for (const phrase of REQUIRED_PHRASES) {
  if (!desc.includes(phrase)) {
    throw new Error(
      `quote_email_from_thread description is missing the assertive phrase "${phrase}". Without it, Claude will fall back to inference.`,
    );
  }
}

// Schema sanity — provider is required, direction + limit optional.
type ToolSchema = {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: readonly string[];
};
const schema = quoteTool.input_schema as ToolSchema;
if (!schema.required || !schema.required.includes('provider')) {
  throw new Error('quote_email_from_thread must require `provider`.');
}
const props = schema.properties ?? {};
for (const expected of ['provider', 'direction', 'limit']) {
  if (!(expected in props)) {
    throw new Error(`quote_email_from_thread schema missing property "${expected}".`);
  }
}

// ----------------------------------------------------------------------
// 3. Both system prompts carry the citation rule
// ----------------------------------------------------------------------

// We can't import the prompts directly (they're const-internal to the
// bot files and importing them pulls in @anthropic-ai/sdk + the whole
// Supabase admin path at module-eval time). Read the source instead —
// this is what the legal-refs-guardrail test does for the same reason.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const TELEGRAM_BOT_SRC = readFileSync(
  join(REPO_ROOT, 'src', 'lib', 'telegram', 'user-bot.ts'),
  'utf8',
);
const WHATSAPP_BOT_SRC = readFileSync(
  join(REPO_ROOT, 'src', 'lib', 'whatsapp', 'user-bot.ts'),
  'utf8',
);

const PROMPT_REQUIREMENTS = [
  'CITATION RULE',
  'NON-NEGOTIABLE',
  'quote_email_from_thread',
];

for (const phrase of PROMPT_REQUIREMENTS) {
  if (!TELEGRAM_BOT_SRC.includes(phrase)) {
    throw new Error(
      `Telegram bot system prompt is missing "${phrase}" — citation rule is unwired on Telegram.`,
    );
  }
  if (!WHATSAPP_BOT_SRC.includes(phrase)) {
    throw new Error(
      `WhatsApp bot system prompt is missing "${phrase}" — citation rule is unwired on WhatsApp. WhatsApp users (Pro tier) hit this regression first.`,
    );
  }
}

// ----------------------------------------------------------------------
// 4. Handler returns structured fields when the tool is called
// ----------------------------------------------------------------------
//
// We don't run the handler against live Supabase here — that would
// require credentials and a real dispute row. We assert the dispatch
// case exists by string-matching the handler source, the same approach
// the rest of the smoke tests in this repo use.

const HANDLERS_SRC = readFileSync(
  join(REPO_ROOT, 'src', 'lib', 'telegram', 'tool-handlers.ts'),
  'utf8',
);

if (!HANDLERS_SRC.includes("case 'quote_email_from_thread':")) {
  throw new Error('tool-handlers.ts is missing the dispatch case for quote_email_from_thread.');
}
if (!HANDLERS_SRC.includes('async function quoteEmailFromThread(')) {
  throw new Error('tool-handlers.ts is missing the quoteEmailFromThread implementation.');
}
// The fields the agent needs to quote correctly:
for (const field of ['message_index_in_thread', 'subject', 'body', 'direction', 'sender', 'recipient']) {
  if (!HANDLERS_SRC.includes(field)) {
    throw new Error(
      `quoteEmailFromThread handler is missing the structured field "${field}". The agent needs all of {date, sender, recipient, subject, body, direction, message_index_in_thread} to answer "my 16th letter"-style questions.`,
    );
  }
}

export {};
