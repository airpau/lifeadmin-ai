/**
 * src/lib/research/web-research.ts
 *
 * Single shared web-research client for the whole app.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until now every research call site built its own inline
 * `fetch('https://api.perplexity.ai/chat/completions')`. There were 17 of
 * them, each with a slightly different model, timeout, fence-stripping
 * regex and failure mode. When the Perplexity account hit
 * `insufficient_quota` in June 2026, three crons started returning 401 on
 * every run and nothing else in the codebase could be repointed without
 * touching all 17 files.
 *
 * This module is the one place that talks to a research provider. It is
 * backed by the Anthropic Messages API with the native `web_search`
 * server tool, which is the closest like-for-like replacement for
 * Perplexity Sonar: one HTTP round trip, a grounded answer, and real
 * citations.
 *
 * DESIGN CONSTRAINTS taken from the call sites it replaces
 * -------------------------------------------------------
 *  1. Both the RAW provider response and the PARSED content must be
 *     returned. `reverify-all-legal-refs` and `discover-legal-refs`
 *     persist the entire raw object to an audit column; the admin verify
 *     routes persist only the parsed verdict.
 *  2. Citations are load-bearing in two places (`consumer-law-news` →
 *     `consumer_law_updates.citations`, `publish-blog` →
 *     `blog_posts.topical_sources`), so they are normalised to
 *     `{ url, title? }[]` rather than passed through raw.
 *  3. `discover-legal-refs` branches on `/HTTP (401|402|429)\b/` matched
 *     against the thrown error's message. `WebResearchError.message`
 *     therefore keeps the literal `HTTP <status>` substring, and also
 *     exposes `.status` for new code that should not regex an error.
 *  4. Roughly two thirds of call sites want "return null on any failure"
 *     and one third want "throw". Hence `researchWeb` (throws) and
 *     `tryResearchWeb` (never throws).
 *  5. Parse failure is NOT a transport failure. `parsed` comes back
 *     `null` and the caller decides whether that is fatal — matching
 *     `consumer-law-news`, which throws its own error on a missing JSON
 *     array, versus `energy-tariff-monitor`, which shrugs and returns [].
 *
 * THE TRAP THIS PROVIDER HAS AND PERPLEXITY DID NOT
 * -------------------------------------------------
 * A failed SEARCH arrives inside a successful HTTP 200. The model will
 * then happily answer from parametric memory, in the requested JSON
 * shape, with no citations. Every naive port of this code returns a
 * confident ungrounded answer and persists it to a compliance table.
 *
 * So: `searchErrors` and `grounded` are first-class fields on the
 * result, `requireGrounding` turns an ungrounded answer into a thrown
 * error, and a search-side rate limit is surfaced as a 429 so that
 * existing quota-handling branches keep working. Read `grounded` before
 * you trust `parsed`.
 *
 * The provider is deliberately not named in the public API. Swapping it
 * again should be a change to this file alone.
 */

// NOTE: the cost ledger is imported LAZILY at its call site below, not
// statically here.
//
// `@/lib/cost-ledger` is an aliased specifier, and this module is in the
// import graph of `legal-refs-guardrail.ts`, whose pure-function test
// suite runs under `node --experimental-strip-types --test` — a runner
// with no path-alias resolution. A static import here makes merely
// LOADING this module fail with ERR_MODULE_NOT_FOUND under that runner,
// which takes the guardrail suite and this module's own parsing tests
// down with it. (Confirmed the hard way: it did.)
//
// Deferring it costs nothing. Cost logging is already fire-and-forget
// inside a try/catch that must never break a research call, and the
// ledger is only reachable at runtime anyway, where the alias resolves.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

/**
 * Default model. Sonnet is the right floor for the compliance work this
 * mostly serves — the legal-citation routes are asked to return null
 * rather than fabricate, and that judgement is the whole value of the
 * call. Cheap, high-volume, low-stakes callers can pass `model` to
 * downgrade to Haiku.
 *
 * Keep this in step with ANTHROPIC_PRICES in cost-ledger.ts. An unknown
 * model there silently falls back to Sonnet pricing, which quietly
 * drifts the billing page rather than failing.
 */
export const DEFAULT_RESEARCH_MODEL = 'claude-sonnet-4-6';

