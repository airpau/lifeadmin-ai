import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { AgentConfig } from '@/lib/agents/executive-agent';
import { runCFOAgent } from '@/lib/agents/cfo-agent';
import { runCTOAgent } from '@/lib/agents/cto-agent';
import { runCAOAgent } from '@/lib/agents/cao-agent';
import { runCMOAgent } from '@/lib/agents/cmo-agent';
import { runExecAssistantAgent } from '@/lib/agents/exec-assistant-agent';
import { runSupportLeadAgent } from '@/lib/agents/support-lead-agent';
import { runSupportAgent } from '@/lib/agents/support-agent';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const agentRunners: Record<string, (config: AgentConfig) => Promise<any>> = {
  cfo: runCFOAgent,
  cto: runCTOAgent,
  cao: runCAOAgent,
  cmo: runCMOAgent,
  exec_assistant: runExecAssistantAgent,
  support_lead: runSupportLeadAgent,
  support_agent: runSupportAgent,
};

// Simple cron matcher — checks if current time matches a cron expression
function shouldRunNow(schedule: string): boolean {
  const now = new Date();
  const parts = schedule.split(' ');
  if (parts.length !== 5) return false;

  const [minute, hour, , , dayOfWeek] = parts;

  const matchesPart = (part: string, value: number): boolean => {
    if (part === '*') return true;
    // Handle */N
    if (part.startsWith('*/')) {
      const interval = parseInt(part.slice(2));
      return value % interval === 0;
    }
    // Handle comma-separated values
    if (part.includes(',')) {
      return part.split(',').map(Number).includes(value);
    }
    return parseInt(part) === value;
  };

  return (
    matchesPart(minute, now.getUTCMinutes()) &&
    matchesPart(hour, now.getUTCHours()) &&
    matchesPart(dayOfWeek, now.getUTCDay())
  );
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Fetch all active agents
  const { data: agents, error } = await supabase
    .from('ai_executives')
    .select('*')
    .eq('status', 'active');

  if (error || !agents) {
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }

  const results: Array<{ role: string; status: string; report_id?: string }> = [];

  for (const agent of agents) {
    // Check if this agent should run based on schedule
    if (!shouldRunNow(agent.schedule)) {
      results.push({ role: agent.role, status: 'skipped (not scheduled)' });
      continue;
    }

    const runner = agentRunners[agent.role];
    if (!runner) {
      results.push({ role: agent.role, status: 'skipped (no runner)' });
      continue;
    }

    try {
      const config: AgentConfig = {
        id: agent.id,
        role: agent.role,
        name: agent.name,
        systemPrompt: agent.system_prompt,
        config: agent.config || {},
      };

      const report = await runner(config);

      // Save report
      const { data: savedReport } = await supabase
        .from('executive_reports')
        .insert({
          agent_id: agent.id,
          report_type: report.reportType,
          title: report.title,
          content: report.content,
          data: report.data,
          recommendations: report.recommendations,
          status: 'draft',
        })
        .select('id')
        .single();

      // Save action items flagged by this agent
      if (report.actionItems && report.actionItems.length > 0) {
        const items = report.actionItems.map((item: any) => ({
          flagged_by: agent.role,
          assigned_to: item.assigned_to || 'human',
          title: item.title || item.task || 'Action required',
          description: item.description || item.task || '',
          priority: item.priority || 'medium',
          category: item.category || 'operations',
          status: 'open',
          source_report_id: savedReport?.id || null,
        }));

        const { error: aiError } = await supabase.from('agent_action_items').insert(items);
        if (aiError) console.error(`Failed to save action items for ${agent.role}:`, aiError.message);
        else console.log(`[executive-agents] ${agent.role} flagged ${items.length} action items`);
      }

      // Update agent last_run_at
      await supabase
        .from('ai_executives')
        .update({ last_run_at: new Date().toISOString() })
        .eq('id', agent.id);

      // Email report to admin (for executive agents — not support agents)
      if (['cfo', 'cto', 'cao', 'cmo', 'exec_assistant'].includes(agent.role)) {
        try {
          // Charlie (exec assistant) emails hello@, others go to admin
          const emailTo = agent.role === 'exec_assistant'
            ? 'hello@paybacker.co.uk'
            : ADMIN_EMAIL;
          await resend.emails.send({
            from: FROM_EMAIL,
            to: emailTo,
            subject: `[Paybacker AI] ${report.title}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
                <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 24px;">
                  <h1 style="color: #f59e0b; font-size: 22px; margin: 0;">${report.title}</h1>
                  <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">${agent.name}</p>
                </div>
                <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${report.content}</p>
                ${report.recommendations.length > 0 ? `
                  <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <p style="color: #f59e0b; font-weight: bold; margin: 0 0 8px;">Recommendations</p>
                    <ul style="color: #94a3b8; padding-left: 20px; line-height: 2; margin: 0;">
                      ${report.recommendations.map((r: string) => `<li>${r}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}
                ${Object.keys(report.data).length > 0 ? `
                  <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <p style="color: #f59e0b; font-weight: bold; margin: 0 0 8px;">Key Metrics</p>
                    <pre style="color: #94a3b8; font-size: 13px; margin: 0; overflow-x: auto;">${JSON.stringify(report.data, null, 2)}</pre>
                  </div>
                ` : ''}
                <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
                <p style="color: #475569; font-size: 12px;">Paybacker AI Executive Team</p>
              </div>
            `,
          });

          // Mark report as sent
          if (savedReport?.id) {
            await supabase.from('executive_reports').update({
              status: 'sent',
              sent_to: emailTo,
              sent_at: new Date().toISOString(),
            }).eq('id', savedReport.id);
          }
        } catch (emailErr) {
          console.error(`Failed to email report for ${agent.role}:`, emailErr);
        }
      }

      results.push({ role: agent.role, status: 'completed', report_id: savedReport?.id });
    } catch (err: any) {
      console.error(`Agent ${agent.role} failed:`, err.message);
      results.push({ role: agent.role, status: `failed: ${err.message}` });
    }
  }

  return NextResponse.json({ results, ran_at: new Date().toISOString() });
}
