import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

export const getMrr = tool(
  'get_mrr',
  'Calculate current Monthly Recurring Revenue (MRR) from active subscriptions. Queries the profiles table for subscription tier distribution.',
  {},
  async () => {
    const sb = getSupabase();

    const { data: profiles, error } = await sb.from('profiles')
      .select('subscription_tier')
      .not('subscription_tier', 'is', null);

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
    }

    const tiers = (profiles || []).reduce((acc: Record<string, number>, p) => {
      acc[p.subscription_tier] = (acc[p.subscription_tier] || 0) + 1;
      return acc;
    }, {});

    const prices: Record<string, number> = { essential: 9.99, pro: 19.99 };
    let mrr = 0;
    for (const [tier, count] of Object.entries(tiers)) {
      mrr += (prices[tier] || 0) * count;
    }

    const text = `MRR: GBP ${mrr.toFixed(2)}\nARR: GBP ${(mrr * 12).toFixed(2)}\n\nTier breakdown:\n${Object.entries(tiers).map(([t, c]) => `  ${t}: ${c} users (GBP ${((prices[t] || 0) * c).toFixed(2)}/mo)`).join('\n')}\n\nTotal paying: ${Object.entries(tiers).filter(([t]) => t !== 'free').reduce((s, [, c]) => s + c, 0)} users`;

    return { content: [{ type: 'text' as const, text }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const getSubscriptionStats = tool(
  'get_subscription_stats',
  'Get detailed subscription statistics: signups over time, conversion rates, churn indicators.',
  {
    days: z.number().default(30).describe('Days of history to analyse'),
  },
  async (args) => {
    const sb = getSupabase();
    const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000).toISOString();

    const [totalRes, recentRes, paidRes] = await Promise.all([
      sb.from('profiles').select('*', { count: 'exact', head: true }),
      sb.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', since),
      sb.from('profiles').select('*', { count: 'exact', head: true }).neq('subscription_tier', 'free'),
    ]);

    const total = totalRes.count || 0;
    const recent = recentRes.count || 0;
    const paid = paidRes.count || 0;
    const convRate = total > 0 ? ((paid / total) * 100).toFixed(1) : '0';

    return {
      content: [{
        type: 'text' as const,
        text: `Total users: ${total}\nNew users (last ${args.days}d): ${recent}\nPaying users: ${paid}\nConversion rate: ${convRate}%\nFree users: ${total - paid}`,
      }],
    };
  },
  { annotations: { readOnlyHint: true } }
);

export const stripeTools = [getMrr, getSubscriptionStats];
