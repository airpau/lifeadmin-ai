import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Check for goals that have passed their deadline and need evaluation.
 * Called as a maintenance task periodically.
 */
export async function checkOverdueGoals(): Promise<void> {
  const sb = getSupabase();
  const now = new Date().toISOString();

  const { data: overdueGoals } = await sb.from('agent_goals')
    .select('id, agent_role, title, deadline, target_value, current_value')
    .eq('status', 'active')
    .lt('deadline', now);

  if (!overdueGoals || overdueGoals.length === 0) return;

  for (const goal of overdueGoals) {
    // Auto-evaluate: if target was met, mark completed; otherwise mark failed
    const met = goal.target_value !== null && goal.current_value !== null
      && goal.current_value >= goal.target_value;

    await sb.from('agent_goals').update({
      status: met ? 'completed' : 'failed',
      outcome: met
        ? `Goal met: current value ${goal.current_value} reached target ${goal.target_value}`
        : `Goal missed: current value ${goal.current_value} did not reach target ${goal.target_value} by deadline`,
      completed_at: now,
    }).eq('id', goal.id);

    // Create a learning memory for the agent
    await sb.from('agent_memory').insert({
      agent_role: goal.agent_role,
      memory_type: 'learning',
      title: `Goal ${met ? 'achieved' : 'missed'}: ${goal.title}`,
      content: met
        ? `Successfully achieved goal "${goal.title}". Target: ${goal.target_value}, Actual: ${goal.current_value}. This approach worked.`
        : `Failed to achieve goal "${goal.title}". Target: ${goal.target_value}, Actual: ${goal.current_value}. Need to reassess strategy and set more realistic targets.`,
      importance: met ? 5 : 7, // Failures are more important to learn from
      source: 'goal_evaluation',
      source_id: goal.id,
      tags: ['goal', met ? 'success' : 'failure'],
    });

    console.log(`[Goals] ${goal.agent_role}: Goal "${goal.title}" auto-evaluated as ${met ? 'completed' : 'failed'}`);
  }
}

/**
 * Get goal statistics for all agents (for Charlie's briefing)
 */
export async function getGoalStats(): Promise<Record<string, {
  active: number;
  completed: number;
  failed: number;
}>> {
  const sb = getSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: goals } = await sb.from('agent_goals')
    .select('agent_role, status')
    .gte('created_at', thirtyDaysAgo);

  const stats: Record<string, { active: number; completed: number; failed: number }> = {};

  for (const g of goals || []) {
    if (!stats[g.agent_role]) {
      stats[g.agent_role] = { active: 0, completed: 0, failed: 0 };
    }
    if (g.status === 'active') stats[g.agent_role].active++;
    else if (g.status === 'completed') stats[g.agent_role].completed++;
    else if (g.status === 'failed') stats[g.agent_role].failed++;
  }

  return stats;
}
