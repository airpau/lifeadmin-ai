import Anthropic from '@anthropic-ai/sdk';

// Separate API key for AI executive agents — allows tracking staff costs independently
// Falls back to the main key if ANTHROPIC_AGENTS_API_KEY is not set
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY,
});

const EXECUTIVE_MODEL = 'claude-haiku-4-5-20251001';

export interface AgentConfig {
  id: string;
  role: string;
  name: string;
  systemPrompt: string;
  config: Record<string, any>;
}

export interface AgentReport {
  title: string;
  reportType: string;
  content: string;
  data: Record<string, any>;
  recommendations: string[];
}

export async function runExecutiveAgent(
  agent: AgentConfig,
  contextPrompt: string
): Promise<AgentReport> {
  console.log(`[executive-agent] Running ${agent.name} (${agent.role})`);

  const response = await anthropic.messages.create({
    model: EXECUTIVE_MODEL,
    max_tokens: 1024,
    system: agent.systemPrompt,
    messages: [{ role: 'user', content: contextPrompt }],
  });

  const text = response.content[0];
  if (text.type !== 'text') {
    throw new Error(`Unexpected response type from Claude for ${agent.role}`);
  }

  // Track cost — Haiku: input $0.80/1M, output $4/1M
  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const cost = inputTokens * 0.0000008 + outputTokens * 0.000004;
  console.log(`[executive-agent] ${agent.name} completed — ${inputTokens} in / ${outputTokens} out — $${cost.toFixed(6)}`);

  // Parse JSON response
  let raw = text.text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // If Claude didn't return JSON, wrap the text as content
    return {
      title: `${agent.name} Report`,
      reportType: agent.role,
      content: raw,
      data: {},
      recommendations: [],
    };
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    title: parsed.title || `${agent.name} Report`,
    reportType: agent.role,
    content: parsed.summary || raw,
    data: parsed.metrics || parsed,
    recommendations: parsed.recommendations || [],
  };
}
