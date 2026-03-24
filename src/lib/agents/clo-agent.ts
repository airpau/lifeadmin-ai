import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';
import { searchPerplexity } from '@/lib/content-apis';
import { resend, FROM_EMAIL } from '@/lib/resend';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCLOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Regulatory research via Perplexity
  const queries = [
    'FCA consumer regulation UK updates this week',
    'ICO GDPR enforcement UK updates this week',
    'Ofgem energy consumer rules UK updates this week',
    'Ofcom broadband consumer rules UK updates this week',
    'CMA consumer rights UK updates this week',
  ];

  const findings: string[] = [];
  for (const q of queries) {
    const result = await searchPerplexity(q);
    if (result) {
      findings.push(`${q.split(' ')[0]}: ${result.substring(0, 300)}`);
      await supabase.from('compliance_log').insert({
        check_type: 'regulatory_update', title: q.split(' ')[0] + ' update',
        description: result.substring(0, 500), severity: 'info',
        source: 'perplexity', date: now.toISOString().split('T')[0],
      });
    }
  }

  // Audit recent letters
  const { data: letters } = await supabase.from('agent_runs')
    .select('id, output_data').in('agent_type', ['complaint_writer', 'government_form_writer'])
    .gte('created_at', yesterday).limit(5);

  const letterSummaries = (letters || []).map((l, i) => {
    const o = l.output_data || {};
    return `Letter ${i + 1}: Refs: ${(o.legalReferences || []).join(', ') || 'none'}. Text: ${(o.letter || '').substring(0, 300)}`;
  }).join('\n\n');

  const [gmailTokens, bankConns, totalUsers] = await Promise.all([
    supabase.from('gmail_tokens').select('id', { count: 'exact', head: true }),
    supabase.from('bank_connections').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const contextPrompt = `Today: ${now.toISOString().split('T')[0]}.

## Regulatory Research
${findings.join('\n\n') || 'Perplexity not configured or no results.'}

## Letters to Audit (${(letters || []).length})
${letterSummaries || 'No letters generated.'}

## GDPR: Users ${totalUsers.count || 0}, Gmail tokens ${gmailTokens.count || 0}, Bank connections ${bankConns.count || 0}

Audit letters for legal accuracy. Check regulatory findings. Flag urgent issues.`;

  const report = await runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });

  // Urgent alerts
  const urgent = (report.actionItems || []).filter((a: any) => a.priority === 'urgent');
  if (urgent.length > 0) {
    await resend.emails.send({
      from: FROM_EMAIL, to: 'hello@paybacker.co.uk',
      subject: '[URGENT] Compliance Alert from Leo (CLO)',
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
        <h1 style="color:#ef4444;margin:0 0 16px;">Urgent Compliance Alert</h1>
        ${urgent.map((i: any) => `<div style="background:#1e293b;border-left:3px solid #ef4444;border-radius:8px;padding:16px;margin:12px 0;"><p style="color:#fff;font-weight:bold;margin:0 0 4px;">${i.title}</p><p style="color:#94a3b8;margin:0;font-size:13px;">${i.description}</p></div>`).join('')}
      </div>`,
    }).catch(() => {});
  }

  return report;
}
