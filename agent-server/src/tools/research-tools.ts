import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { config } from '../config';

export const webResearch = tool(
  'web_research',
  'Research a topic using Perplexity AI. Use for regulatory changes, competitor analysis, market trends, and compliance updates. Returns current, real-time information.',
  {
    query: z.string().describe('Research query (be specific for better results)'),
    focus: z.enum(['web', 'academic', 'news']).default('web').describe('Search focus area'),
  },
  async (args) => {
    if (!config.PERPLEXITY_API_KEY) {
      return { content: [{ type: 'text' as const, text: 'PERPLEXITY_API_KEY not configured. Cannot perform web research.' }], isError: true };
    }

    try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.PERPLEXITY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'sonar',
          messages: [
            { role: 'system', content: 'You are a research assistant focused on UK consumer finance, regulations, and fintech. Provide concise, factual answers with sources.' },
            { role: 'user', content: args.query },
          ],
          search_focus: args.focus,
        }),
      });

      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return { content: [{ type: 'text' as const, text: `No results. Raw: ${JSON.stringify(data).substring(0, 500)}` }], isError: true };
      }

      return { content: [{ type: 'text' as const, text: content }] };
    } catch (err: any) {
      return { content: [{ type: 'text' as const, text: `Research failed: ${err.message}` }], isError: true };
    }
  },
  { annotations: { readOnlyHint: true, openWorldHint: true } }
);

export const researchTools = [webResearch];