/**
 * Basic web search. `allowed_callers` defaults to `["direct"]` on this
 * version, so no code-execution provisioning is involved.
 *
 * `web_search_20260209` and later add dynamic filtering, which would cut
 * token cost materially on the search-heavy legal routes — but they
 * default `allowed_callers` to code execution, changing the execution
 * model as well as retrieval. Worth doing as its own change once these
 * routes are green; by then it is a one-line edit in this file, which is
 * the entire point of having this file.
 */
const WEB_SEARCH_BASIC = 'web_search_20250305';
const WEB_SEARCH_FILTERED = 'web_search_20260209';

/**
 * Which web-search tool version to use.
 *
 * `filtered` (default) uses `web_search_20260209`, where Claude writes and
 * runs code that filters search results BEFORE they enter the context
 * window. That matters because the measurement above showed ~77% of the cost
 * of a research call is input tokens from raw search results, not the search
 * fee. Filtering attacks the expensive half.
 *
 * On that version `allowed_callers` defaults to code execution, so the API
 * provisions it automatically — we deliberately do not pass the field, so a
 * future change to the default identifier cannot 400 us.
 *
 * `WEB_RESEARCH_TOOL=basic` flips back to the original direct-call tool with
 * no redeploy. This exists because dynamic filtering changes the execution
 * model, not just retrieval, and it has not been exercised against every
 * prompt in this codebase. If something starts behaving oddly, flip the env
 * var first and diagnose second.
 */
function searchToolType(): string {
  return (process.env.WEB_RESEARCH_TOOL || '').toLowerCase() === 'basic'
    ? WEB_SEARCH_BASIC
    : WEB_SEARCH_FILTERED;
}

/**
 * A 400 that names the tool, its callers, or code execution means this model
 * or account cannot do dynamic filtering. Worth one silent retry on the basic
 * tool rather than failing a compliance cron over a capability difference.
 */
function looksLikeToolCapability400(status: number | null, body: string | null): boolean {
  if (status !== 400 || !body) return false;
  return /allowed_callers|code_execution|web_search_2026|programmatic tool/i.test(body);
}

/**
 * Default ceiling on searches per call — the main spend dial.
 *
 * Perplexity Sonar did its own retrieval with no knob and charged a flat
 * $0.005. This is not that. Measured 2026-09-16 across 20 real calls:
 * ~£0.074 per call, of which only ~23% was the $10/1,000 search fee. The
 * other ~77% was INPUT TOKENS — 21,312 per call on average — because search
 * results land in the context window.
 *
 * So the lever is how much gets retrieved, not just how many searches run.
 * Three is enough for the single-question prompts here; dynamic filtering
 * (below) attacks the token half.
 */
const DEFAULT_MAX_SEARCHES = 3;

/**
 * Default timeout, per HTTP request (not per `researchWeb` call — a paused
 * turn may span several requests).
 *
 * Was 30s, carried over from Perplexity, which answered in 2-5s. That
 * assumption does not hold here: a grounded multi-search call runs the
 * searches server-side and feeds the results back through the model before
 * replying. Measured in production 2026-09-16: 25-40s is normal, and
 * consumer-law-news aborted at 31s on a call that was working fine.
 *
 * 90s with the search cap below. Callers on a tight `maxDuration` should pass
 * their own `timeoutMs` — the client cannot see the route's budget.
 */
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * How many times we will resume a turn the API paused with
 * `stop_reason: "pause_turn"`.
 *
 * The API can pause a long-running search turn and expects the paused
 * assistant message to be sent back unchanged to continue. Without this
 * the call returns whatever partial text existed at the pause, which for
 * a JSON-returning prompt is usually an unparseable fragment.
 *
 * Exhausting the budget is NOT silent: `truncated` is set on the result
 * and `requireGrounding` callers get a throw. Three resumes is well
 * beyond what a 5-search cap should ever need.
 */
const MAX_PAUSE_RESUMES = 3;

/**
 * Search-tool error codes that mean "try again later" rather than "this
 * request was malformed". Mapped onto HTTP 429 so that existing
 * quota-handling branches (see design constraint 3) keep firing — the
 * API itself reports these inside a 200.
 */
const RETRYABLE_SEARCH_ERRORS = new Set(['too_many_requests', 'unavailable']);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResearchParseMode = 'text' | 'json_object' | 'json_array';

