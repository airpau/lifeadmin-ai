import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { getFeedbackSummary } from './feedback';
import { agentRegistry } from '../agents/registry';
import { agentPrompts } from '../agents/prompts';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

/**
 * Periodically reviews agent performance and autonomously generates
 * system prompt improvements if an agent's success rate is declining.
 * Evaluated via the CAO (Jamie) Meta-Agent logic.
 */
export async function optimizePrompts(): Promise<void> {
  const sb = getSupabase();
  const MIN_EVENTS = 5;
  const TARGET_APPROVAL_RATES = 70; // If approval drops below 70%, we optimize
  
  for (const role of Object.keys(agentRegistry)) {
    try {
      const summary = await getFeedbackSummary(role);
      
      if (summary.totalEvents < MIN_EVENTS || summary.approvalRate >= TARGET_APPROVAL_RATES) {
        continue;
      }
      
      console.log(`[Meta-Agent] ${role} has ${summary.approvalRate}% approval. Generating prompt fix...`);
      
      const currentPrompt = agentPrompts[role];
      if (!currentPrompt) continue;
      
      const promptRevisionPrompt = `
You are the CAO meta-agent of Paybacker. Your job is to debug other agents.
Agent ${role} is performing poorly with an approval rate of ${summary.approvalRate}%.

Recent rejections from the founder:
${summary.recentRejections.map((r, i) => \`${i + 1}. ${r}\`).join('\n')}

Current System Instructions:
\`\`\`
${currentPrompt}
\`\`\`

Based on the feedback, what is the behavioral drift? Rewrite the system prompt to structurally correct these errors.
Return ONLY a valid JSON object with the following schema:
{
  "rationale": "Why it was failing and how you fixed it",
  "improved_prompt": "The complete rewritten prompt string"
}`;

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: promptRevisionPrompt }]
      });

      const content = message.content[0];
      let proposalData = null;
      if (content.type === 'text') {
        const raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) proposalData = JSON.parse(match[0]);
      }

      if (proposalData && proposalData.improved_prompt) {
        await sb.from('improvement_proposals').insert({
          title: `[Self-Learning] Rewrite ${agentRegistry[role].name} System Prompt`,
          description: `**Reason:** Agent's success metrics dropped to ${summary.approvalRate}%.\n\n**Meta-Agent Rationale:** ${proposalData.rationale}\n\n**Proposed Code Change:** Update \`agentPrompts.${role}\` in \`prompts.ts\` with the new instructions.`,
          category: 'accuracy',
          estimated_impact: 'high',
          status: 'proposed',
          source: 'meta_agent_optimizer',
        });
        
        console.log(`[Meta-Agent] Inserted prompt improvement proposal for ${role}`);
      }
    } catch (e: any) {
      console.error(`[Meta-Agent] Error optimizing prompt for ${role}:`, e.message);
    }
  }
}
