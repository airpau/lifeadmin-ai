import { createClient } from '@supabase/supabase-js';
import { ChatTool } from './registry';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const findDeals: ChatTool = {
  name: 'find_deals',
  description:
    'Find available deals for a specific category or provider. Use when the user asks "find me a better broadband deal", "what energy deals are available?", "can I save on my mobile?". Returns deals from Paybacker\'s deals database.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description: 'Deal category: energy, broadband, mobile, insurance, mortgages, loans, credit-cards, car-finance, travel',
      },
      provider_name: {
        type: 'string',
        description: 'Optional: current provider name to compare against',
      },
    },
    required: ['category'],
  },
  handler: async (args: { category: string; provider_name?: string }, userId: string) => {
    const admin = getAdmin();

    // Check if user has a subscription in this category to compare against
    let currentSub = null;
    if (args.provider_name) {
      const { data } = await admin
        .from('subscriptions')
        .select('provider_name, amount, billing_cycle, contract_end_date, current_tariff')
        .eq('user_id', userId)
        .ilike('provider_name', `%${args.provider_name}%`)
        .eq('status', 'active')
        .is('dismissed_at', null)
        .limit(1)
        .single();
      currentSub = data;
    }

    if (!currentSub) {
      // Try to find any active subscription in this provider_type category
      const categoryMap: Record<string, string> = {
        energy: 'energy', broadband: 'broadband', mobile: 'mobile',
        insurance: 'insurance', mortgages: 'mortgage', loans: 'loan',
      };
      const providerType = categoryMap[args.category];
      if (providerType) {
        const { data } = await admin
          .from('subscriptions')
          .select('provider_name, amount, billing_cycle, contract_end_date, current_tariff')
          .eq('user_id', userId)
          .eq('provider_type', providerType)
          .eq('status', 'active')
          .is('dismissed_at', null)
          .limit(1)
          .single();
        currentSub = data;
      }
    }

    // Check for latest energy tariffs if category is energy
    let latestTariffs: any[] = [];
    if (args.category === 'energy') {
      const { data } = await admin
        .from('energy_tariffs')
        .select('provider, tariff_name, tariff_type, annual_cost_estimate, monthly_cost_estimate')
        .order('created_at', { ascending: false })
        .limit(8);
      latestTariffs = data || [];
    }

    const result: any = {
      category: args.category,
      deals_page: `https://paybacker.co.uk/deals/${args.category}`,
    };

    if (currentSub) {
      const monthlyAmt = currentSub.billing_cycle === 'yearly'
        ? parseFloat(String(currentSub.amount)) / 12
        : currentSub.billing_cycle === 'quarterly'
          ? parseFloat(String(currentSub.amount)) / 3
          : parseFloat(String(currentSub.amount));

      result.current_provider = {
        name: currentSub.provider_name,
        monthly_cost: `£${monthlyAmt.toFixed(2)}`,
        annual_cost: `£${(monthlyAmt * 12).toFixed(2)}`,
        contract_end_date: currentSub.contract_end_date,
        current_tariff: currentSub.current_tariff,
      };
    }

    if (latestTariffs.length > 0) {
      result.latest_tariffs = latestTariffs.map(t => ({
        provider: t.provider,
        tariff: t.tariff_name,
        type: t.tariff_type,
        annual_cost: t.annual_cost_estimate ? `£${t.annual_cost_estimate}` : 'N/A',
        monthly_cost: t.monthly_cost_estimate ? `£${t.monthly_cost_estimate}` : 'N/A',
      }));

      if (currentSub) {
        const currentAnnual = currentSub.billing_cycle === 'yearly'
          ? parseFloat(String(currentSub.amount))
          : parseFloat(String(currentSub.amount)) * 12;
        const cheapest = latestTariffs
          .filter(t => t.annual_cost_estimate)
          .sort((a, b) => a.annual_cost_estimate - b.annual_cost_estimate)[0];
        if (cheapest && cheapest.annual_cost_estimate < currentAnnual) {
          result.potential_saving = `£${Math.round(currentAnnual - cheapest.annual_cost_estimate)}/year`;
          result.cheapest_option = `${cheapest.provider} ${cheapest.tariff_name}`;
        }
      }
    }

    // Check for pre-computed comparisons from subscription_comparisons table
    if (currentSub) {
      const { data: subRow } = await admin
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .ilike('provider_name', `%${args.provider_name || ''}%`)
        .eq('status', 'active')
        .is('dismissed_at', null)
        .limit(1)
        .single();

      if (subRow) {
        const { data: savedComps } = await admin
          .from('subscription_comparisons')
          .select('deal_provider, deal_name, deal_url, current_price, deal_price, annual_saving')
          .eq('subscription_id', subRow.id)
          .eq('dismissed', false)
          .order('annual_saving', { ascending: false })
          .limit(3);

        if (savedComps && savedComps.length > 0) {
          result.pre_computed_comparisons = savedComps.map(c => ({
            provider: c.deal_provider,
            deal: c.deal_name,
            url: c.deal_url,
            current_monthly: c.current_price ? `£${parseFloat(String(c.current_price)).toFixed(2)}` : null,
            deal_monthly: c.deal_price ? `£${parseFloat(String(c.deal_price)).toFixed(2)}` : null,
            annual_saving: c.annual_saving ? `£${parseFloat(String(c.annual_saving)).toFixed(0)}/year` : null,
          }));
        }
      }
    }

    result.message = currentSub
      ? `I found your ${currentSub.provider_name} subscription. Check the deals page for alternatives.`
      : `Browse ${args.category} deals at paybacker.co.uk/deals/${args.category}`;

    return result;
  },
};