export interface ResearchCitation {
  url: string;
  title?: string;
}

export interface ResearchResult<T = unknown> {
  /** Concatenated text of every text block, trimmed. */
  content: string;
  /**
   * Parsed payload when `parse` was 'json_object' or 'json_array'.
   * `null` if parsing was not requested, or was requested and failed.
   * A failed parse is not an error — check this field explicitly.
   */
  parsed: T | null;
  /**
   * Sources the model actually cited in its answer, de-duplicated by URL
   * in first-cited order. This is what belongs in a "sources" column.
   */
  citations: ResearchCitation[];
  /**
   * Every result the search returned, cited or not. Much larger than
   * `citations` and dominated by pages the model looked at and
   * discarded. Useful for debugging retrieval; not what you show a user.
   */
  sources: ResearchCitation[];
  /** Untouched provider response, for audit columns. */
  raw: unknown;
  /** How many web searches the provider actually performed. */
  searches: number;
  /**
   * Tool-level error codes returned INSIDE a successful HTTP response,
   * e.g. 'max_uses_exceeded', 'too_many_requests'. Non-empty means
   * retrieval partly or wholly failed even though the call "succeeded".
   */
  searchErrors: string[];
  /**
   * True when at least one search ran, none errored, and the answer
   * carries citations. False means you are looking at the model's
   * parametric memory. Do not persist an ungrounded answer to a
   * compliance table.
   */
  grounded: boolean;
  /**
   * True when the API was still pausing after MAX_PAUSE_RESUMES, so
   * `content` is an incomplete answer.
   */
  truncated: boolean;
  /** `stop_reason` of the final turn. */
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  /** Model that produced the answer, for audit rows. */
  model: string;
}

/**
 * Thrown for transport and HTTP failures, and for tool-level search
 * failures that are worth treating as a failed call. Never thrown for a
 * response that arrived but could not be parsed.
 */
export class WebResearchError extends Error {
  readonly status: number | null;
  readonly body: string | null;
  /** Set when the failure came from the search tool inside an HTTP 200. */
  readonly searchErrorCode: string | null;

  constructor(
    message: string,
    status: number | null = null,
    body: string | null = null,
    searchErrorCode: string | null = null,
  ) {
    super(message);
    this.name = 'WebResearchError';
    this.status = status;
    this.body = body;
    this.searchErrorCode = searchErrorCode;
  }

  /** Quota, auth and rate-limit failures — the "skip this run" class. */
  get isQuotaOrAuth(): boolean {
    return this.status === 401 || this.status === 402 || this.status === 429;
  }
}

export interface ResearchWebOptions {
  /** The user-turn prompt. */
  prompt: string;
  /** Optional system prompt. */
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /**
   * Cap on web searches for this call, across every turn including
   * pause-resumes. Defaults to 5.
   */
  maxSearches?: number;
  /**
   * Restrict retrieval to these domains. The legal routes already carry
   * an allowlist in their system prompt; passing it here as well turns a
   * request into a guarantee. Left unset by default so the migration is
   * behaviour-preserving — see MIGRATION.md.
   */
  allowedDomains?: string[];
  /** Never retrieve from these domains. Mutually exclusive with the above. */
  blockedDomains?: string[];
  parse?: ResearchParseMode;
  /**
   * Throw rather than return an ungrounded, truncated or search-failed
   * answer. Use this anywhere the answer will be persisted as fact —
   * every legal-reference route qualifies. Defaults to false so the
   * migration is behaviour-preserving.
   */
  requireGrounding?: boolean;
  /** Override the API key. agent-server style callers inject their own. */
  apiKey?: string;
  /** Route path recorded on the cost-ledger row. */
  endpoint?: string;
  userId?: string | null;
  costMetadata?: Record<string, unknown>;
  /** Set false to suppress the cost-ledger row. Defaults to true. */
  logCost?: boolean;
}

// ---------------------------------------------------------------------------
// Parsing helpers (exported — a few call sites parse a second time)
// ---------------------------------------------------------------------------

/**
 * Strip a leading ```json fence and a trailing ``` fence.
 *
 * Trims first: the opening `^` anchor otherwise fails on a leading
 * newline, which is common when a model prefaces the fence with a blank
 * line. (The old per-file versions of this all had that bug and got away
 * with it because they happened to be fed pre-trimmed strings.)
 */
