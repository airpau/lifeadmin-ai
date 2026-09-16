import { config } from '../config';
import { researchWeb } from '../lib/web-research';

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

/**
 * `focus` used to be passed to the provider as `search_focus`, which is
 * not a field on the research API and was silently ignored — so the
 * 'web' | 'academic' | 'news' option in the schema below never did
 * anything. Rather than drop it from the schema (and break any agent
 * prompt that already sends it), it is now folded into the prompt text,
 * where it actually steers retrieval.
 */
const FOCUS_HINTS: Record<string, string> = {
  academic: 'Focus on academic, peer-reviewed and official research sources.',
  news: 'Focus on recent news coverage and dated reporting.',
};

const webResearch: ToolDef = {
  name: 'web_research',
  description: 'Research a topic using live web search. Use for regulatory changes, competitor analysis, market trends, and compliance updates. Returns current, real-time information.',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Research query (be specific for better results)' },
      focus: { type: 'string', enum: ['web', 'academic', 'news'], default: 'web', description: 'Search focus area' },
    },
    required: ['query'],
  },
  handler: async (args: any) => {
    if (!config.ANTHROPIC_API_KEY) {
      return 'ANTHROPIC_API_KEY not configured. Cannot perform web research.';
    }

    const focus = typeof args.focus === 'string' ? args.focus : 'web';
    const hint = FOCUS_HINTS[focus];
    const prompt = hint ? `${args.query}\n\n${hint}` : String(args.query ?? '');

    try {
      // researchWeb throws on a non-2xx. That is the point: the old
      // handler had no res.ok check, so a 401 fell through to the
      // "no content" branch and leaked up to 500 characters of raw
      // error body into the agent transcript.
      const res = await researchWeb({
        prompt,
        apiKey: config.ANTHROPIC_API_KEY,
        system: 'You are a research assistant focused on UK consumer finance, regulations, and fintech. Provide concise, factual answers with sources.',
        maxTokens: 1024,
      });

      if (!res.content) return 'No results.';

      const sources = res.citations.length
        ? `\n\nSources:\n${res.citations.map((c) => `- ${c.title ? `${c.title} — ` : ''}${c.url}`).join('\n')}`
        : '';

      return res.content + sources;
    } catch (err: any) {
      return `Research failed: ${err.message}`;
    }
  },
};

export const researchTools: ToolDef[] = [webResearch];
