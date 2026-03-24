import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCGOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalUsers, newUsers7d, tiersResult,
    inactiveNewUsers, usageData, recentTasks,
    bankConnections,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('profiles').select('subscription_tier, subscription_status, email, created_at, updated_at'),
    // Users who signed up 48+ hours ago but haven't generated a letter or connected bank
    supabase.from('profiles').select('email, created_at, subscription_tier')
      .lte('created_at', twoDaysAgo)
      .is('onboarded_at', null),
    // Usage data for upgrade nudges
    supabase.from('usage_logs').select('user_id, action, count, year_month')
      .eq('action', 'complaint_generated')
      .eq('year_month', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`),
    // Recent task activity
    supabase.from('tasks').select('user_id, created_at').gte('created_at', fourteenDaysAgo),
    supabase.from('bank_connections').select('user_id', { count: 'exact', head: true }).eq('status', 'active'),
  ]);

  const tiers: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  const allUsers = tiersResult.data || [];
  for (const p of allUsers) tiers[p.subscription_tier || 'free']++;

  // Find users near 3-letter limit (free tier, 2 letters used)
  const upgradeTargets = (usageData.data || [])
    .filter(u => u.count >= 2)
    .map(u => ({ user_id: u.user_id, letters_used: u.count }));

  // Find paid users inactive 14+ days
  const activeUserIds = new Set((recentTasks.data || []).map(t => t.user_id));
  const inactivePaid = allUsers
    .filter(u => ['essential', 'pro'].includes(u.subscription_tier || '') && !activeUserIds.has(u.email))
    .slice(0, 10);

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}.

## Funnel Metrics
- Total users: ${totalUsers.count || 0}
- New signups (7 days): ${newUsers7d.count || 0}
- Free: ${tiers.free}, Essential: ${tiers.essential}, Pro: ${tiers.pro}
- Free-to-paid conversion: ${(totalUsers.count || 0) > 0 ? (((tiers.essential + tiers.pro) / (totalUsers.count || 1)) * 100).toFixed(1) : 0}%
- Bank connections: ${bankConnections.count || 0}

## Activation Issues
- Users signed up 48+ hours ago without onboarding: ${(inactiveNewUsers.data || []).length}
${(inactiveNewUsers.data || []).slice(0, 5).map(u => `  - ${u.email} (signed up ${u.created_at?.substring(0, 10)})`).join('\n')}

## Upgrade Opportunities
- Free users with 2+ letters this month: ${upgradeTargets.length}

## Churn Risk
- Paid users with no activity in 14+ days: ${inactivePaid.length}
${inactivePaid.slice(0, 5).map(u => `  - ${u.email} (${u.subscription_tier})`).join('\n')}

Analyse this data and produce your growth report. Recommend specific email sequences to trigger.`;

  return runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });
}
