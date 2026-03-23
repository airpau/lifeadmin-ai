import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function runExecAssistantAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Gather data from across the entire business
  const [
    latestReports,
    openTickets,
    urgentTickets,
    humanRequiredTickets,
    oldestUnresolved,
    totalUsers,
    newUsersToday,
    tiersResult,
    expiringContracts,
    agentStatuses,
    openActionItems,
  ] = await Promise.all([
    supabase.from('executive_reports')
      .select('title, content, data, recommendations, created_at, agent_id')
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true })
      .eq('priority', 'urgent').in('status', ['open', 'in_progress']),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true })
      .eq('assigned_to', 'Human Required').in('status', ['open', 'in_progress']),
    supabase.from('support_tickets')
      .select('created_at')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: true })
      .limit(1),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
    supabase.from('profiles').select('subscription_tier'),
    supabase.from('subscriptions')
      .select('provider_name, contract_end_date, contract_type, user_id')
      .not('contract_end_date', 'is', null)
      .lte('contract_end_date', new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .gte('contract_end_date', now.toISOString().split('T')[0])
      .eq('status', 'active')
      .limit(20),
    supabase.from('ai_executives').select('name, role, status, last_run_at'),
    // Action items flagged by other agents
    supabase.from('agent_action_items')
      .select('title, description, priority, category, flagged_by, assigned_to, created_at')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  // Calculate MRR
  const tiers: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of tiersResult.data || []) {
    const tier = p.subscription_tier || 'free';
    tiers[tier] = (tiers[tier] || 0) + 1;
  }
  const mrr = tiers.essential * 9.99 + tiers.pro * 19.99;

  // Oldest unresolved ticket age
  let oldestHours = 0;
  if (oldestUnresolved.data?.[0]) {
    oldestHours = Math.round(
      (now.getTime() - new Date(oldestUnresolved.data[0].created_at).getTime()) / (1000 * 60 * 60)
    );
  }

  // Agent report summaries
  const agentReportSummaries = (latestReports.data || []).map(r => {
    const recs = Array.isArray(r.recommendations) ? r.recommendations : [];
    return `- ${r.title}: ${r.content}${recs.length > 0 ? ` | Recommendations: ${recs.join('; ')}` : ''}`;
  }).join('\n');

  // Agent statuses
  const agentStatusList = (agentStatuses.data || []).map((a: any) => {
    const lastRun = a.last_run_at
      ? `${Math.round((now.getTime() - new Date(a.last_run_at).getTime()) / (1000 * 60))}m ago`
      : 'never';
    return `- ${a.name} (${a.role}): ${a.status}, last ran ${lastRun}`;
  }).join('\n');

  // Expiring contracts
  const contractAlerts = (expiringContracts.data || []).map((c: any) =>
    `- ${c.provider_name} (${c.contract_type || 'unknown'}): ends ${c.contract_end_date}`
  ).join('\n');

  // Open action items from other agents
  const actionItemsList = (openActionItems.data || []).map((item: any) =>
    `- [${item.priority.toUpperCase()}] ${item.title} — flagged by ${item.flagged_by}, assigned to ${item.assigned_to || 'unassigned'}: ${item.description}`
  ).join('\n');

  const contextPrompt = `Current time: ${now.toISOString()}
This is your ${now.getHours() < 10 ? 'morning' : now.getHours() < 14 ? 'midday' : 'afternoon'} brief.

## Business Metrics
- MRR: £${mrr.toFixed(2)}
- Total users: ${totalUsers.count || 0}
- New users (last 24h): ${newUsersToday.count || 0}
- Tier breakdown: Free ${tiers.free}, Essential ${tiers.essential}, Pro ${tiers.pro}

## Support Tickets
- Open/in-progress: ${openTickets.count || 0}
- Urgent: ${urgentTickets.count || 0}
- Escalated to human (needs Paul): ${humanRequiredTickets.count || 0}
- Oldest unresolved: ${oldestHours} hours

## AI Agent Status
${agentStatusList || 'No agents found.'}

## Open Action Items (flagged by other agents)
${actionItemsList || 'No open action items.'}

## Recent Agent Reports (last 24h)
${agentReportSummaries || 'No reports in the last 24 hours.'}

## Contracts Expiring Within 30 Days
${contractAlerts || 'No contracts expiring soon.'}

Compile your executive brief. Include:
1. A numbered list of tasks Paul needs to action TODAY, ordered by priority
2. For each task, note which agent flagged it and why it matters
3. A summary of what each agent has been doing since the last brief
4. The business metrics snapshot
5. If there are open action items from other agents that are assigned to 'human', highlight these prominently`;

  return runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });
}
