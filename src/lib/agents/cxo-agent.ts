import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';
import { resend, FROM_EMAIL } from '@/lib/resend';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCXOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [tickets, chatbotRuns, usageLogs] = await Promise.all([
    supabase.from('support_tickets')
      .select('subject, description, category, priority, source, created_at')
      .gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(20),
    supabase.from('agent_runs').select('input_data')
      .eq('agent_type', 'chatbot').gte('created_at', sevenDaysAgo).limit(20),
    supabase.from('usage_logs').select('action, count').eq('year_month', yearMonth),
  ]);

  const ticketSummary = (tickets.data || []).map(t =>
    `[${t.category}/${t.priority}] ${t.subject}: ${(t.description || '').substring(0, 80)}`
  ).join('\n');

  const usageByAction: Record<string, number> = {};
  for (const u of usageLogs.data || []) usageByAction[u.action] = (usageByAction[u.action] || 0) + (u.count || 0);

  const contextPrompt = `Today: ${now.toISOString().split('T')[0]}.

## Support Tickets (7 days): ${(tickets.data || []).length}
${ticketSummary || 'No tickets.'}

## Chatbot Sessions (7d): ${(chatbotRuns.data || []).length}

## Feature Usage This Month
${Object.entries(usageByAction).map(([a, c]) => `${a}: ${c}`).join(', ') || 'None.'}

Identify: top 3 friction points, critical bugs, top 3 feature requests. Rank by impact. Send to Morgan (CTO).`;

  const report = await runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });

  // Weekly email to Morgan (CTO) on Mondays
  if (now.getDay() === 1) {
    await resend.emails.send({
      from: FROM_EMAIL, to: 'hello@paybacker.co.uk',
      subject: '[UX Report] Weekly Improvement Priorities from Bella',
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
        <h1 style="color:#14b8a6;font-size:20px;margin:0 0 16px;">Weekly UX Report</h1>
        <p style="color:#e2e8f0;white-space:pre-wrap;">${report.content}</p>
        ${report.recommendations.length > 0 ? `<div style="background:#1e293b;border-radius:8px;padding:16px;margin:20px 0;"><p style="color:#f59e0b;font-weight:bold;margin:0 0 8px;">Priorities</p><ol style="color:#94a3b8;padding-left:20px;">${report.recommendations.map((r: string) => `<li>${r}</li>`).join('')}</ol></div>` : ''}
        <p style="color:#475569;font-size:11px;margin-top:24px;">Bella (CXO)</p></div>`,
    }).catch(() => {});
  }

  return report;
}
