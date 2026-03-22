import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function runCAOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [
    totalUsers,
    newUsersToday,
    onboardedUsers,
    activeSubscriptions,
    cancelledSubscriptions,
    tasksByType,
    activeBankConnections,
    waitlistTotal,
    waitlistConverted,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).not('onboarded_at', 'is', null),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
    supabase.from('tasks').select('type'),
    supabase.from('bank_connections').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('waitlist_signups').select('id', { count: 'exact', head: true }),
    supabase.from('waitlist_signups').select('id', { count: 'exact', head: true }).eq('status', 'converted'),
  ]);

  // Task type breakdown
  const taskTypes: Record<string, number> = {};
  for (const t of tasksByType.data || []) {
    const type = t.type || 'other';
    taskTypes[type] = (taskTypes[type] || 0) + 1;
  }

  const total = totalUsers.count || 0;
  const onboarded = onboardedUsers.count || 0;
  const onboardingRate = total > 0 ? ((onboarded / total) * 100).toFixed(1) : '0';
  const waitlistConvRate = (waitlistTotal.count || 0) > 0
    ? (((waitlistConverted.count || 0) / (waitlistTotal.count || 1)) * 100).toFixed(1)
    : '0';

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}. Here is the operational data for Paybacker LTD:

## User Growth
- Total users: ${total}
- New users (last 24h): ${newUsersToday.count || 0}
- Onboarded: ${onboarded} (${onboardingRate}%)

## Feature Adoption
- Active tracked subscriptions: ${activeSubscriptions.count || 0}
- Cancelled subscriptions: ${cancelledSubscriptions.count || 0}
- Active bank connections: ${activeBankConnections.count || 0}
- Tasks by type:
${Object.entries(taskTypes).map(([type, count]) => `  - ${type}: ${count}`).join('\n') || '  - none yet'}

## Waitlist
- Total signups: ${waitlistTotal.count || 0}
- Converted: ${waitlistConverted.count || 0} (${waitlistConvRate}%)

Please analyse this data and produce your daily operations report. Flag any churn signals or areas needing attention.`;

  return runExecutiveAgent(agentConfig, contextPrompt);
}