const generateComplaintWithContext: ChatTool = {
  name: 'generate_complaint_with_context',
  description:
    'Generate a complaint letter enriched with the user\'s subscription data. Use when the user says "write a complaint about my energy bill" or "complain about BT". Pulls their subscription details automatically for a more personalised letter.',
  input_schema: {
    type: 'object' as const,
    properties: {
      provider_name: {
        type: 'string',
        description: 'The company to complain about',
      },
      issue: {
        type: 'string',
        description: 'Description of the issue/complaint',
      },
      desired_outcome: {
        type: 'string',
        description: 'What the user wants (refund, credit, apology, etc.)',
      },
    },
    required: ['provider_name', 'issue'],
  },
  handler: async (args: { provider_name: string; issue: string; desired_outcome?: string }, userId: string) => {
    const admin = getAdmin();

    // Pull subscription context
    const { data: sub } = await admin
      .from('subscriptions')
      .select('provider_name, amount, billing_cycle, contract_start_date, contract_end_date, current_tariff, account_email, notes')
      .eq('user_id', userId)
      .ilike('provider_name', `%${args.provider_name}%`)
      .eq('status', 'active')
      .is('dismissed_at', null)
      .limit(1)
      .single();

    // Pull user profile for auto-fill
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, first_name, last_name, email, phone, address, postcode')
      .eq('id', userId)
      .single();

    // Pull recent transactions for this provider
    const { data: recentTx } = await admin
      .from('bank_transactions')
      .select('amount, description, timestamp')
      .eq('user_id', userId)
      .ilike('description', `%${args.provider_name}%`)
      .order('timestamp', { ascending: false })
      .limit(5);

    const context: any = {
      provider: args.provider_name,
      issue: args.issue,
      desired_outcome: args.desired_outcome || 'full refund',
    };

    if (sub) {
      context.subscription = {
        amount: `£${parseFloat(String(sub.amount)).toFixed(2)}`,
        billing_cycle: sub.billing_cycle,
        contract_start: sub.contract_start_date,
        contract_end: sub.contract_end_date,
        tariff: sub.current_tariff,
        account_email: sub.account_email,
      };
    }

    if (profile) {
      context.user = {
        name: profile.full_name || [profile.first_name, profile.last_name].filter(Boolean).join(' '),
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        postcode: profile.postcode,
      };
    }

    if (recentTx && recentTx.length > 0) {
      context.recent_payments = recentTx.map(tx => ({
        amount: `£${Math.abs(parseFloat(String(tx.amount))).toFixed(2)}`,
        date: new Date(tx.timestamp).toLocaleDateString('en-GB'),
        description: tx.description,
      }));
    }

    return {
      message: 'I have gathered your subscription details, profile information, and recent payment history. Use this context to write the complaint letter in the Complaints section of your dashboard for a fully formatted, legally referenced letter.',
      context,
      action: `Go to your Complaints page and describe: "${args.issue}". Your details will be auto-filled.`,
      complaints_url: `https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(args.provider_name)}&issue=${encodeURIComponent(args.issue)}${args.desired_outcome ? `&outcome=${encodeURIComponent(args.desired_outcome)}` : ''}`,
    };
  },
};