export function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

/**
 * Find the first balanced `{...}` or `[...]` run starting at or after
 * `from`, respecting string literals and escapes.
 *
 * A regex cannot do this correctly. `/\[[\s\S]*\]/` is greedy and spans
 * from the first `[` to the LAST `]` in the whole string, and
 * `/\[[\s\S]*?\]/` is lazy and stops at the first `]`, breaking nested
 * arrays. Both were in the code this replaces, and both were survivable
 * only because Perplexity rarely emitted prose around the JSON.
 *
 * A web-search-grounded model does, constantly — markdown links like
 * `[Ofgem](https://…)` put unbalanced-looking brackets before the
 * payload. That is the failure mode this function exists to prevent.
 */
function findBalanced(text: string, open: '{' | '[', from: number): string | null {
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = from; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === close && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

/**
 * Collect every balanced candidate that parses as JSON and return the
 * LONGEST one.
 *
 * Two reasons it is not simply "the first that parses":
 *
 *  - `[Ofgem](https://ofgem.gov.uk)` is a balanced `[...]` run that is
 *    not JSON, so balance alone is not enough; we have to parse.
 *  - A markdown link whose URL itself contains brackets —
 *    `[a](https://x/[1])` — yields the candidate `[1]`, which parses
 *    perfectly well as the JSON array `[1]`. "First that parses" would
 *    return that and discard the real payload further down the string.
 *
 * The real payload is reliably the longest valid JSON run in the
 * response, so that is the tie-break. Bounded at 20 candidates so a
 * pathological response cannot turn this into a hot loop.
 */
function parseBestCandidate<T>(text: string, open: '{' | '['): T | null {
  let cursor = 0;
  let best: { value: unknown; length: number } | null = null;

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = findBalanced(text, open, cursor);
    if (!candidate) break;

    const at = text.indexOf(candidate, cursor);
    if (at < 0) break;

    try {
      const value = JSON.parse(candidate) as unknown;
      if (!best || candidate.length > best.length) {
        best = { value, length: candidate.length };
      }
      // A candidate that parsed cannot contain a longer valid run, so
      // skip past it rather than rescanning its interior.
      cursor = at + candidate.length;
    } catch {
      cursor = at + 1;
    }
  }

  return best ? (best.value as T) : null;
}

/** Extract and parse the first valid {...} block. Null on any failure. */
export function extractJsonObject<T = unknown>(text: string): T | null {
  return parseBestCandidate<T>(stripCodeFence(text), '{');
}

/**
 * Extract and parse the first valid [...] block. Null on any failure,
 * including a payload that parses but is not an array — the old
 * `energy-tariff-monitor` called `.map()` on an unchecked `JSON.parse`
 * result and would have thrown on a JSON object.
 */
