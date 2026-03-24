import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCXOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Analyse support tickets for UX patterns
  const [recentTickets, chatbotRuns, featureUsage] = await Promise.all([
    supabase.from('support_tickets')
      .select('subject, description, category, priority, source, status, created_at')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20),
    // Chatbot conversations (from agent_runs) as proxy for confusion
    supabase.from('agent_runs')
      .select('input_data')
      .eq('agent_type', 'chatbot')
      .gte('created_at', sevenDaysAgo)
      .limit(20),
    // Feature usage patterns
    supabase.from('usage_logs')
      .select('action, count')
      .eq('year_month', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`),
  ]);

  const ticketSummary = (recentTickets.data || []).map(t =>
    `- [${t.category}/${t.priority}] ${t.subject}: ${(t.description || '').substring(0, 100)}`
  ).join('\n');

  // Feature usage summary
  const usageByAction: Record<string, number> = {};
  for (const u of featureUsage.data || []) {
    usageByAction[u.action] = (usageByAction[u.action] || 0) + (u.count || 0);
  }

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}.

## Support Tickets (Last 7 Days)
Total tickets: ${(recentTickets.data || []).length}
${ticketSummary || 'No tickets this week.'}

## Chatbot Conversations
Total chatbot sessions this week: ${(chatbotRuns.data || []).length}
(High volume may indicate UI confusion)

## Feature Usage This Month
${Object.entries(usageByAction).map(([action, count]) => `- ${action}: ${count}`).join('\n') || 'No usage data.'}

## Known UX Areas to Monitor
- Onboarding flow (0% completion rate was flagged by Charlie)
- Scanner returning no results on first scan (was fixed)
- Subscription detection from email (recently rebuilt)
- Complaint letter placeholder replacement
- Spending insights accuracy
- Page load times on some tabs

Analyse the tickets and usage data. Identify:
1. Recurring friction points (what are users complaining about most?)
2. Feature gaps (what are users asking for that we don't have?)
3. Confusion points (what questions do users ask the chatbot most?)
4. Rank improvement opportunities by potential impact on user satisfaction and retention.

Send your recommendations to Morgan (CTO) for implementation.`;

  return runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });
}
