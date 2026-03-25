import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { agentRegistry } from './registry';
import { agentPrompts } from './prompts';
import { createSafetyChecker } from './safety';
import { getToolsForAgent } from '../tools';
import { AgentRunContext } from '../types';

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Build tool definitions for the Anthropic API from an agent's permitted tool groups
 */
function buildTools(role: string): { tools: Anthropic.Tool[]; handlers: Record<string, (args: any, agentRole: string) => Promise<string>> } {
  const agentDef = agentRegistry[role];
  if (!agentDef) return { tools: [], handlers: {} };

  const toolDefs = getToolsForAgent(role, agentDef.toolGroups, {
    supabaseWriteTables: agentDef.supabaseWriteTables,
    canEmailUsers: agentDef.canEmailUsers,
  });

  const tools: Anthropic.Tool[] = [];
  const handlers: Record<string, (args: any, agentRole: string) => Promise<string>> = {};

  for (const td of toolDefs) {
    tools.push({
      name: td.name,
      description: td.description,
      input_schema: td.schema as Anthropic.Tool.InputSchema,
    });
    handlers[td.name] = td.handler;
  }

  return { tools, handlers };
}

/**
 * Load pre-run context for an agent
 */
async function loadAgentContext(role: string): Promise<AgentRunContext> {
  const sb = getSupabase();
  const now = new Date().toISOString();

  const [memoriesRes, tasksRes, feedbackRes, goalsRes, predictionsRes, accuracyRes, businessLogRes] = await Promise.all([
    sb.from('agent_memory')
      .select('id, agent_role, memory_type, title, content, importance, access_count, created_at')
      .eq('agent_role', role)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    sb.from('agent_tasks')
      .select('id, created_by, assigned_to, title, description, priority, category, status, notes, created_at, due_by')
      .eq('assigned_to', role)
      .in('status', ['pending', 'in_progress'])
      .order('created_at', { ascending: true })
      .limit(5),
    sb.from('agent_feedback_events')
      .select('id, agent_role, event_type, source, feedback_content, impact_score, created_at')
      .eq('agent_role', role)
      .eq('processed', false)
      .order('created_at', { ascending: false })
      .limit(5),
    sb.from('agent_goals')
      .select('id, agent_role, title, success_criteria, metric_name, target_value, current_value, baseline_value, status, progress_notes, deadline, created_at')
      .eq('agent_role', role)
      .eq('status', 'active')
      .limit(5),
    sb.from('agent_predictions')
      .select('id, agent_role, prediction, confidence, reasoning, evaluation_date, created_at')
      .eq('agent_role', role)
      .is('was_correct', null)
      .lte('evaluation_date', now)
      .limit(5),
    sb.from('agent_predictions')
      .select('was_correct')
      .eq('agent_role', role)
      .not('was_correct', 'is', null)
      .gte('evaluated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    sb.from('business_log')
      .select('category, title, content, created_by, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const evaluated = accuracyRes.data || [];
  const predictionAccuracy = evaluated.length > 0
    ? Math.round((evaluated.filter(p => p.was_correct).length / evaluated.length) * 100)
    : null;

  return {
    memories: memoriesRes.data || [],
    pendingTasks: tasksRes.data || [],
    recentFeedback: feedbackRes.data || [],
    activeGoals: goalsRes.data || [],
    pendingPredictions: predictionsRes.data || [],
    predictionAccuracy,
    businessLog: businessLogRes.data || [],
  };
}

/**
 * Build the run message with pre-loaded context
 */
function buildRunMessage(role: string, context: AgentRunContext): string {
  const now = new Date();
  const parts: string[] = [
    `It is ${now.toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}. This is your scheduled run.`,
    '',
  ];

  if (context.memories.length > 0) {
    parts.push('## Your Memories');
    for (const m of context.memories) {
      parts.push(`- [${m.memory_type}, importance: ${m.importance}] ${m.title}: ${m.content}`);
    }
    parts.push('');
  }

  if (context.recentFeedback.length > 0) {
    parts.push('## Unprocessed Founder Feedback');
    for (const f of context.recentFeedback) {
      parts.push(`- [${f.event_type}] ${f.feedback_content || 'No details'} (${f.created_at})`);
    }
    parts.push('After incorporating feedback, use mark_feedback_processed to acknowledge it.');
    parts.push('');
  }

  if (context.activeGoals.length > 0) {
    parts.push('## Your Active Goals');
    for (const g of context.activeGoals) {
      const deadline = new Date(g.deadline);
      const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      parts.push(`- ${g.title} (deadline: ${daysLeft} days, target: ${g.target_value || 'N/A'}, current: ${g.current_value || 'N/A'})`);
    }
    parts.push('');
  }

  if (context.pendingPredictions.length > 0) {
    parts.push('## Predictions Due for Evaluation');
    for (const p of context.pendingPredictions) {
      parts.push(`- [confidence: ${p.confidence}/10] "${p.prediction}" (made: ${p.created_at})`);
    }
    parts.push('Use evaluate_prediction for each one after checking current data.');
    parts.push('');
  }

  if (context.predictionAccuracy !== null) {
    parts.push(`## Your Prediction Track Record`);
    parts.push(`Accuracy over the last 30 days: ${context.predictionAccuracy}%`);
    parts.push('');
  }

  if (context.pendingTasks.length > 0) {
    parts.push('## Tasks Assigned to You');
    for (const t of context.pendingTasks) {
      parts.push(`- [${t.priority}] from ${t.created_by}: "${t.title}" - ${t.description}`);
    }
    parts.push('Process these tasks using your tools, then use complete_task when done.');
    parts.push('');
  }

  if (context.businessLog && context.businessLog.length > 0) {
    parts.push('## Business Log (LATEST UPDATES - prioritise this over old memories)');
    for (const l of context.businessLog) {
      parts.push(`- [${l.category}] ${l.title}: ${l.content}`);
    }
    parts.push('');
  }

  parts.push('Now investigate the business using your tools, process any tasks, and generate your report. Use save_report to save your findings.');

  return parts.join('\n');
}

/**
 * Run a single agent using the Anthropic API with tool use (agentic loop)
 */
export async function runAgent(role: string): Promise<{ success: boolean; error?: string; cost?: number }> {
  const agentDef = agentRegistry[role];
  if (!agentDef) return { success: false, error: `Unknown agent role: ${role}` };

  const systemPrompt = agentPrompts[role];
  if (!systemPrompt) return { success: false, error: `No system prompt for role: ${role}` };

  console.log(`[${agentDef.name}] Starting scheduled run...`);

  try {
    const context = await loadAgentContext(role);
    const runMessage = buildRunMessage(role, context);
    const { tools, handlers } = buildTools(role);

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: runMessage },
    ];

    let totalCost = 0;
    let turns = 0;
    const maxTurns = agentDef.maxTurns;
    const runId = crypto.randomUUID();
    const sb = getSupabase();
    const safety = createSafetyChecker(agentDef, runId);

    // Agentic loop: keep calling Claude until it stops using tools
    while (turns < maxTurns) {
      turns++;

      const response = await anthropic.messages.create({
        model: agentDef.model,
        max_tokens: 4096,
        system: systemPrompt,
        tools: tools as any,
        messages,
      });

      // Track cost
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const isHaiku = agentDef.model.includes('haiku');
      totalCost += isHaiku
        ? (inputTokens * 0.8 + outputTokens * 4) / 1_000_000
        : (inputTokens * 3 + outputTokens * 15) / 1_000_000;

      // Check budget
      if (totalCost > agentDef.maxBudgetUsd) {
        console.log(`[${agentDef.name}] Budget exceeded ($${totalCost.toFixed(4)} > $${agentDef.maxBudgetUsd}). Stopping.`);
        break;
      }

      // If Claude wants to use tools, execute them
      if (response.stop_reason === 'tool_use') {
        const assistantContent = response.content;
        messages.push({ role: 'assistant', content: assistantContent });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of assistantContent) {
          if (block.type === 'tool_use') {
            const handler = handlers[block.name];
            let result: string;

            if (handler) {
              try {
                // Safety check
                const check = await safety.checkPreToolUse(block.name, block.input as Record<string, any>);
                if (!check.allowed) {
                  result = `Blocked: ${check.reason}`;
                } else {
                  result = await handler(block.input as any, role);
                }
                // Audit log
                await safety.auditToolCall(block.name, block.input, result);
              } catch (err: any) {
                result = `Tool error: ${err.message}`;
              }
            } else {
              result = `Unknown tool: ${block.name}`;
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        messages.push({ role: 'user', content: toolResults });
      } else {
        // Claude is done (end_turn or max_tokens)
        break;
      }
    }

    // Update last_run_at
    await sb.from('ai_executives')
      .update({ last_run_at: new Date().toISOString() })
      .eq('role', role);

    console.log(`[${agentDef.name}] Run complete. ${turns} turns, cost: $${totalCost.toFixed(4)}`);
    return { success: true, cost: totalCost };

  } catch (err: any) {
    console.error(`[${agentDef.name}] Run failed:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Run an agent for a meeting (interactive mode)
 */
export async function runAgentForMeeting(
  role: string,
  message: string,
  meetingHistory: Array<{ role: string; content: string; agent?: string }>
): Promise<string> {
  const agentDef = agentRegistry[role];
  if (!agentDef) return `Unknown agent: ${role}`;

  const systemPrompt = (agentPrompts[role] || '') + `\n\nYou are in a live meeting with the founder. Respond concisely and directly. You have access to your tools to look up data if needed.`;
  const { tools, handlers } = buildTools(role);

  const historyContext = meetingHistory.length > 0
    ? `Previous messages in this meeting:\n${meetingHistory.map(m => `${m.agent || 'Founder'}: ${m.content}`).join('\n')}\n\n`
    : '';

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `${historyContext}Founder says: "${message}"\n\nRespond as ${agentDef.name}. Be concise (2-4 sentences unless detail is requested).` },
  ];

  try {
    // Allow up to 3 tool calls in meetings
    for (let turn = 0; turn < 3; turn++) {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: tools as any,
        messages,
      });

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === 'tool_use') {
            const handler = handlers[block.name];
            let result = 'Unknown tool';
            if (handler) {
              try { result = await handler(block.input as any, role); } catch (e: any) { result = `Error: ${e.message}`; }
            }
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          }
        }
        messages.push({ role: 'user', content: toolResults });
      } else {
        // Extract text response
        const textBlock = response.content.find(b => b.type === 'text');
        return textBlock ? (textBlock as any).text : 'No response generated.';
      }
    }

    return 'Meeting response limit reached.';
  } catch (err: any) {
    return `Sorry, I encountered an error: ${err.message}`;
  }
}
