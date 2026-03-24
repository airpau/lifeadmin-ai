import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';
import { resend, FROM_EMAIL } from '@/lib/resend';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCLOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch recent complaint letters to audit
  const [recentLetters, recentLogs, userCount, gmailTokenCount] = await Promise.all([
    supabase.from('agent_runs')
      .select('id, task_id, output_data, created_at')
      .in('agent_type', ['complaint_writer', 'government_form_writer'])
      .gte('created_at', yesterday)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('compliance_log')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yesterday),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('gmail_tokens').select('id', { count: 'exact', head: true }),
  ]);

  // Build letter summaries for audit
  const letterSummaries = (recentLetters.data || []).map((l, i) => {
    const output = l.output_data || {};
    const letter = (output.letter || '').substring(0, 500);
    const refs = output.legalReferences || [];
    return `Letter ${i + 1} (${l.created_at?.substring(0, 10)}):\nLegal refs cited: ${refs.join(', ') || 'none'}\nExcerpt: ${letter}`;
  }).join('\n\n');

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}.

## Compliance Overview
- Total users: ${userCount.count || 0}
- Gmail tokens stored: ${gmailTokenCount.count || 0} (GDPR: read-only access, user-consented)
- Compliance logs today: ${recentLogs.count || 0}
- Letters generated today for audit: ${(recentLetters.data || []).length}

## Letters to Audit
${letterSummaries || 'No letters generated in the last 24 hours.'}

## GDPR Checklist
- User data stored in Supabase (UK/EU servers): YES
- Gmail access is read-only OAuth: YES
- Bank data via TrueLayer (FCA regulated): YES
- Users can delete account: YES (/api/account/delete endpoint exists)
- Privacy policy published: YES (/privacy-policy)
- Data not sold to third parties: YES

## Key UK Regulations to Monitor
- Consumer Rights Act 2015 (our letters cite this)
- Consumer Credit Act 1974 (debt dispute letters)
- EU261/UK261 (flight compensation)
- FCA Consumer Duty (July 2023)
- Ofcom General Conditions
- Ofgem Standards of Conduct
- GDPR / UK Data Protection Act 2018
- ICO guidance on AI and automated decision-making

Please audit the letters above for legal accuracy. Check that:
1. Cited legislation is correct and current
2. Ombudsman escalation paths are accurate
3. Timeframes mentioned are correct (30-day right to reject, 8-week deadlock, etc.)
4. No misleading or inaccurate legal claims

Flag any issues found. If anything is urgent, mark it with priority "urgent".`;

  const report = await runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });

  // Save audit results to compliance_log
  if (report.data?.audit_results && Array.isArray(report.data.audit_results)) {
    for (const result of report.data.audit_results) {
      await supabase.from('compliance_log').insert({
        check_type: 'letter_audit',
        title: result.issue || 'Letter audit finding',
        description: result.recommendation || result.issue || '',
        severity: result.severity || 'info',
        metadata: { letter_id: result.letter_id },
      });
    }
  }

  // Send immediate alert if critical issues found
  const criticalItems = (report.actionItems || []).filter((a: any) => a.priority === 'urgent');
  if (criticalItems.length > 0) {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'hello@paybacker.co.uk',
      subject: '[URGENT] Compliance Alert from Leo (CLO)',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
          <h1 style="color:#ef4444;font-size:22px;margin:0 0 16px;">Urgent Compliance Alert</h1>
          ${criticalItems.map((item: any) => `
            <div style="background:#1e293b;border-left:3px solid #ef4444;border-radius:8px;padding:16px;margin:12px 0;">
              <p style="color:#fff;font-weight:bold;margin:0 0 4px;">${item.title}</p>
              <p style="color:#94a3b8;margin:0;font-size:13px;">${item.description}</p>
            </div>
          `).join('')}
          <p style="color:#475569;font-size:11px;margin-top:24px;">Leo (CLO) - Paybacker AI Compliance</p>
        </div>
      `,
    }).catch(err => console.error('[clo-agent] Urgent alert email failed:', err));
  }

  return report;
}
