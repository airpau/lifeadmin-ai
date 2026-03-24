import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';
import { searchPerplexity } from '@/lib/content-apis';
import { resend, FROM_EMAIL } from '@/lib/resend';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCIOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();

  // Research competitors via Perplexity
  const competitors = ['DoNotPay', 'Resolver UK', 'Emma App finance', 'Snoop App UK'];
  const competitorFindings: string[] = [];

  for (const competitor of competitors) {
    const result = await searchPerplexity(`${competitor} latest news updates features pricing 2026`);
    if (result) {
      competitorFindings.push(`${competitor}: ${result.substring(0, 400)}`);
      await supabase.from('competitive_intelligence').insert({
        competitor, finding_type: 'weekly_scan',
        summary: result.substring(0, 500),
        date: now.toISOString().split('T')[0],
      });
    }
  }

  // Search for new entrants
  const newEntrants = await searchPerplexity('new UK consumer rights fintech apps launching 2026 complaint letter subscription tracker');
  if (newEntrants) {
    competitorFindings.push(`New Entrants: ${newEntrants.substring(0, 400)}`);
    await supabase.from('competitive_intelligence').insert({
      competitor: 'new_entrants', finding_type: 'market_scan',
      summary: newEntrants.substring(0, 500),
      date: now.toISOString().split('T')[0],
    });
  }

  // Our stats for comparison
  const [totalUsers, payingUsers] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('subscription_tier', ['essential', 'pro']),
  ]);

  const contextPrompt = `Today: ${now.toISOString().split('T')[0]}.

## Our Position
- Users: ${totalUsers.count || 0}, Paying: ${payingUsers.count || 0}
- Pricing: Free/Essential £9.99/Pro £19.99
- Key features: AI complaint letters, bank scanning, email scanning, subscription tracking

## Competitor Research (via Perplexity)
${competitorFindings.join('\n\n') || 'Perplexity not configured.'}

Analyse the competitive landscape. What threats should we prepare for? What opportunities can we exploit?`;

  const report = await runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });

  // Email weekly report to founder and Taylor
  await resend.emails.send({
    from: FROM_EMAIL, to: 'hello@paybacker.co.uk',
    subject: `[Intelligence] Weekly Competitive Report from Nico`,
    html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
      <h1 style="color:#f59e0b;font-size:20px;margin:0 0 16px;">Weekly Competitive Intelligence</h1>
      <p style="color:#e2e8f0;white-space:pre-wrap;">${report.content}</p>
      ${report.recommendations.length > 0 ? `<div style="background:#1e293b;border-radius:8px;padding:16px;margin:20px 0;"><p style="color:#f59e0b;font-weight:bold;margin:0 0 8px;">Recommendations</p><ul style="color:#94a3b8;padding-left:20px;">${report.recommendations.map((r: string) => `<li>${r}</li>`).join('')}</ul></div>` : ''}
      <p style="color:#475569;font-size:11px;margin-top:24px;">Nico (CIO)</p></div>`,
  }).catch(() => {});

  return report;
}
