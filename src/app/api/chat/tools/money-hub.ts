import { createClient } from '@supabase/supabase-js';
import { ChatTool } from './registry';
import { normalizeSpendingCategoryKey, buildMoneyHubOverrideMaps, findMatchingCategoryOverride, resolveMoneyHubTransaction } from '@/lib/money-hub-classification';
import { normaliseMerchantName, categoriseTransaction } from '@/lib/merchant-normalise';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  mortgage: 'Mortgage', loans: 'Loans & Finance', credit: 'Credit Cards',
  council_tax: 'Council Tax', energy: 'Energy', water: 'Water',
  broadband: 'Broadband', mobile: 'Mobile', streaming: 'Streaming',
  fitness: 'Fitness', groceries: 'Groceries', eating_out: 'Eating Out',
  fuel: 'Fuel', shopping: 'Shopping', insurance: 'Insurance',
  transport: 'Transport', gambling: 'Gambling', childcare: 'Childcare',
  software: 'Software', tax: 'Tax (HMRC)', professional: 'Professional Services',
  bills: 'Bills', transfers: 'Transfers', cash: 'Cash', fees: 'Fees',
  income: 'Income', other: 'Other', motoring: 'Motoring', property_management: 'Property',
  credit_monitoring: 'Credit Monitoring', charity: 'Charity',
};

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);

/**
 * Helper: resolve + classify transactions using the same engine as the dashboard.
 * Returns transactions with effectiveCategory set correctly.
 */
async function getClassifiedTransactions(userId: string, months: number = 1) {
  const admin = getAdmin();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const [{ data: txns }, { data: overrideRows }] = await Promise.all([
    admin.from('bank_transactions')
      .select('id, amount, description, category, timestamp, merchant_name, user_category, income_type')
      .eq('user_id', userId)
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(10000),
    admin.from('money_hub_category_overrides')
      .select('merchant_pattern, transaction_id, user_category')
      .eq('user_id', userId),
  ]);

  const overrides = buildMoneyHubOverrideMaps(overrideRows || []);
  return (txns || []).map(txn => {
    const overrideCategory = findMatchingCategoryOverride(txn, overrides.transactionOverrides, overrides.merchantOverrides);
    const resolved = resolveMoneyHubTransaction(txn, overrideCategory);
    return { ...txn, resolved, effectiveCategory: resolved.spendingCategory || 'other' };
  });
}

// ─── Tools ──────────────────────────────────────────────────────────────────

const getSpendingSummary: ChatTool = {
  name: 'get_spending_summary',
  description:
    'Get the user\'s spending summary. Shows total spend, income, top categories, and category breakdown. Use when the user asks about their spending, finances, or "how am I doing".',
  input_schema: {
    type: 'object' as const,
    properties: {
      months: { type: 'number', description: 'Months to look back (default 1, max 6)' },
    },
    required: [],
  },
  handler: async (args: { months?: number }, userId: string) => {
    const months = Math.min(args.months || 1, 6);
    const classified = await getClassifiedTransactions(userId, months);

    const spending = classified.filter(t => t.resolved.kind === 'spending');
    const income = classified.filter(t => t.resolved.kind === 'income');

    const totalSpend = spending.reduce((sum, t) => sum + (-parseFloat(String(t.amount))), 0);
    const totalIncome = income.reduce((sum, t) => sum + parseFloat(String(t.amount)), 0);

    const categoryTotals: Record<string, number> = {};
    for (const t of spending) {
      const cat = t.effectiveCategory;
      if (cat === 'transfers') continue;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (-parseFloat(String(t.amount)));
    }

    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([cat, total]) => ({
        category: CATEGORY_LABELS[cat] || cat,
        category_key: cat,
        total: `£${total.toFixed(2)}`,
        percentage: `${((total / totalSpend) * 100).toFixed(1)}%`,
      }));

    return {
      period: `Last ${months} month${months > 1 ? 's' : ''}`,
      total_spend: `£${totalSpend.toFixed(2)}`,
      total_income: `£${totalIncome.toFixed(2)}`,
      savings_rate: totalIncome > 0 ? `${((totalIncome - totalSpend) / totalIncome * 100).toFixed(1)}%` : 'N/A',
      transaction_count: classified.length,
      top_categories: topCategories,
      tip: 'You can ask me about any specific category, e.g. "Show my mortgage payments" or "How much did I spend on groceries?"',
    };
  },
};