export function extractJsonArray<T = unknown>(text: string): T[] | null {
  const parsed = parseBestCandidate<unknown>(stripCodeFence(text), '[');
  return Array.isArray(parsed) ? (parsed as T[]) : null;
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

interface ShapedTurn {
  content: string;
  citations: ResearchCitation[];
  sources: ResearchCitation[];
  searches: number;
  searchErrors: string[];
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * Pull one API response apart.
 *
 * `citations` and `sources` are kept separate on purpose. Search-result
 * blocks arrive BEFORE the text that cites them, and five searches can
 * contribute forty-odd URLs the model never used. Merging the two — as
 * the first draft of this file did — fills a "sources" column with pages
 * that were looked at and rejected.
 */
function shapeTurn(data: any): ShapedTurn {
  let content = '';
  const citations: ResearchCitation[] = [];
  const sources: ResearchCitation[] = [];
  const citedSeen = new Set<string>();
  const sourceSeen = new Set<string>();
  const searchErrors: string[] = [];

  // Walks blocks RECURSIVELY.
  //
  // With dynamic filtering (web_search_20260209+) the searches run from
  // inside code execution, and the server_tool_use / web_search_tool_result
  // pairs come back NESTED inside the code-execution result blocks rather
  // than at the top level of `content`. A flat loop finds the text but not
  // the search results, so `sources` comes back empty — which, for the
  // JSON-only prompts that also produce no citations, would make `grounded`
  // false on a perfectly good answer. Exactly the bug this file just fixed,
  // reintroduced by the execution-model change.
  //
  // Depth-capped because this walks untrusted provider JSON.
  const visit = (block: any, depth: number): void => {
    if (!block || typeof block !== 'object' || depth > 6) return;

    if (block.type === 'text') {
      content += block.text ?? '';
      for (const c of block.citations ?? []) {
        if (!c?.url || citedSeen.has(c.url)) continue;
        citedSeen.add(c.url);
        citations.push(c.title ? { url: c.url, title: c.title } : { url: c.url });
      }
      return;
    }

    if (block.type === 'web_search_tool_result') {
      // On a tool error `content` is a single error OBJECT, not a list.
      const inner = block.content;
      if (Array.isArray(inner)) {
        for (const r of inner) {
          if (r?.type !== 'web_search_result' || !r.url || sourceSeen.has(r.url)) continue;
          sourceSeen.add(r.url);
          sources.push(r.title ? { url: r.url, title: r.title } : { url: r.url });
        }
      } else if (inner?.type === 'web_search_tool_result_error') {
        searchErrors.push(String(inner.error_code ?? 'unknown'));
      }
      return;
    }

    // Any other block that carries nested content (code execution results,
    // future wrappers) — descend.
    if (Array.isArray(block.content)) {
      for (const child of block.content) visit(child, depth + 1);
    }
  };

  const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
  for (const block of blocks) visit(block, 0);

  return {
    content,
    citations,
    sources,
    searches: Number(data?.usage?.server_tool_use?.web_search_requests ?? 0),
    searchErrors,
    stopReason: typeof data?.stop_reason === 'string' ? data.stop_reason : null,
    usage: {
      inputTokens: Number(data?.usage?.input_tokens ?? 0),
      outputTokens: Number(data?.usage?.output_tokens ?? 0),
    },
  };
}

/**
 * Merge the turns of one logical answer (more than one only when the API
 * paused the turn).
 *
 * Text is concatenated VERBATIM, not per-turn trimmed — a pause can
 * split the output mid-token, and trimming each part would silently
 * weld `"Ofgem raised ` onto `the cap"`. Only the final result is
 * trimmed. Usage sums because a resend re-bills the whole context.
 */
function mergeTurns(turns: any[]): ShapedTurn {
  const shaped = turns.map(shapeTurn);
  if (shaped.length === 1) {
    return { ...shaped[0], content: shaped[0].content.trim() };
  }

  let content = '';
  const citations: ResearchCitation[] = [];
  const sources: ResearchCitation[] = [];
  const citedSeen = new Set<string>();
  const sourceSeen = new Set<string>();
  const searchErrors: string[] = [];
  let searches = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  for (const s of shaped) {
    content += s.content;
    for (const c of s.citations) {
      if (citedSeen.has(c.url)) continue;
      citedSeen.add(c.url);
      citations.push(c);
    }
    for (const c of s.sources) {
      if (sourceSeen.has(c.url)) continue;
      sourceSeen.add(c.url);
      sources.push(c);
    }
    searchErrors.push(...s.searchErrors);
    searches += s.searches;
    inputTokens += s.usage.inputTokens;
    outputTokens += s.usage.outputTokens;
  }

  return {
    content: content.trim(),
    citations,
    sources,
    searches,
    searchErrors,
    stopReason: shaped[shaped.length - 1].stopReason,
    usage: { inputTokens, outputTokens },
  };
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

/**
 * Run a grounded web-research call.
 *
 * Throws `WebResearchError` when the request could not be completed
 * (missing key, network failure, timeout, non-2xx), when the search tool
 * returned a retryable error, and — if `requireGrounding` is set — when
 * the answer came back ungrounded or truncated. Does NOT throw when the
 * answer arrived but could not be parsed: inspect `.parsed`.
 */
export async function researchWeb<T = unknown>(
  options: ResearchWebOptions,
): Promise<ResearchResult<T>> {
  const {
    prompt,
    system,
    model = DEFAULT_RESEARCH_MODEL,
    maxTokens = 1024,
    temperature,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxSearches = DEFAULT_MAX_SEARCHES,
    allowedDomains,
    blockedDomains,
    parse = 'text',
    requireGrounding = false,
    apiKey: apiKeyOverride,
    endpoint,
    userId = null,
    costMetadata,
    logCost = true,
  } = options;

  const apiKey =
    apiKeyOverride ||
    process.env.ANTHROPIC_RESEARCH_API_KEY ||
    process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new WebResearchError('ANTHROPIC_API_KEY not set', null);
  }

  // Sending both is a 400 upstream. Failing loudly here beats silently
  // dropping the block list, which would fail open.
  if (allowedDomains?.length && blockedDomains?.length) {
    throw new WebResearchError(
      'allowedDomains and blockedDomains are mutually exclusive',
      null,
    );
  }

  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'user', content: prompt },
  ];

  /**
   * `max_uses` is a PER-REQUEST cap. Left constant across pause-resumes
   * it would permit `maxSearches × (MAX_PAUSE_RESUMES + 1)` searches for
   * one logical call — 20 at the defaults — quietly breaking the spend
   * ceiling this option is supposed to be. So it is decremented by what
   * has already been spent.
   */
  let toolType = searchToolType();

  const post = async (remainingSearches: number): Promise<any> => {
    const tool: Record<string, unknown> = {
      type: toolType,
      name: 'web_search',
      max_uses: Math.max(1, remainingSearches),
    };
    if (allowedDomains?.length) tool.allowed_domains = allowedDomains;
    else if (blockedDomains?.length) tool.blocked_domains = blockedDomains;

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
      tools: [tool],
    };
    if (system) body.system = system;
    if (typeof temperature === 'number') body.temperature = temperature;

    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Surfaced without a status: callers testing `.isQuotaOrAuth` get
      // false, which is correct — a timeout is worth retrying next run.
      throw new WebResearchError(`Web research request failed: ${msg}`, null);
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      // The literal `HTTP <status>` substring is load-bearing: see
      // discover-legal-refs, which regexes the message for 401/402/429.
      throw new WebResearchError(
        `Web research HTTP ${res.status}: ${bodyText.slice(0, 200)}`,
        res.status,
        bodyText.slice(0, 2000),
      );
    }

    // Inside the try as well: a 200 with a truncated or non-JSON body
    // (edge/proxy interception) otherwise escapes as a bare SyntaxError,
    // and an abort firing during body read as a bare AbortError, both
    // breaking the documented `WebResearchError` contract.
    try {
      return await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new WebResearchError(`Web research response was unreadable: ${msg}`, 200);
    }
  };

  // The API may pause a long-running search turn. Resuming means sending
  // the paused assistant message back UNCHANGED — including each search
  // result's `encrypted_content`, which the API decrypts to restore the
  // results into context. Mutating or dropping it fails with a 400.
  const turns: any[] = [];
  let spentSearches = 0;

  let data;
  try {
    data = await post(maxSearches);
  } catch (err) {
    // Downgrade once, then let any second failure propagate normally.
    if (
      err instanceof WebResearchError &&
      toolType === WEB_SEARCH_FILTERED &&
      looksLikeToolCapability400(err.status, err.body)
    ) {
      console.warn(
        '[web-research] dynamic filtering unavailable, retrying on the basic search tool:',
        err.message,
      );
      toolType = WEB_SEARCH_BASIC;
      data = await post(maxSearches);
    } else {
      throw err;
    }
  }
  turns.push(data);
  spentSearches += Number(data?.usage?.server_tool_use?.web_search_requests ?? 0);

  let resumes = 0;
  while (data?.stop_reason === 'pause_turn' && resumes < MAX_PAUSE_RESUMES) {
    messages.push({ role: 'assistant', content: data.content });
    data = await post(maxSearches - spentSearches);
    turns.push(data);
    spentSearches += Number(data?.usage?.server_tool_use?.web_search_requests ?? 0);
    resumes += 1;
  }

  const shaped = mergeTurns(turns);
  const truncated = shaped.stopReason === 'pause_turn';

  // `raw` is the final turn when there was no pause (the overwhelming
  // majority, and the shape the audit columns already hold). When there
  // was, keep every turn — but strip `encrypted_content`, which is tens
  // of KB per search result and would bloat the audit column for no
  // benefit; it is only meaningful inside a live conversation.
  const raw =
    turns.length === 1
      ? turns[0]
      : { paused: true, turns: turns.map(stripEncryptedContent) };

  if (logCost) {
    try {
      const { logWebResearchCall } = await import('@/lib/cost-ledger');
      logWebResearchCall({
        model,
        inputTokens: shaped.usage.inputTokens,
        outputTokens: shaped.usage.outputTokens,
        searches: shaped.searches,
        endpoint,
        userId,
        metadata: costMetadata,
      });
    } catch {
      /* cost logging must never break a research call */
    }
  }

  // A retryable search failure arrives inside an HTTP 200. Re-raise it
  // as a 429 so existing quota branches (design constraint 3) fire, as
  // they did for Perplexity's real 429.
  const retryable = shaped.searchErrors.find((c) => RETRYABLE_SEARCH_ERRORS.has(c));
  if (retryable) {
    throw new WebResearchError(
      `Web research HTTP 429: search tool returned ${retryable}`,
      429,
      null,
      retryable,
    );
  }

  let parsed: T | null = null;
  if (parse === 'json_object') {
    parsed = extractJsonObject<T>(shaped.content);
  } else if (parse === 'json_array') {
    parsed = extractJsonArray<unknown>(shaped.content) as unknown as T | null;
  }

  // Grounded means "this answer came from retrieval", NOT "the model wrote
  // prose with citation markers in it".
  //
  // The first version required `citations.length > 0` and it was wrong.
  // Citations attach to TEXT SPANS in the model's prose. Almost every caller
  // here ends its prompt with a variant of "Return ONLY a JSON array, no
  // preamble" — so there is no prose, so there are no citation objects,
  // however well retrieval went.
  //
  // Measured in production 2026-09-16: case-law-monitor ran 4 searches with
  // zero search errors and produced a full correct answer, and
  // `requireGrounding` rejected it on citations=0. The route 500'd on a good
  // result.
  //
  // `sources` (every result retrieval actually returned) is the honest signal
  // in JSON mode. Either is sufficient. searches>0 with no errors is still
  // required, so a model answering purely from memory is still caught.
  const grounded =
    shaped.searches > 0 &&
    shaped.searchErrors.length === 0 &&
    (shaped.citations.length > 0 || shaped.sources.length > 0);

  if (requireGrounding) {
    if (truncated) {
      throw new WebResearchError(
        `Web research answer truncated: still pausing after ${MAX_PAUSE_RESUMES} resumes`,
        null,
      );
    }
    if (!grounded) {
      throw new WebResearchError(
        `Web research answer was not grounded (searches=${shaped.searches}, citations=${shaped.citations.length}, errors=[${shaped.searchErrors.join(',')}])`,
        null,
        null,
        shaped.searchErrors[0] ?? null,
      );
    }
  }

  return {
    content: shaped.content,
    parsed,
    citations: shaped.citations,
    sources: shaped.sources,
    raw,
    searches: shaped.searches,
    searchErrors: shaped.searchErrors,
    grounded,
    truncated,
    stopReason: shaped.stopReason,
    usage: shaped.usage,
    model,
  };
}

