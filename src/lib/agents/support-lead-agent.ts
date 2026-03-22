import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function runSupportLeadAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const [
    openTickets,
    inProgressTickets,
    resolvedTickets,
    urgentTickets,
    overdueTickets,
    allOpenTickets,
  ] = await Promise.all([
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).in('status', ['resolved', 'closed']),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('priority', 'urgent').in('status', ['open', 'in_progress']),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true })
      .is('first_response_at', null)
      .in('status', ['open'])
      .lt('created_at', oneHourAgo),
    supabase.from('support_tickets')
      .select('ticket_number, subject, priority, category, source, assigned_to, created_at, status')
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: true })
      .limit(20),
  ]);

  const ticketList = (allOpenTickets.data || []).map(t => {
    const age = Math.round((now.getTime() - new Date(t.created_at).getTime()) / (1000 * 60 * 60));
    return `- ${t.ticket_number}: "${t.subject}" [${t.priority}/${t.category}] via ${t.source} — ${age}h old — ${t.assigned_to || 'unassigned'}`;
  }).join('\n');

  const contextPrompt = `Current time: ${now.toISOString()}. Here is the support ticket status for Paybacker LTD:

## Ticket Summary
- Open: ${openTickets.count || 0}
- In Progress: ${inProgressTickets.count || 0}
- Resolved/Closed: ${resolvedTickets.count || 0}
- Urgent (active): ${urgentTickets.count || 0}
- Overdue (no response >1 hour): ${overdueTickets.count || 0}

## Active Tickets
${ticketList || 'No active tickets.'}

Please triage these tickets, suggest priority adjustments, and flag any that need immediate human attention.`;

  return runExecutiveAgent(agentConfig, contextPrompt);
}
