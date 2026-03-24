import { config } from '../config';

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

const webResearch: ToolDef = {
  name: 'web_research',
  description: 'Research a topic using Perplexity AI. Use for regulatory changes, competitor analysis, market trends, and compliance updates. Returns current, real-time information.',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Research query (be specific for better results)' },
      focus: { type: 'string', enum: ['web', 'academic', 'news'], default: 'web', description: 'Search focus area' },
    },
    required: ['query'],
  },
  handler: async (args) => {
    if (!config.PERPLEXITY_API_KEY) {
      return 'PERPLEXITY_API_KEY not configured. Cannot perform web research.';
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
          search_focus: args.focus || 'web',
        }),
      });

      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return `No results. Raw: ${JSON.stringify(data).substring(0, 500)}`;
      }

      return content;
    } catch (err: any) {
      return `Research failed: ${err.message}`;
    }
  },
};

export const researchTools: ToolDef[] = [webResearch];