/** Drop `encrypted_content` blobs from a stored turn. */
function stripEncryptedContent(turn: any): any {
  if (!turn || !Array.isArray(turn.content)) return turn;
  return {
    ...turn,
    content: turn.content.map((block: any) => {
      if (block?.type !== 'web_search_tool_result' || !Array.isArray(block.content)) {
        return block;
      }
      return {
        ...block,
        content: block.content.map((r: any) => {
          if (!r || typeof r !== 'object') return r;
          const { encrypted_content, ...rest } = r;
          return rest;
        }),
      };
    }),
  };
}

/**
 * Same as `researchWeb` but swallows every failure and returns `null`.
 *
 * This is the shape most call sites want: they already treated a failed
 * research call as "no opinion" and carried on. `onError` is provided so
 * the ones that logged a specific message can keep doing so.
 */
export async function tryResearchWeb<T = unknown>(
  options: ResearchWebOptions & { onError?: (err: WebResearchError) => void },
): Promise<ResearchResult<T> | null> {
  const { onError, ...rest } = options;
  try {
    return await researchWeb<T>(rest);
  } catch (err) {
    const wrapped =
      err instanceof WebResearchError
        ? err
        : new WebResearchError(err instanceof Error ? err.message : String(err), null);
    try {
      onError?.(wrapped);
    } catch {
      /* ignore */
    }
    return null;
  }
}
