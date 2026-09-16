/**
 * agent-server/src/lib/web-research.ts
 *
 * Standalone twin of `src/lib/research/web-research.ts`.
 *
 * WHY A COPY RATHER THAN AN IMPORT
 * --------------------------------
 * agent-server is a separate build. Its tsconfig has no `baseUrl` and no
 * `paths`, so `@/lib/...` does not resolve; and `"rootDir": "./src"`
 * means a relative import reaching up into the Next.js tree
 * (`../../../src/lib/...`) fails to compile with "is not under rootDir".
 * It also targets `module: "commonjs"` while the Next app is bundled
 * ESM, and it reads configuration from its own `config` object rather
 * than `process.env`.
 *
 * Extracting a shared workspace package is the correct long-term fix and
 * is out of scope for this change. Until then this file is a deliberate
 * duplicate of the subset agent-server actually uses: no cost ledger, no
 * JSON parse modes, injectable key. Keep the two in sync if the request
 * shape changes.
 */

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const WEB_SEARCH_TOOL_TYPE = 'web_search_20250305';
const MAX_PAUSE_RESUMES = 3;

export const DEFAULT_RESEARCH_MODEL = 'claude-sonnet-4-6';

export interface ResearchCitation {
  url: string;
  title?: string;
}

export interface AgentResearchResult {
  content: string;
  citations: ResearchCitation[];
  searches: number;
}

export class WebResearchError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'WebResearchError';
    this.status = status;
  }
}

export interface AgentResearchOptions {
  prompt: string;
  apiKey: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  maxSearches?: number;
  timeoutMs?: number;
  allowedDomains?: string[];
}

/**
 * Run a grounded web-research call. Throws `WebResearchError` on
 * transport or HTTP failure.
 */
export async function researchWeb(
  options: AgentResearchOptions,
): Promise<AgentResearchResult> {
  const {
    prompt,
    apiKey,
    system,
    model = DEFAULT_RESEARCH_MODEL,
    maxTokens = 1024,
    maxSearches = 5,
    timeoutMs = 30_000,
    allowedDomains,
  } = options;

  if (!apiKey) {
    throw new WebResearchError('ANTHROPIC_API_KEY not configured', null);
  }

  const tool: Record<string, unknown> = {
    type: WEB_SEARCH_TOOL_TYPE,
    name: 'web_search',
    max_uses: maxSearches,
  };
  if (allowedDomains && allowedDomains.length > 0) {
    tool.allowed_domains = allowedDomains;
  }

  const messages: Array<{ role: string; content: unknown }> = [
    { role: 'user', content: prompt },
  ];

  const post = async (): Promise<any> => {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages,
      tools: [tool],
    };
    if (system) body.system = system;

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
    } catch (err: any) {
      throw new WebResearchError(
        `Web research request failed: ${err?.message || String(err)}`,
        null,
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new WebResearchError(
        `Web research HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }

    return res.json();
  };

  let content = '';
  const citations: ResearchCitation[] = [];
  const seen = new Set<string>();
  let searches = 0;

  const push = (url?: string, title?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    citations.push(title ? { url, title } : { url });
  };

  const absorb = (data: any) => {
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    for (const block of blocks) {
      if (block?.type === 'text') {
        content += block.text ?? '';
        for (const c of block.citations ?? []) push(c?.url, c?.title);
      } else if (block?.type === 'web_search_tool_result') {
        // On a tool error `content` is a single object, not a list.
        const results = Array.isArray(block.content) ? block.content : [];
        for (const r of results) {
          if (r?.type === 'web_search_result') push(r.url, r.title);
        }
      }
    }
    searches += Number(data?.usage?.server_tool_use?.web_search_requests ?? 0);
  };

  // A long-running search turn can come back with stop_reason
  // 'pause_turn'. Resuming means posting the paused assistant message
  // back unchanged, encrypted_content included.
  let data = await post();
  absorb(data);

  let resumes = 0;
  while (data?.stop_reason === 'pause_turn' && resumes < MAX_PAUSE_RESUMES) {
    messages.push({ role: 'assistant', content: data.content });
    data = await post();
    absorb(data);
    resumes += 1;
  }

  return { content: content.trim(), citations, searches };
}
