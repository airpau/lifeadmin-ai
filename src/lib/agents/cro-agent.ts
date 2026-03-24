import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCROAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    allProfiles, recentTasks, recentAgentRuns,
    pointsData, bankConnections,
  ] = await Promise.all([
    supabase.from('profiles').select('id, email, subscription_tier, subscription_status, created_at, updated_at, onboarded_at'),
    supabase.from('tasks').select('user_id, type, created_at').gte('created_at', thirtyDaysAgo),
    supabase.from('agent_runs').select('user_id, created_at').gte('created_at', sevenDaysAgo),
    supabase.from('user_points').select('user_id, balance, lifetime_earned, loyalty_tier'),
    supabase.from('bank_connections').select('user_id').eq('status', 'active'),
  ]);

  const users = allProfiles.data || [];
  const tasksByUser = new Map<string, number>();
  for (const t of recentTasks.data || []) {
    tasksByUser.set(t.user_id, (tasksByUser.get(t.user_id) || 0) + 1);
  }

  // Calculate activity scores
  const bankUserIds = new Set((bankConnections.data || []).map(b => b.user_id));
  const activityScores = users.map(u => {
    const tasks = tasksByUser.get(u.id) || 0;
    const hasBank = bankUserIds.has(u.id);
    const daysSinceSignup = Math.floor((now.getTime() - new Date(u.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const score = Math.min(100, tasks * 15 + (hasBank ? 25 : 0) + (u.onboarded_at ? 10 : 0));
    return { email: u.email, tier: u.subscription_tier || 'free', score, tasks, daysSinceSignup };
  });

  const atRisk = activityScores.filter(u => ['essential', 'pro'].includes(u.tier) && u.score < 20 && u.daysSinceSignup > 7);
  const active7d = activityScores.filter(u => u.tasks > 0).length;

  // Loyalty tier data
  const tierCounts: Record<string, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
  for (const p of pointsData.data || []) {
    tierCounts[p.loyalty_tier || 'bronze'] = (tierCounts[p.loyalty_tier || 'bronze'] || 0) + 1;
  }

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}.

## User Activity (Last 30 Days)
- Total users: ${users.length}
- Active in last 7 days: ${active7d}
- Average activity score: ${(activityScores.reduce((s, u) => s + u.score, 0) / Math.max(users.length, 1)).toFixed(0)}/100

## Churn Risk (Paid Users)
- At-risk users (score < 20, paid, 7+ days old): ${atRisk.length}
${atRisk.slice(0, 10).map(u => `  - ${u.email} (${u.tier}, score: ${u.score}, ${u.tasks} tasks)`).join('\n')}

## Loyalty Tiers
- Bronze: ${tierCounts.bronze}, Silver: ${tierCounts.silver}, Gold: ${tierCounts.gold}, Platinum: ${tierCounts.platinum}

## User Segments
- High activity (score 60+): ${activityScores.filter(u => u.score >= 60).length}
- Medium activity (30-59): ${activityScores.filter(u => u.score >= 30 && u.score < 60).length}
- Low activity (1-29): ${activityScores.filter(u => u.score >= 1 && u.score < 30).length}
- Zero activity: ${activityScores.filter(u => u.score === 0).length}

Analyse retention health and recommend personalised re-engagement strategies per segment.`;

  return runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });
}
