import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';
import { checkIPFraud } from '@/lib/content-apis';
import { resend, FROM_EMAIL } from '@/lib/resend';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCFraudOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 1. Check for free users exceeding 3 letters/month
  const { data: overLimit } = await supabase.from('usage_logs')
    .select('user_id, count')
    .eq('action', 'complaint_generated')
    .eq('year_month', yearMonth)
    .gt('count', 3);

  const overLimitFree: string[] = [];
  for (const u of overLimit || []) {
    const { data: profile } = await supabase.from('profiles')
      .select('email, subscription_tier').eq('id', u.user_id).single();
    if (profile?.subscription_tier === 'free') {
      overLimitFree.push(`${profile.email} (${u.count} letters on free tier)`);
      await supabase.from('profiles').update({ fraud_risk: true }).eq('id', u.user_id);
    }
  }

  // 2. Check for multiple signups from same IP (via agent_runs chatbot data as proxy)
  // In a full implementation, we'd track IPs on signup

  // 3. Check API usage spikes
  const { data: recentRuns } = await supabase.from('agent_runs')
    .select('created_at')
    .gte('created_at', yesterday);

  const { data: weekRuns } = await supabase.from('agent_runs')
    .select('created_at')
    .gte('created_at', sevenDaysAgo);

  const dailyAvg = (weekRuns?.length || 0) / 7;
  const todayCount = recentRuns?.length || 0;
  const isSpike = todayCount > dailyAvg * 3 && todayCount > 10;

  // 4. New signups to check
  const { data: newUsers } = await supabase.from('profiles')
    .select('id, email, created_at')
    .gte('created_at', yesterday)
    .limit(20);

  const contextPrompt = `Today: ${now.toISOString().split('T')[0]}.

## Abuse Detection
- Free users over 3-letter limit: ${overLimitFree.length}
${overLimitFree.map(u => `  - ${u}`).join('\n') || '  None'}

## API Usage
- Today: ${todayCount} agent runs
- 7-day daily average: ${dailyAvg.toFixed(0)}
- Spike detected: ${isSpike ? 'YES (3x above average)' : 'No'}

## New Signups (last 24h): ${(newUsers || []).length}
${(newUsers || []).map(u => `  - ${u.email}`).join('\n') || '  None'}

## Accounts flagged as fraud_risk
${overLimitFree.length > 0 ? overLimitFree.join(', ') : 'None'}

Analyse for fraud patterns. Flag anything suspicious.`;

  const report = await runExecutiveAgent(agentConfig, contextPrompt);

  // Alert on flagged accounts
  if (overLimitFree.length > 0 || isSpike) {
    await resend.emails.send({
      from: FROM_EMAIL, to: 'hello@paybacker.co.uk',
      subject: `[Fraud Alert] ${overLimitFree.length} accounts flagged`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
        <h1 style="color:#ef4444;font-size:20px;margin:0 0 16px;">Fraud Detection Alert</h1>
        <p style="color:#94a3b8;">Finn (CFraudO) has flagged ${overLimitFree.length} account(s):</p>
        ${overLimitFree.map(u => `<p style="color:#fff;margin:4px 0;">${u}</p>`).join('')}
        ${isSpike ? `<p style="color:#ef4444;margin-top:12px;">API usage spike detected: ${todayCount} runs today vs ${dailyAvg.toFixed(0)} daily average</p>` : ''}
        <p style="color:#475569;font-size:11px;margin-top:24px;">Finn (CFraudO)</p></div>`,
    }).catch(() => {});
  }

  return report;
}