const getSpendingByCategory: ChatTool = {
  name: 'get_spending_by_category',
  description:
    'Get detailed spending for a specific category (e.g. "mortgage", "groceries", "energy", "eating_out", "loans", "insurance"). Shows individual transactions and merchant breakdown. Use when user asks about a specific type of spending like "show my mortgage payments" or "how much am I spending on energy?".',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description: `The spending category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      },
      months: { type: 'number', description: 'Months to look back (default 1)' },
    },
    required: ['category'],
  },
  handler: async (args: { category: string; months?: number }, userId: string) => {
    const months = Math.min(args.months || 1, 6);
    const classified = await getClassifiedTransactions(userId, months);
    const targetCategory = normalizeSpendingCategoryKey(args.category);

    const filtered = classified.filter(t =>
      t.resolved.kind === 'spending' &&
      normalizeSpendingCategoryKey(t.effectiveCategory) === targetCategory
    );

    if (filtered.length === 0) {
      // Also try searching by description keyword as fallback
      const keyword = args.category.toLowerCase().replace(/_/g, ' ');
      const byDesc = classified.filter(t =>
        t.resolved.kind === 'spending' &&
        ((t.description || '').toLowerCase().includes(keyword) ||
         (t.merchant_name || '').toLowerCase().includes(keyword))
      );

      if (byDesc.length > 0) {
        const total = byDesc.reduce((s, t) => s + (-parseFloat(String(t.amount))), 0);
        return {
          category: CATEGORY_LABELS[targetCategory] || args.category,
          period: `Last ${months} month${months > 1 ? 's' : ''}`,
          total: `£${total.toFixed(2)}`,
          transaction_count: byDesc.length,
          note: `Found by keyword match "${keyword}"`,
          transactions: byDesc.slice(0, 15).map(t => ({
            description: normaliseMerchantName(t.merchant_name || t.description || ''),
            raw_description: t.description,
            amount: `£${Math.abs(parseFloat(String(t.amount))).toFixed(2)}`,
            date: t.timestamp?.substring(0, 10),
            classified_as: t.effectiveCategory,
          })),
        };
      }

      return { message: `No transactions found in the "${CATEGORY_LABELS[targetCategory] || args.category}" category for the last ${months} month(s). Available categories with data: ${Object.keys(classified.reduce((acc, t) => { if (t.resolved.kind === 'spending') acc[t.effectiveCategory] = true; return acc; }, {} as Record<string, boolean>)).map(c => CATEGORY_LABELS[c] || c).join(', ')}` };
    }

    const total = filtered.reduce((s, t) => s + (-parseFloat(String(t.amount))), 0);

    // Merchant breakdown
    const merchantTotals: Record<string, { total: number; count: number }> = {};
    for (const t of filtered) {
      const merchant = normaliseMerchantName(t.merchant_name || t.description || '');
      if (!merchantTotals[merchant]) merchantTotals[merchant] = { total: 0, count: 0 };
      merchantTotals[merchant].total += (-parseFloat(String(t.amount)));
      merchantTotals[merchant].count++;
    }

    const merchants = Object.entries(merchantTotals)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 10)
      .map(([name, data]) => ({ merchant: name, total: `£${data.total.toFixed(2)}`, count: data.count }));

    return {
      category: CATEGORY_LABELS[targetCategory] || args.category,
      period: `Last ${months} month${months > 1 ? 's' : ''}`,
      total: `£${total.toFixed(2)}`,
      transaction_count: filtered.length,
      merchants,
      recent_transactions: filtered.slice(0, 10).map(t => ({
        description: normaliseMerchantName(t.merchant_name || t.description || ''),
        amount: `£${Math.abs(parseFloat(String(t.amount))).toFixed(2)}`,
        date: t.timestamp?.substring(0, 10),
      })),
    };
  },
};

const searchTransactions: ChatTool = {
  name: 'search_transactions',
  description:
    'Search the user\'s bank transactions by keyword (e.g. "Paratus", "Lendinvest", "Amazon", "Costa", "Santander"). Searches both merchant name and description. Use when user asks about specific payments or merchants.',
  input_schema: {
    type: 'object' as const,
    properties: {
      keyword: { type: 'string', description: 'Keyword to search for in merchant name or description' },
      months: { type: 'number', description: 'Months to look back (default 3)' },
    },
    required: ['keyword'],
  },
  handler: async (args: { keyword: string; months?: number }, userId: string) => {
    const admin = getAdmin();
    const months = Math.min(args.months || 3, 6);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    const kw = args.keyword.toLowerCase().trim();

    // Search both merchant_name and description using ILIKE
    const pattern = `%${kw}%`;
    const { data: transactions } = await admin
      .from('bank_transactions')
      .select('id, amount, description, merchant_name, category, timestamp, user_category')
      .eq('user_id', userId)
      .gte('timestamp', startDate.toISOString())
      .or(`merchant_name.ilike.${pattern},description.ilike.${pattern}`)
      .order('timestamp', { ascending: false })
      .limit(30);

    if (!transactions || transactions.length === 0) {
      return { message: `No transactions found matching "${args.keyword}" in the last ${months} months.` };
    }

    const debits = transactions.filter(t => parseFloat(String(t.amount)) < 0);
    const credits = transactions.filter(t => parseFloat(String(t.amount)) > 0);
    const totalSpent = debits.reduce((s, t) => s + (-parseFloat(String(t.amount))), 0);
    const totalReceived = credits.reduce((s, t) => s + parseFloat(String(t.amount)), 0);

    return {
      keyword: args.keyword,
      period: `Last ${months} month${months > 1 ? 's' : ''}`,
      matches: transactions.length,
      total_outgoing: totalSpent > 0 ? `£${totalSpent.toFixed(2)}` : undefined,
      total_incoming: totalReceived > 0 ? `£${totalReceived.toFixed(2)}` : undefined,
      transactions: transactions.slice(0, 15).map(t => ({
        description: normaliseMerchantName(t.merchant_name || t.description || ''),
        raw: t.description,
        amount: `£${parseFloat(String(t.amount)).toFixed(2)}`,
        date: t.timestamp?.substring(0, 10),
        type: parseFloat(String(t.amount)) > 0 ? 'income' : 'spending',
        category: categoriseTransaction(
          [t.merchant_name, t.description].filter(Boolean).join(' '),
          t.category || '',
          parseFloat(String(t.amount))
        ),
      })),
    };
  },
};

const getBudgets: ChatTool = {
  name: 'get_budgets',
  description:
    'Get the user\'s budget limits and current spending progress for each category. Shows how much they\'ve spent vs their budget this month.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  handler: async (_args: Record<string, never>, userId: string) => {
    const admin = getAdmin();

    // IMPORTANT: Use money_hub_budgets table (NOT "budgets")
    const { data: budgets } = await admin
      .from('money_hub_budgets')
      .select('id, category, monthly_limit')
      .eq('user_id', userId);

    if (!budgets || budgets.length === 0) {
      return { message: 'No budgets set yet. You can set budgets by saying "Set my groceries budget to £400" or "Create a travel budget of £200".' };
    }

    // Get classified spending for current month
    const classified = await getClassifiedTransactions(userId, 1);
    const categorySpend: Record<string, number> = {};
    for (const t of classified) {
      if (t.resolved.kind !== 'spending') continue;
      const cat = normalizeSpendingCategoryKey(t.effectiveCategory);
      categorySpend[cat] = (categorySpend[cat] || 0) + (-parseFloat(String(t.amount)));
    }

    return {
      budgets: budgets.map(b => {
        const cat = normalizeSpendingCategoryKey(b.category);
        const spent = categorySpend[cat] || 0;
        const limit = parseFloat(String(b.monthly_limit));
        const remaining = limit - spent;
        return {
          category: CATEGORY_LABELS[cat] || b.category,
          category_key: cat,
          monthly_limit: `£${limit.toFixed(2)}`,
          spent_this_month: `£${spent.toFixed(2)}`,
          remaining: `£${remaining.toFixed(2)}`,
          percentage_used: `${Math.min(100, Math.round((spent / limit) * 100))}%`,
          status: spent > limit ? 'OVER BUDGET' : spent > limit * 0.8 ? 'WARNING' : 'On track',
        };
      }),
    };
  },
};

const setBudget: ChatTool = {
  name: 'set_budget',
  description:
    'Set or update a monthly BUDGET limit for a spending category. A budget is a monthly spending limit with alerts. This is NOT a savings goal. Use when user says "set a budget", "limit my spending", or "budget for travel". Category must be a spending category like groceries, travel, eating_out, shopping, etc.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description: `The spending category to budget for. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      },
      monthly_limit: {
        type: 'number',
        description: 'The monthly budget limit in GBP',
      },
    },
    required: ['category', 'monthly_limit'],
  },
  handler: async (args: { category: string; monthly_limit: number }, userId: string) => {
    const admin = getAdmin();
    const cat = normalizeSpendingCategoryKey(args.category);

    // IMPORTANT: Write to money_hub_budgets (NOT "budgets")
    const { data, error } = await admin
      .from('money_hub_budgets')
      .upsert({
        user_id: userId,
        category: cat,
        monthly_limit: args.monthly_limit,
      }, { onConflict: 'user_id,category' })
      .select()
      .single();

    if (error) {
      return { error: `Failed to set budget: ${error.message}` };
    }

    return {
      message: `✅ Budget set: £${args.monthly_limit.toFixed(2)}/month for ${CATEGORY_LABELS[cat] || cat}. I'll track your spending against this limit.`,
      budget: data,
    };
  },
};

