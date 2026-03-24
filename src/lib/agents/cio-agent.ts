import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function runCIOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();

  // Get our current stats for comparison
  const [totalUsers, payingUsers, complaints] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('subscription_tier', ['essential', 'pro']),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('type', 'complaint_letter'),
  ]);

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}.

## Our Current Position
- Total users: ${totalUsers.count || 0}
- Paying customers: ${payingUsers.count || 0}
- Complaint letters generated: ${complaints.count || 0}
- Pricing: Free (3 letters/month), Essential (£9.99/month), Pro (£19.99/month)
- Key features: AI complaint letters, bank scanning, email scanning, subscription tracking, spending insights

## Competitors to Monitor

### DoNotPay (donotpay.com)
- US-focused AI consumer rights platform
- $3/month subscription
- Covers parking tickets, cancellations, price negotiations
- Recently faced legal issues over accuracy claims
- Weakness: not UK law specific, general purpose

### Resolver (resolver.co.uk)
- UK-based complaint resolution platform
- Free to use (advertising funded)
- Template-driven, not AI-generated
- Partners with ombudsman services
- Weakness: no AI, manual process, no financial tracking

### Emma (emma-app.com)
- UK subscription and budgeting app
- Free basic, £4.99/month premium
- Focuses on subscription tracking and budgeting
- Good UI, strong brand
- Weakness: no complaint letters, no legal advice

### Snoop (snoop.app)
- UK bill tracking app
- Free, ad-supported model
- Switches users to better deals
- Backed by former banking executives
- Weakness: no complaint letters, limited AI

### Other emerging competitors
- Cleo (AI financial assistant, mainly US)
- Plum (savings automation)
- Moneybox (investing, not complaints)
- Various fintech comparison sites

Analyse the competitive landscape. What are they doing that we should pay attention to? What advantages do we have? What threats should we prepare for? Recommend specific strategic actions.`;

  return runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });
}
