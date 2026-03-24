import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Clean up expired memories across all agents.
 * Run periodically as maintenance.
 */
export async function cleanupExpiredMemories(): Promise<number> {
  const sb = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await sb.from('agent_memory')
    .delete()
    .lt('expires_at', now)
    .not('expires_at', 'is', null)
    .select('id');

  if (error) {
    console.error('[Memory Cleanup] Error:', error.message);
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[Memory Cleanup] Removed ${count} expired memories`);
  }
  return count;
}

/**
 * Get prediction accuracy stats across all agents (for Morgan CTO's tech health report)
 */
export async function getPredictionStats(): Promise<Record<string, {
  total: number;
  correct: number;
  accuracy: number;
  pending: number;
}>> {
  const sb = getSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: predictions } = await sb.from('agent_predictions')
    .select('agent_role, was_correct')
    .gte('created_at', thirtyDaysAgo);

  const stats: Record<string, { total: number; correct: number; accuracy: number; pending: number }> = {};

  for (const p of predictions || []) {
    if (!stats[p.agent_role]) {
      stats[p.agent_role] = { total: 0, correct: 0, accuracy: 0, pending: 0 };
    }
    stats[p.agent_role].total++;
    if (p.was_correct === true) stats[p.agent_role].correct++;
    if (p.was_correct === null) stats[p.agent_role].pending++;
  }

  for (const role in stats) {
    const evaluated = stats[role].total - stats[role].pending;
    stats[role].accuracy = evaluated > 0 ? Math.round((stats[role].correct / evaluated) * 100) : 0;
  }

  return stats;
}

/**
 * Get memory counts per agent (for monitoring memory growth)
 */
export async function getMemoryStats(): Promise<Record<string, {
  total: number;
  byType: Record<string, number>;
  avgImportance: number;
}>> {
  const sb = getSupabase();

  const { data: memories } = await sb.from('agent_memory')
    .select('agent_role, memory_type, importance');

  const stats: Record<string, { total: number; byType: Record<string, number>; avgImportance: number; sumImportance: number }> = {};

  for (const m of memories || []) {
    if (!stats[m.agent_role]) {
      stats[m.agent_role] = { total: 0, byType: {}, avgImportance: 0, sumImportance: 0 };
    }
    stats[m.agent_role].total++;
    stats[m.agent_role].byType[m.memory_type] = (stats[m.agent_role].byType[m.memory_type] || 0) + 1;
    stats[m.agent_role].sumImportance += m.importance;
  }

  const result: Record<string, { total: number; byType: Record<string, number>; avgImportance: number }> = {};
  for (const role in stats) {
    result[role] = {
      total: stats[role].total,
      byType: stats[role].byType,
      avgImportance: stats[role].total > 0 ? Math.round((stats[role].sumImportance / stats[role].total) * 10) / 10 : 0,
    };
  }

  return result;
}