const setSavingsGoal: ChatTool = {
  name: 'set_savings_goal',
  description:
    'Create a savings GOAL with a target amount. A savings goal is a target you\'re saving towards (e.g. "save £5000 for a holiday"). This is NOT a budget. Use when user says "save for", "savings goal", or "I want to save £X".',
  input_schema: {
    type: 'object' as const,
    properties: {
      goal_name: { type: 'string', description: 'Name of the goal (e.g. "Holiday", "Emergency fund", "New car")' },
      target_amount: { type: 'number', description: 'The target amount to save in GBP' },
      current_amount: { type: 'number', description: 'How much is already saved (default 0)' },
      emoji: { type: 'string', description: 'Emoji for the goal (optional, default ✨)' },
    },
    required: ['goal_name', 'target_amount'],
  },
  handler: async (args: { goal_name: string; target_amount: number; current_amount?: number; emoji?: string }, userId: string) => {
    const admin = getAdmin();

    const { data, error } = await admin
      .from('money_hub_savings_goals')
      .insert({
        user_id: userId,
        goal_name: args.goal_name,
        target_amount: args.target_amount,
        current_amount: args.current_amount || 0,
        emoji: args.emoji || '✨',
      })
      .select()
      .single();

    if (error) {
      return { error: `Failed to create savings goal: ${error.message}` };
    }

    return {
      message: `✅ Savings goal created: ${args.emoji || '✨'} ${args.goal_name} — target £${args.target_amount.toFixed(2)}${args.current_amount ? `, starting with £${args.current_amount.toFixed(2)} saved` : ''}.`,
      goal: data,
    };
  },
};

