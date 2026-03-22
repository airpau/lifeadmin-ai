import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function runCTOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalRuns,
    completedRuns,
    failedRuns,
    recentRuns,
    socialPosts,
  ] = await Promise.all([
    supabase.from('agent_runs').select('id', { count: 'exact', head: true }),
    supabase.from('agent_runs').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    supabase.from('agent_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    supabase.from('agent_runs').select('agent_type, estimated_cost, status').gte('created_at', lastWeek),
    supabase.from('social_posts').select('status'),
  ]);

  // Agent type breakdown
  const agentTypes: Record<string, { total: number; failed: number; cost: number }> = {};
  for (const run of recentRuns.data || []) {
    const type = run.agent_type || 'unknown';
    if (!agentTypes[type]) agentTypes[type] = { total: 0, failed: 0, cost: 0 };
    agentTypes[type].total++;
    if (run.status === 'failed') agentTypes[type].failed++;
    agentTypes[type].cost += parseFloat(run.estimated_cost) || 0;
  }

  const totalCost7d = (recentRuns.data || []).reduce(
    (sum, r) => sum + (parseFloat(r.estimated_cost) || 0), 0
  );
  const totalRunCount = totalRuns.count || 0;
  const avgCostPerRun = totalRunCount > 0 ? totalCost7d / (recentRuns.data || []).length : 0;

  // Social posts breakdown
  const socialStatus: Record<string, number> = {};
  for (const p of socialPosts.data || []) {
    const s = p.status || 'unknown';
    socialStatus[s] = (socialStatus[s] || 0) + 1;
  }

  const successRate = totalRunCount > 0
    ? ((completedRuns.count || 0) / totalRunCount * 100).toFixed(1)
    : '100';

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}. Here is the technical health data for Paybacker LTD:

## AI Agent Performance (All Time)
- Total agent runs: ${totalRunCount}
- Completed: ${completedRuns.count || 0}
- Failed: ${failedRuns.count || 0}
- Success rate: ${successRate}%

## Last 7 Days Agent Breakdown
${Object.entries(agentTypes).map(([type, data]) =>
  `- ${type}: ${data.total} runs, ${data.failed} failed, £${data.cost.toFixed(4)} cost`
).join('\n')}

## Cost Efficiency
- Total API cost (7 days): £${totalCost7d.toFixed(4)}
- Average cost per run: £${avgCostPerRun.toFixed(6)}

## Social Media Posts
${Object.entries(socialStatus).map(([status, count]) =>
  `- ${status}: ${count}`
).join('\n')}

Please analyse this data and produce your weekly tech health report.`;

  return runExecutiveAgent(agentConfig, contextPrompt);
}
