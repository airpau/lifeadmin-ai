import { query } from '@anthropic-ai/claude-agent-sdk';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import { agentRegistry } from './registry';
import { agentPrompts } from './prompts';
import { buildToolServer, getAllowedToolNames } from '../tools';
import { createSafetyHooks } from './safety';
import { AgentRunContext } from '../types';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Load pre-run context for an agent: memories, tasks, feedback, goals, predictions
 */
async function loadAgentContext(role: string): Promise<AgentRunContext> {
  const sb = getSupabase();
  const now = new Date().toISOString();

  const [memoriesRes, tasksRes, feedbackRes, goalsRes, predictionsRes, accuracyRes] = await Promise.all([
    // Top 10 memories by importance
    sb.from('agent_memory')
      .select('id, agent_role, memory_type, title, content, importance, access_count, created_at')
      .eq('agent_role', role)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),

    // Pending tasks assigned to this agent
    sb.from('agent_tasks')
      .select('id, created_by, assigned_to, title, description, priority, category, status, notes, created_at, due_by')
      .eq('assigned_to', role)
      .in('status', ['pending', 'in_progress'])
      .order('priority', { ascending: true })
      .limit(5),

    // Unprocessed feedback
    sb.from('agent_feedback_events')
      .select('id, agent_role, event_type, source, feedback_content, impact_score, created_at')
      .eq('agent_role', role)
      .eq('processed', false)
      .order('created_at', { ascending: false })
      .limit(5),

    // Active goals
    sb.from('agent_goals')
      .select('id, agent_role, title, success_criteria, metric_name, target_value, current_value, baseline_value, status, progress_notes, deadline, created_at')
      .eq('agent_role', role)
      .eq('status', 'active')
      .limit(5),

    // Predictions due for evaluation
    sb.from('agent_predictions')
      .select('id, agent_role, prediction, confidence, reasoning, evaluation_date, created_at')
      .eq('agent_role', role)
      .is('was_correct', null)
      .lte('evaluation_date', now)
      .limit(5),

    // Prediction accuracy (last 30 days)
    sb.from('agent_predictions')
      .select('was_correct')
      .eq('agent_role', role)
      .not('was_correct', 'is', null)
      .gte('evaluated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  // Calculate accuracy
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
  };
}

/**
 * Build the run message with pre-loaded context
 */
function buildRunMessage(role: string, context: AgentRunContext): string {
  const now = new Date();
  const parts: string[] = [
    `It is ${now.toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. This is your scheduled run.`,
    '',
  ];

  // Memories
  if (context.memories.length > 0) {
    parts.push('## Your Memories');
    for (const m of context.memories) {
      parts.push(`- [${m.memory_type}, importance: ${m.importance}] ${m.title}: ${m.content}`);
    }
    parts.push('');
  }

  // Feedback
  if (context.recentFeedback.length > 0) {
    parts.push('## Unprocessed Founder Feedback');
    for (const f of context.recentFeedback) {
      parts.push(`- [${f.event_type}] ${f.feedback_content || 'No details'} (${f.created_at})`);
    }
    parts.push('After incorporating feedback, use mark_feedback_processed to acknowledge it.');
    parts.push('');
  }

  // Goals
  if (context.activeGoals.length > 0) {
    parts.push('## Your Active Goals');
    for (const g of context.activeGoals) {
      const deadline = new Date(g.deadline);
      const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      parts.push(`- ${g.title} (deadline: ${daysLeft} days, target: ${g.target_value || 'N/A'}, current: ${g.current_value || 'N/A'})`);
    }
    parts.push('');
  }

  // Predictions due
  if (context.pendingPredictions.length > 0) {
    parts.push('## Predictions Due for Evaluation');
    for (const p of context.pendingPredictions) {
      parts.push(`- [confidence: ${p.confidence}/10] "${p.prediction}" (made: ${p.created_at})`);
    }
    parts.push('Use evaluate_prediction for each one after checking current data.');
    parts.push('');
  }

  // Prediction accuracy
  if (context.predictionAccuracy !== null) {
    parts.push(`## Your Prediction Track Record`);
    parts.push(`Accuracy over the last 30 days: ${context.predictionAccuracy}%`);
    if (context.predictionAccuracy < 50) {
      parts.push('Your predictions have been below 50% accurate. Be more conservative and data-driven.');
    } else if (context.predictionAccuracy > 80) {
      parts.push('Strong prediction accuracy. You can be more confident in your forecasts.');
    }
    parts.push('');
  }

  // Pending tasks
  if (context.pendingTasks.length > 0) {
    parts.push('## Tasks Assigned to You');
    for (const t of context.pendingTasks) {
      parts.push(`- [${t.priority}] from ${t.created_by}: "${t.title}" - ${t.description}`);
    }
    parts.push('Process these tasks using your tools, then use complete_task when done.');
    parts.push('');
  }

  parts.push('Now investigate the business using your tools, process any tasks, and generate your report.');

  return parts.join('\n');
}

/**
 * Run a single agent using the Claude Agent SDK
 */
export async function runAgent(role: string): Promise<{ success: boolean; error?: string; cost?: number }> {
  const agentDef = agentRegistry[role];
  if (!agentDef) {
    return { success: false, error: `Unknown agent role: ${role}` };
  }

  const systemPrompt = agentPrompts[role];
  if (!systemPrompt) {
    return { success: false, error: `No system prompt for role: ${role}` };
  }

  console.log(`[${agentDef.name}] Starting scheduled run...`);

  try {
    // Load pre-run context
    const context = await loadAgentContext(role);

    // Build the run message
    const runMessage = buildRunMessage(role, context);

    // Build tool server with agent's permitted tools
    const toolServer = buildToolServer(role, agentDef.toolGroups, {
      supabaseWriteTables: agentDef.supabaseWriteTables,
      canEmailUsers: agentDef.canEmailUsers,
    });

    // Create safety hooks
    const runId = crypto.randomUUID();
    const safetyHooks = createSafetyHooks(agentDef, runId);

    // Run the agent
    let totalCost = 0;
    let resultText = '';

    for await (const message of query({
      prompt: runMessage,
      options: {
        systemPrompt,
        model: agentDef.model,
        maxTurns: agentDef.maxTurns,
        maxBudgetUsd: agentDef.maxBudgetUsd,
        mcpServers: { [`paybacker-${role}`]: toolServer },
        allowedTools: [`mcp__paybacker-${role}__*`],
        permissionMode: 'bypassPermissions',
        hooks: {
          PreToolUse: safetyHooks.preToolUse,
          PostToolUse: safetyHooks.postToolUse,
        },
      },
    })) {
      if (message.type === 'result') {
        totalCost = (message as any).total_cost_usd || 0;
        if ((message as any).subtype === 'success') {
          resultText = (message as any).result || '';
        } else {
          console.error(`[${agentDef.name}] Run ended with: ${(message as any).subtype}`);
        }
      }
    }

    // Update last_run_at
    const sb = getSupabase();
    await sb.from('ai_executives')
      .update({ last_run_at: new Date().toISOString() })
      .eq('role', role);

    console.log(`[${agentDef.name}] Run complete. Cost: $${totalCost.toFixed(4)}`);
    return { success: true, cost: totalCost };

  } catch (err: any) {
    console.error(`[${agentDef.name}] Run failed:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Run an agent for a meeting (interactive mode)
 * Returns the agent's response to a specific message
 */
export async function runAgentForMeeting(
  role: string,
  message: string,
  meetingHistory: Array<{ role: string; content: string; agent?: string }>
): Promise<string> {
  const agentDef = agentRegistry[role];
  if (!agentDef) return `Unknown agent: ${role}`;

  const systemPrompt = agentPrompts[role] + `\n\nYou are in a live meeting with the founder. Respond concisely and directly to their message. You have access to your tools to look up data if needed.`;

  const toolServer = buildToolServer(role, agentDef.toolGroups, {
    supabaseWriteTables: agentDef.supabaseWriteTables,
    canEmailUsers: agentDef.canEmailUsers,
  });

  const runId = crypto.randomUUID();
  const safetyHooks = createSafetyHooks(agentDef, runId);

  // Build conversation context
  const historyContext = meetingHistory.length > 0
    ? `Previous messages in this meeting:\n${meetingHistory.map(m => `${m.agent || 'Founder'}: ${m.content}`).join('\n')}\n\n`
    : '';

  let resultText = '';

  try {
    for await (const msg of query({
      prompt: `${historyContext}Founder says: "${message}"\n\nRespond as ${agentDef.name}. Be concise (2-4 sentences unless detail is requested). Use your tools if you need to look up data.`,
      options: {
        systemPrompt,
        model: 'claude-haiku-4-5-20251001', // Always Haiku for meetings (cost control)
        maxTurns: 5,
        maxBudgetUsd: 0.05,
        mcpServers: { [`paybacker-${role}`]: toolServer },
        allowedTools: [`mcp__paybacker-${role}__*`],
        permissionMode: 'bypassPermissions',
        hooks: {
          PreToolUse: safetyHooks.preToolUse,
          PostToolUse: safetyHooks.postToolUse,
        },
      },
    })) {
      if (msg.type === 'result' && (msg as any).subtype === 'success') {
        resultText = (msg as any).result || '';
      }
    }
  } catch (err: any) {
    resultText = `Sorry, I encountered an error: ${err.message}`;
  }

  return resultText || 'No response generated.';
}