const getFinancialOverview: ChatTool = {
  name: 'get_financial_overview',
  description:
    'Get a complete financial overview: income, spending by category, subscriptions, budgets, savings goals, and alerts. Use when user asks "how am I doing financially?", "give me an overview", or "what\'s my financial situation?".',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  handler: async (_args: Record<string, never>, userId: string) => {
    const admin = getAdmin();
    const classified = await getClassifiedTransactions(userId, 1);

    const spending = classified.filter(t => t.resolved.kind === 'spending' && t.effectiveCategory !== 'transfers');
    const income = classified.filter(t => t.resolved.kind === 'income');
    const totalSpend = spending.reduce((s, t) => s + (-parseFloat(String(t.amount))), 0);
    const totalIncome = income.reduce((s, t) => s + parseFloat(String(t.amount)), 0);

    // Top 5 categories
    const cats: Record<string, number> = {};
    for (const t of spending) {
      cats[t.effectiveCategory] = (cats[t.effectiveCategory] || 0) + (-parseFloat(String(t.amount)));
    }
    const topCats = Object.entries(cats).sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([c, t]) => `${CATEGORY_LABELS[c] || c}: £${t.toFixed(2)}`);

    // Subscriptions, budgets, goals
    const [{ data: subs }, { data: budgets }, { data: goals }, { data: alerts }] = await Promise.all([
      admin.from('subscriptions').select('provider_name, amount, billing_cycle, status, contract_end_date').eq('user_id', userId).eq('status', 'active').is('dismissed_at', null),
      admin.from('money_hub_budgets').select('category, monthly_limit').eq('user_id', userId),
      admin.from('money_hub_savings_goals').select('goal_name, target_amount, current_amount, emoji').eq('user_id', userId),
      admin.from('money_hub_alerts').select('title, alert_type, value_gbp').eq('user_id', userId).eq('status', 'active').limit(5),
    ]);

    const activeSubs = subs || [];
    const monthlySubCost = activeSubs.reduce((s, sub) => {
      const amt = parseFloat(String(sub.amount)) || 0;
      if (sub.billing_cycle === 'yearly') return s + amt / 12;
      if (sub.billing_cycle === 'quarterly') return s + amt / 3;
      return s + amt;
    }, 0);

    return {
      this_month: {
        income: `£${totalIncome.toFixed(2)}`,
        spending: `£${totalSpend.toFixed(2)}`,
        savings_rate: totalIncome > 0 ? `${(((totalIncome - totalSpend) / totalIncome) * 100).toFixed(1)}%` : 'N/A',
      },
      top_spending_categories: topCats,
      subscriptions: {
        active: activeSubs.length,
        monthly_cost: `£${monthlySubCost.toFixed(2)}`,
      },
      budgets: (budgets || []).map(b => {
        const cat = normalizeSpendingCategoryKey(b.category);
        const spent = cats[cat] || 0;
        return `${CATEGORY_LABELS[cat] || b.category}: £${spent.toFixed(2)} / £${parseFloat(String(b.monthly_limit)).toFixed(2)}`;
      }),
      savings_goals: (goals || []).map(g =>
        `${g.emoji || '✨'} ${g.goal_name}: £${parseFloat(String(g.current_amount)).toFixed(2)} / £${parseFloat(String(g.target_amount)).toFixed(2)}`
      ),
      alerts: (alerts || []).map(a =>
        `${a.title}${a.value_gbp ? ` (£${parseFloat(String(a.value_gbp)).toFixed(2)})` : ''}`
      ),
    };
  },
};

