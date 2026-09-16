/**
 * Internal API cost ledger.
 *
 * Every paid third-party API call should fire-and-forget a row into the
 * `api_cost_ledger` table so the founder-only /dashboard/admin/billing page
 * can show real spend. Helpers are designed to never throw — they swallow
 * errors and log to console.
 *
 * Currency:
 *   We bill users in GBP, but Anthropic / Perplexity publish prices in USD.
 *   We store cost_gbp using a hardcoded conversion rate. Update this when
 *   the GBP/USD rate moves materially.
 *
 *   Rate (as of 2026-04-29): 1 USD = 0.79 GBP.
 *
 * Anthropic prices (per 1M tokens, USD) — as published April 2026:
 *   claude-opus-4-7              : input $15.00, output $75.00
 *   claude-sonnet-4-6            : input $3.00,  output $15.00
 *   claude-3-5-sonnet (legacy)   : input $3.00,  output $15.00
 *   claude-haiku-4-5             : input $1.00,  output $5.00
 *
 * Anthropic web search (server tool):
 *   $10.00 per 1,000 searches, billed ON TOP of normal token cost.
 *
 * Perplexity prices:
 *   sonar-pro             : flat $0.005 / query (covers small reasoning calls)
 *   sonar-deep-research   : flat $0.01 / query
 *
 * Resend prices:
 *   $0.40 per 1000 transactional emails on the Pro plan.
 */

import { createClient } from '@supabase/supabase-js';

const USD_TO_GBP = 0.79;

type Provider = 'anthropic' | 'perplexity' | 'resend' | 'stripe' | 'truelayer' | 'other';

function getAdmin() {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

async function insertRow(row: {
  provider: Provider;
  model?: string | null;
  endpoint?: string | null;
  user_id?: string | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cost_gbp: number;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const admin = getAdmin();
    const { error } = await admin.from('api_cost_ledger').insert({
      provider: row.provider,
      model: row.model ?? null,
      endpoint: row.endpoint ?? null,
      user_id: row.user_id ?? null,
      input_tokens: row.input_tokens ?? null,
      output_tokens: row.output_tokens ?? null,
      cost_gbp: Number(row.cost_gbp.toFixed(6)),
      metadata: row.metadata ?? null,
    });
    if (error) {
      console.warn('[cost-ledger] insert failed:', error.message);
    }
  } catch (err: any) {
    console.warn('[cost-ledger] insert threw:', err?.message || String(err));
  }
}

// Per-million USD input/output prices.
const ANTHROPIC_PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
};

function priceForAnthropic(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  if (m.includes('opus-4-7')) return ANTHROPIC_PRICES['claude-opus-4-7'];
  if (m.includes('sonnet-4-6') || m.includes('sonnet-4')) return ANTHROPIC_PRICES['claude-sonnet-4-6'];
  if (m.includes('3-5-sonnet') || m.includes('3.5-sonnet')) return ANTHROPIC_PRICES['claude-3-5-sonnet'];
  if (m.includes('haiku-4-5') || m.includes('haiku')) return ANTHROPIC_PRICES['claude-haiku-4-5'];
  // Unknown — assume Sonnet pricing as a safe upper bound.
  return ANTHROPIC_PRICES['claude-sonnet-4-6'];
}

export function logAnthropicCall(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  endpoint?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  const { input, output } = priceForAnthropic(args.model);
  const usd = (args.inputTokens / 1_000_000) * input + (args.outputTokens / 1_000_000) * output;
  const gbp = usd * USD_TO_GBP;
  void insertRow({
    provider: 'anthropic',
    model: args.model,
    endpoint: args.endpoint ?? null,
    user_id: args.userId ?? null,
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
    cost_gbp: gbp,
    metadata: args.metadata ?? null,
  });
}

/**
 * Cost of one Anthropic `web_search` server-tool invocation, in USD.
 * Published April 2026 at $10.00 per 1,000 searches.
 */
const WEB_SEARCH_USD_PER_CALL = 0.01;

/**
 * Log a grounded web-research call made through
 * `src/lib/research/web-research.ts`.
 *
 * Cost is token cost plus the per-search server-tool fee. A call that
 * performed no searches (the model answered from its own knowledge, or
 * the tool errored) is billed on tokens alone, which is why `searches`
 * is recorded from the response rather than assumed.
 *
 * Provider is recorded as 'anthropic' so the billing page rolls these up
 * with the rest of the Anthropic spend. The `mode: 'web-research'`
 * metadata key is what distinguishes them:
 *
 *   select * from api_cost_ledger where metadata->>'mode' = 'web-research';
 */
export function logWebResearchCall(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  searches: number;
  endpoint?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  const { input, output } = priceForAnthropic(args.model);
  const tokenUsd =
    (args.inputTokens / 1_000_000) * input + (args.outputTokens / 1_000_000) * output;
  const searchUsd = Math.max(0, args.searches) * WEB_SEARCH_USD_PER_CALL;
  const gbp = (tokenUsd + searchUsd) * USD_TO_GBP;

  // `.catch` as well as the `void`: insertRow swallows internally today,
  // but this is a floating promise resolved AFTER researchWeb has
  // returned, so a future edit that lets it reject would surface as an
  // unhandled rejection that no caller's try/catch can reach.
  void insertRow({
    provider: 'anthropic',
    model: args.model,
    endpoint: args.endpoint ?? null,
    user_id: args.userId ?? null,
    input_tokens: args.inputTokens,
    output_tokens: args.outputTokens,
    cost_gbp: gbp,
    metadata: {
      mode: 'web-research',
      searches: args.searches,
      search_cost_gbp: Number((searchUsd * USD_TO_GBP).toFixed(6)),
      ...(args.metadata || {}),
    },
  }).catch(() => {});
}

/**
 * @deprecated No call sites remain as of 2026-09-16 — all web research
 * moved to `logWebResearchCall`. Kept so historical rows keep their
 * provider label and so the migration can be reverted call site by call
 * site without a second edit here. Delete once you drop the
 * `PERPLEXITY_API_KEY` env var.
 */
export function logPerplexityCall(args: {
  model: string;
  endpoint?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  const m = args.model.toLowerCase();
  let usd = 0.005;
  if (m.includes('deep')) usd = 0.01;
  const gbp = usd * USD_TO_GBP;
  void insertRow({
    provider: 'perplexity',
    model: args.model,
    endpoint: args.endpoint ?? null,
    user_id: args.userId ?? null,
    cost_gbp: gbp,
    metadata: args.metadata ?? null,
  });
}

export function logResendCall(args: {
  count: number;
  endpoint?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}): void {
  const usd = (args.count / 1000) * 0.4;
  const gbp = usd * USD_TO_GBP;
  void insertRow({
    provider: 'resend',
    endpoint: args.endpoint ?? null,
    user_id: args.userId ?? null,
    cost_gbp: gbp,
    metadata: { count: args.count, ...(args.metadata || {}) },
  });
}
