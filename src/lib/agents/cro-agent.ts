import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCROAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [allProfiles, recentTasks, bankConns, pointsData] = await Promise.all([
    supabase.from('profiles').select('id, email, subscription_tier, created_at, onboarded_at, activity_score'),
    supabase.from('tasks').select('user_id, type, created_at').gte('created_at', thirtyDaysAgo),
    supabase.from('bank_connections').select('user_id').eq('status', 'active'),
    supabase.from('user_points').select('user_id, balance, lifetime_earned, loyalty_tier'),
  ]);

  const users = allProfiles.data || [];
  const tasksByUser = new Map<string, number>();
  const featuresByUser = new Map<string, Set<string>>();
  for (const t of recentTasks.data || []) {
    tasksByUser.set(t.user_id, (tasksByUser.get(t.user_id) || 0) + 1);
    if (!featuresByUser.has(t.user_id)) featuresByUser.set(t.user_id, new Set());
    featuresByUser.get(t.user_id)!.add(t.type);
  }
  const bankUserIds = new Set((bankConns.data || []).map(b => b.user_id));

  // Calculate and update activity scores
  let churnRiskCount = 0;
  for (const user of users) {
    const daysSinceSignup = Math.floor((now.getTime() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const tasks = tasksByUser.get(user.id) || 0;
    const features = featuresByUser.get(user.id)?.size || 0;
    const hasBank = bankUserIds.has(user.id);

    const score = Math.max(0, Math.min(100,
      (tasks * 5) + (features * 3) + (hasBank ? 10 : 0) + (user.onboarded_at ? 10 : 0) - (Math.max(0, daysSinceSignup - tasks) * 2)
    ));

    const isChurnRisk = score < 10 && ['essential', 'pro'].includes(user.subscription_tier || '');
    if (isChurnRisk) churnRiskCount++;

    await supabase.from('profiles').update({ activity_score: score, churn_risk: isChurnRisk }).eq('id', user.id);
  }

  const tierCounts: Record<string, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0 };
  for (const p of pointsData.data || []) tierCounts[p.loyalty_tier || 'bronze']++;

  const activeUsers = users.filter(u => (tasksByUser.get(u.id) || 0) > 0).length;

  const contextPrompt = `Today: ${now.toISOString().split('T')[0]}.

## Retention Metrics
- Total: ${users.length}, Active (30d): ${activeUsers}, Churn risk: ${churnRiskCount}
- Loyalty: Bronze ${tierCounts.bronze}, Silver ${tierCounts.silver}, Gold ${tierCounts.gold}, Platinum ${tierCounts.platinum}
- Segments: Score 60+: ${users.filter(u => (u.activity_score || 0) >= 60).length}, 30-59: ${users.filter(u => (u.activity_score || 0) >= 30 && (u.activity_score || 0) < 60).length}, <30: ${users.filter(u => (u.activity_score || 0) < 30).length}

Activity scores updated for all users. Analyse retention health and recommend re-engagement strategies.`;

  return runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });
}