const recategoriseTransaction: ChatTool = {
  name: 'recategorise_transaction',
  description:
    'Recategorise a merchant\'s transactions to a different spending category. Use when user says "move X to Y category" or "Paybacker should be in software" or "categorise X as Y". This updates all past and future transactions from that merchant.',
  input_schema: {
    type: 'object' as const,
    properties: {
      merchant: { type: 'string', description: 'The merchant name or keyword (e.g. "Paybacker", "Netflix", "Paratus")' },
      new_category: {
        type: 'string',
        description: `The new category. Must be one of: ${VALID_CATEGORIES.join(', ')}`,
      },
    },
    required: ['merchant', 'new_category'],
  },
  handler: async (args: { merchant: string; new_category: string }, userId: string) => {
    const cat = normalizeSpendingCategoryKey(args.new_category);
    
    // Call the recategorise API internally
    const admin = getAdmin();
    const pattern = `%${args.merchant.toLowerCase().trim()}%`;
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Save override
    await admin.from('money_hub_category_overrides').upsert({
      user_id: userId,
      merchant_pattern: args.merchant.toLowerCase().trim(),
      user_category: cat,
    }, { onConflict: 'user_id,merchant_pattern' });

    // Update matching transactions
    const { data: matching } = await admin
      .from('bank_transactions')
      .select('id')
      .eq('user_id', userId)
      .lt('amount', 0)
      .gte('timestamp', sixMonthsAgo.toISOString())
      .or(`merchant_name.ilike.${pattern},description.ilike.${pattern}`)
      .limit(500);

    let updated = 0;
    if (matching && matching.length > 0) {
      const ids = matching.map(t => t.id);
      for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50);
        const { count } = await admin.from('bank_transactions')
          .update({ user_category: cat })
          .in('id', batch);
        if (count) updated += count;
      }
    }

    // Teach learning engine
    const { learnFromCorrection } = await import('@/lib/learning-engine');
    await learnFromCorrection({
      rawName: args.merchant,
      category: cat,
      userId,
    }).catch(() => {});

    return {
      message: `✅ Recategorised "${args.merchant}" → ${CATEGORY_LABELS[cat] || cat}. Updated ${updated} transaction${updated !== 1 ? 's' : ''}. Future transactions from this merchant will be auto-categorised.`,
      updated,
    };
  },
};

export const moneyHubTools: ChatTool[] = [
  getSpendingSummary,
  getSpendingByCategory,
  searchTransactions,
  getBudgets,
  setBudget,
  setSavingsGoal,
  recategoriseTransaction,
  getFinancialOverview,
];