const getScannerOpportunities: ChatTool = {
  name: 'get_scanner_opportunities',
  description:
    'Get the user\'s scanner results (overcharges, refund opportunities, forgotten subscriptions, flight delay compensation). Use when the user asks "what did the scanner find?", "any opportunities?", "am I being overcharged?".',
  input_schema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        description: 'Filter by opportunity type: overcharge, flight_delay, forgotten_subscription, debt_dispute, tax_rebate, refund',
      },
    },
    required: [],
  },
  handler: async (args: { type?: string }, userId: string) => {
    const admin = getAdmin();

    let query = admin
      .from('tasks')
      .select('id, type, title, description, provider_name, disputed_amount, status, created_at')
      .eq('user_id', userId)
      .in('status', ['pending_review', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(15);

    if (args.type) {
      query = query.eq('type', args.type);
    }

    const { data, error } = await query;

    if (error) return { error: error.message };
    if (!data || data.length === 0) {
      return { message: 'No pending opportunities found. Connect your bank account or run an email scan to detect savings opportunities.' };
    }

    const totalPotential = data.reduce((sum, t) => sum + (parseFloat(String(t.disputed_amount)) || 0), 0);

    return {
      opportunities: data.map(t => ({
        id: t.id,
        type: t.type,
        title: t.title,
        provider: t.provider_name,
        potential_value: t.disputed_amount ? `£${parseFloat(String(t.disputed_amount)).toFixed(2)}` : null,
        status: t.status,
        found: new Date(t.created_at).toLocaleDateString('en-GB'),
      })),
      count: data.length,
      total_potential_value: `£${totalPotential.toFixed(2)}`,
      message: `Found ${data.length} opportunity${data.length !== 1 ? 'ies' : 'y'} worth up to £${totalPotential.toFixed(2)}.`,
    };
  },
};

const getContractAlerts: ChatTool = {
  name: 'get_contract_alerts',
  description:
    'Get contracts that are expiring soon (within 30/60/90 days). Use when the user asks "any contracts ending soon?", "what renewals are coming up?", "am I locked into anything?".',
  input_schema: {
    type: 'object' as const,
    properties: {
      days: {
        type: 'number',
        description: 'Look ahead period in days (default 60)',
      },
    },
    required: [],
  },
  handler: async (args: { days?: number }, userId: string) => {
    const admin = getAdmin();
    const days = args.days || 60;
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const { data } = await admin
      .from('subscriptions')
      .select('id, provider_name, amount, billing_cycle, contract_end_date, auto_renews, early_exit_fee, provider_type')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('dismissed_at', null)
      .not('contract_end_date', 'is', null)
      .gte('contract_end_date', now.toISOString().split('T')[0])
      .lte('contract_end_date', cutoff.toISOString().split('T')[0])
      .order('contract_end_date', { ascending: true });

    if (!data || data.length === 0) {
      return { message: `No contracts expiring in the next ${days} days.` };
    }

    return {
      contracts_expiring: data.map(s => {
        const endDate = new Date(s.contract_end_date);
        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        return {
          provider: s.provider_name,
          amount: `£${parseFloat(String(s.amount)).toFixed(2)}/${s.billing_cycle}`,
          end_date: endDate.toLocaleDateString('en-GB'),
          days_remaining: daysLeft,
          auto_renews: s.auto_renews,
          early_exit_fee: s.early_exit_fee ? `£${parseFloat(String(s.early_exit_fee)).toFixed(2)}` : null,
          category: s.provider_type,
          urgency: daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : daysLeft <= 30 ? 'medium' : 'low',
        };
      }),
      count: data.length,
      message: `${data.length} contract${data.length !== 1 ? 's' : ''} expiring in the next ${days} days.`,
    };
  },
};

const detectPriceIncreases: ChatTool = {
  name: 'detect_price_increases',
  description:
    'Check if any of your recurring payments have increased in price recently. Use when the user asks "have any of my bills gone up?", "price increases?", "am I paying more than before?", "any hidden price rises?".',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  handler: async (_args: Record<string, never>, userId: string) => {
    const admin = getAdmin();

    const { data: alerts, error } = await admin
      .from('price_increase_alerts')
      .select('merchant_normalized, old_amount, new_amount, increase_pct, annual_impact, old_date, new_date, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('annual_impact', { ascending: false });

    if (error) return { error: error.message };
    if (!alerts || alerts.length === 0) {
      return { message: 'No price increases detected on your recurring payments. We check daily after your bank syncs.' };
    }

    const totalAnnualImpact = alerts.reduce((sum, a) => sum + parseFloat(String(a.annual_impact)), 0);

    return {
      price_increases: alerts.map(a => ({
        merchant: a.merchant_normalized,
        old_amount: `£${parseFloat(String(a.old_amount)).toFixed(2)}`,
        new_amount: `£${parseFloat(String(a.new_amount)).toFixed(2)}`,
        increase: `${a.increase_pct}%`,
        annual_impact: `£${parseFloat(String(a.annual_impact)).toFixed(2)}/year`,
      })),
      count: alerts.length,
      total_annual_impact: `£${totalAnnualImpact.toFixed(2)}/year`,
      message: `Found ${alerts.length} price increase${alerts.length !== 1 ? 's' : ''} costing you £${totalAnnualImpact.toFixed(2)} more per year. You can write a complaint letter or find a better deal for any of these.`,
    };
  },
};

const manageChallenges: ChatTool = {
  name: 'manage_challenges',
  description:
    'List active savings challenges, check progress, or see available challenges. Use when the user asks "what challenges do I have?", "how are my challenges going?", "any challenges I can start?", "check my challenge progress".',
  input_schema: {
    type: 'object' as const,
    properties: {
      action: {
        type: 'string',
        description: 'What to do: "list" (show active + available), "progress" (check active challenge progress)',
      },
    },
    required: [],
  },
  handler: async (args: { action?: string }, userId: string) => {
    const admin = getAdmin();

    // Get user's active challenges with template data
    const { data: userChallenges } = await admin
      .from('user_challenges')
      .select('id, status, started_at, completed_at, template:challenge_templates(name, description, type, duration_days, reward_points, icon)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const active = (userChallenges || []).filter(uc => uc.status === 'active');
    const completed = (userChallenges || []).filter(uc => uc.status === 'completed');

    // Get available templates
    const usedIds = new Set((userChallenges || []).filter(uc => uc.status === 'active' || uc.status === 'completed').map(uc => (uc as any).template_id));
    const { data: templates } = await admin
      .from('challenge_templates')
      .select('id, name, description, type, duration_days, reward_points, icon')
      .eq('active', true);

    const available = (templates || []).filter(t => !usedIds.has(t.id));

    const result: any = {
      active_challenges: active.map(uc => {
        const t = uc.template as any;
        const startedAt = new Date(uc.started_at);
        const now = new Date();
        const daysElapsed = Math.floor((now.getTime() - startedAt.getTime()) / (24 * 60 * 60 * 1000));
        return {
          id: uc.id,
          name: t?.name,
          type: t?.type,
          icon: t?.icon,
          reward_points: t?.reward_points,
          days_elapsed: daysElapsed,
          duration_days: t?.duration_days,
          days_remaining: t?.duration_days ? Math.max(0, t.duration_days - daysElapsed) : null,
        };
      }),
      completed_count: completed.length,
      total_points_from_challenges: completed.reduce((sum, uc) => sum + ((uc.template as any)?.reward_points || 0), 0),
      available_count: available.length,
      available_challenges: available.slice(0, 5).map(t => ({
        name: t.name,
        icon: t.icon,
        type: t.type,
        reward_points: t.reward_points,
        duration: t.duration_days ? `${t.duration_days} days` : 'One-time action',
      })),
      challenges_url: 'https://paybacker.co.uk/dashboard/rewards',
    };

    if (active.length > 0) {
      result.message = `You have ${active.length} active challenge${active.length !== 1 ? 's' : ''}. ${available.length} more available to start.`;
    } else if (available.length > 0) {
      result.message = `No active challenges. ${available.length} challenges available to start. Visit your Rewards page to begin.`;
    } else {
      result.message = 'You have completed all available challenges. Check back soon for new ones!';
    }

    return result;
  },
};

export const crossTabTools: ChatTool[] = [
  findDeals,
  generateComplaintWithContext,
  getScannerOpportunities,
  getContractAlerts,
  detectPriceIncreases,
  manageChallenges,
];
