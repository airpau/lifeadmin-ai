import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function runCFOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    tiersResult,
    recentSignups,
    costLast24h,
    costLast7d,
  ] = await Promise.all([
    supabase.from('profiles').select('subscription_tier'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
    supabase.from('agent_runs').select('estimated_cost').gte('created_at', yesterday),
    supabase.from('agent_runs').select('estimated_cost').gte('created_at', lastWeek),
  ]);

  // Tier breakdown
  const tiers: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of tiersResult.data || []) {
    const tier = p.subscription_tier || 'free';
    tiers[tier] = (tiers[tier] || 0) + 1;
  }

  const mrr = tiers.essential * 9.99 + tiers.pro * 19.99;
  const arr = mrr * 12;

  // API costs
  const apiCost24h = (costLast24h.data || []).reduce(
    (sum, r) => sum + (parseFloat(r.estimated_cost) || 0), 0
  );
  const apiCost7d = (costLast7d.data || []).reduce(
    (sum, r) => sum + (parseFloat(r.estimated_cost) || 0), 0
  );

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}. Here is the current financial data for Paybacker LTD:

## Revenue
- MRR: £${mrr.toFixed(2)}
- ARR: £${arr.toFixed(2)}
- Paying customers: ${tiers.essential + tiers.pro} (Essential: ${tiers.essential}, Pro: ${tiers.pro})
- Free users: ${tiers.free}
- Total users: ${tiers.free + tiers.essential + tiers.pro}

## Costs (API usage)
- Last 24 hours: £${apiCost24h.toFixed(4)}
- Last 7 days: £${apiCost7d.toFixed(4)}
- Monthly projected API cost: £${(apiCost7d * 4.3).toFixed(2)}

## Growth
- New signups (last 24h): ${recentSignups.count || 0}

## Revenue/Cost Ratio
- Monthly revenue: £${mrr.toFixed(2)}
- Monthly projected cost: £${(apiCost7d * 4.3).toFixed(2)}
- Margin: ${mrr > 0 ? ((1 - (apiCost7d * 4.3) / mrr) * 100).toFixed(1) : '0'}%

Please analyse this data and produce your daily financial report.`;

  return runExecutiveAgent(agentConfig, contextPrompt);
}
