import { createClient } from '@supabase/supabase-js';
import { ChatTool } from './registry';

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
  income: 'Income', other: 'Other',
};

const getSpendingSummary: ChatTool = {
  name: 'get_spending_summary',
  description:
    'Get the user\'s spending summary for a given period. Shows total spend, income, top categories, and month-over-month comparison. Use this when the user asks about their spending, budget, or finances.',
  input_schema: {
    type: 'object' as const,
    properties: {
      months: {
        type: 'number',
        description: 'Number of months to look back (default 1, max 6)',
      },
    },
    required: [],
  },
  handler: async (args: { months?: number }, userId: string) => {
    const admin = getAdmin();
    const months = Math.min(args.months || 1, 6);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data: transactions } = await admin
      .from('bank_transactions')
      .select('amount, description, category, timestamp')
      .eq('user_id', userId)
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false });

    if (!transactions || transactions.length === 0) {
      return { message: 'No transaction data found. Connect your bank account to see spending insights.' };
    }

    const debits = transactions.filter(tx => parseFloat(String(tx.amount)) < 0);
    const credits = transactions.filter(tx => parseFloat(String(tx.amount)) > 0);

    const totalSpend = debits.reduce((sum, tx) => sum + Math.abs(parseFloat(String(tx.amount))), 0);
    const totalIncome = credits.reduce((sum, tx) => sum + parseFloat(String(tx.amount)), 0);

    // Category breakdown
    const categoryTotals: Record<string, number> = {};
    for (const tx of debits) {
      const cat = tx.category?.toLowerCase() || 'other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(parseFloat(String(tx.amount)));
    }

    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([cat, total]) => ({
        category: CATEGORY_LABELS[cat] || cat,
        total: `£${total.toFixed(2)}`,
        percentage: `${((total / totalSpend) * 100).toFixed(1)}%`,
      }));

    return {
      period: `Last ${months} month${months > 1 ? 's' : ''}`,
      total_spend: `£${totalSpend.toFixed(2)}`,
      total_income: `£${totalIncome.toFixed(2)}`,
      net: `£${(totalIncome - totalSpend).toFixed(2)}`,
      transaction_count: transactions.length,
      top_categories: topCategories,
    };
  },
};

const getSpendingByCategory: ChatTool = {
  name: 'get_spending_by_category',
  description:
    'Get detailed spending for a specific category (e.g. "groceries", "eating_out", "energy"). Shows individual transactions in that category.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description: 'The spending category to drill into (e.g. groceries, eating_out, energy, streaming, shopping)',
      },
      months: {
        type: 'number',
        description: 'Number of months to look back (default 1)',
      },
    },
    required: ['category'],
  },
  handler: async (args: { category: string; months?: number }, userId: string) => {
    const admin = getAdmin();
    const months = Math.min(args.months || 1, 6);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data: transactions } = await admin
      .from('bank_transactions')
      .select('amount, description, timestamp')
      .eq('user_id', userId)
      .ilike('category', `%${args.category}%`)
      .gte('timestamp', startDate.toISOString())
      .lt('amount', 0)
      .order('timestamp', { ascending: false })
      .limit(30);

    if (!transactions || transactions.length === 0) {
      return { message: `No transactions found in the "${args.category}" category.` };
    }

    const total = transactions.reduce((sum, tx) => sum + Math.abs(parseFloat(String(tx.amount))), 0);

    return {
      category: CATEGORY_LABELS[args.category] || args.category,
      period: `Last ${months} month${months > 1 ? 's' : ''}`,
      total: `£${total.toFixed(2)}`,
      transaction_count: transactions.length,
      transactions: transactions.slice(0, 15).map(tx => ({
        description: tx.description,
        amount: `£${Math.abs(parseFloat(String(tx.amount))).toFixed(2)}`,
        date: new Date(tx.timestamp).toLocaleDateString('en-GB'),
      })),
    };
  },
};

const searchTransactions: ChatTool = {
  name: 'search_transactions',
  description:
    'Search the user\'s bank transactions by description keyword (e.g. "Tesco", "Amazon", "Costa"). Returns matching transactions with amounts and dates.',
  input_schema: {
    type: 'object' as const,
    properties: {
      keyword: {
        type: 'string',
        description: 'The keyword to search for in transaction descriptions',
      },
      months: {
        type: 'number',
        description: 'Number of months to look back (default 3)',
      },
    },
    required: ['keyword'],
  },
  handler: async (args: { keyword: string; months?: number }, userId: string) => {
    const admin = getAdmin();
    const months = Math.min(args.months || 3, 6);
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data: transactions } = await admin
      .from('bank_transactions')
      .select('amount, description, category, timestamp')
      .eq('user_id', userId)
      .ilike('description', `%${args.keyword}%`)
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: false })
      .limit(20);

    if (!transactions || transactions.length === 0) {
      return { message: `No transactions found matching "${args.keyword}".` };
    }

    const totalSpent = transactions
      .filter(tx => parseFloat(String(tx.amount)) < 0)
      .reduce((sum, tx) => sum + Math.abs(parseFloat(String(tx.amount))), 0);

    return {
      keyword: args.keyword,
      matches: transactions.length,
      total_spent: `£${totalSpent.toFixed(2)}`,
      transactions: transactions.map(tx => ({
        description: tx.description,
        amount: `£${parseFloat(String(tx.amount)).toFixed(2)}`,
        date: new Date(tx.timestamp).toLocaleDateString('en-GB'),
        category: tx.category,
      })),
    };
  },
};

const getBudgets: ChatTool = {
  name: 'get_budgets',
  description:
    'Get the user\'s budget limits and current progress for each category. Shows how much they\'ve spent vs their budget this month.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  handler: async (_args: Record<string, never>, userId: string) => {
    const admin = getAdmin();

    const { data: budgets } = await admin
      .from('budgets')
      .select('category, monthly_limit, alert_threshold')
      .eq('user_id', userId);

    if (!budgets || budgets.length === 0) {
      return { message: 'No budgets set yet. You can set budgets by saying something like "Set my groceries budget to £400".' };
    }

    // Get current month spending per category
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const { data: transactions } = await admin
      .from('bank_transactions')
      .select('amount, category')
      .eq('user_id', userId)
      .gte('timestamp', monthStart)
      .lt('amount', 0);

    const categorySpend: Record<string, number> = {};
    for (const tx of (transactions || [])) {
      const cat = tx.category?.toLowerCase() || 'other';
      categorySpend[cat] = (categorySpend[cat] || 0) + Math.abs(parseFloat(String(tx.amount)));
    }

    return {
      budgets: budgets.map(b => {
        const spent = categorySpend[b.category] || 0;
        const limit = parseFloat(String(b.monthly_limit));
        const remaining = limit - spent;
        return {
          category: CATEGORY_LABELS[b.category] || b.category,
          monthly_limit: `£${limit.toFixed(2)}`,
          spent_this_month: `£${spent.toFixed(2)}`,
          remaining: `£${remaining.toFixed(2)}`,
          percentage_used: `${Math.min(100, Math.round((spent / limit) * 100))}%`,
          status: spent > limit ? 'over_budget' : spent > limit * 0.8 ? 'warning' : 'on_track',
        };
      }),
    };
  },
};

const setBudget: ChatTool = {
  name: 'set_budget',
  description:
    'Set or update a monthly budget limit for a spending category. The user should specify the category and the amount.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        description: 'The spending category (e.g. groceries, eating_out, shopping, fuel, streaming)',
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

    const { data, error } = await admin
      .from('budgets')
      .upsert({
        user_id: userId,
        category: args.category.toLowerCase(),
        monthly_limit: args.monthly_limit,
        alert_threshold: 80,
      }, { onConflict: 'user_id,category' })
      .select()
      .single();

    if (error) {
      return { error: error.message };
    }

    return {
      message: `Budget set: £${args.monthly_limit.toFixed(2)}/month for ${CATEGORY_LABELS[args.category] || args.category}.`,
      budget: data,
    };
  },
};

const getFinancialOverview: ChatTool = {
  name: 'get_financial_overview',
  description:
    'Get a complete financial overview: income, spending, subscriptions, upcoming renewals, and savings. Use this when the user asks general questions like "how am I doing financially?" or "give me an overview".',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: [],
  },
  handler: async (_args: Record<string, never>, userId: string) => {
    const admin = getAdmin();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [transactionsRes, subsRes, cancelledRes] = await Promise.all([
      admin.from('bank_transactions')
        .select('amount, timestamp')
        .eq('user_id', userId)
        .gte('timestamp', monthStart),
      admin.from('subscriptions')
        .select('provider_name, amount, billing_cycle, status, contract_end_date, next_billing_date')
        .eq('user_id', userId)
        .eq('status', 'active')
        .is('dismissed_at', null),
      admin.from('subscriptions')
        .select('money_saved')
        .eq('user_id', userId)
        .eq('status', 'cancelled'),
    ]);

    const transactions = transactionsRes.data || [];
    const subs = subsRes.data || [];

    const monthlyIncome = transactions
      .filter(tx => parseFloat(String(tx.amount)) > 0)
      .reduce((sum, tx) => sum + parseFloat(String(tx.amount)), 0);

    const monthlySpend = transactions
      .filter(tx => parseFloat(String(tx.amount)) < 0)
      .reduce((sum, tx) => sum + Math.abs(parseFloat(String(tx.amount))), 0);

    const subscriptionMonthly = subs.reduce((sum, s) => {
      const amt = parseFloat(String(s.amount)) || 0;
      if (s.billing_cycle === 'yearly') return sum + amt / 12;
      if (s.billing_cycle === 'quarterly') return sum + amt / 3;
      return sum + amt;
    }, 0);

    const expiringSoon = subs.filter(s =>
      s.contract_end_date &&
      new Date(s.contract_end_date) >= now &&
      new Date(s.contract_end_date) <= thirtyDays
    );

    const totalSaved = (cancelledRes.data || []).reduce(
      (sum, s) => sum + (parseFloat(String(s.money_saved)) || 0), 0
    );

    return {
      this_month: {
        income: `£${monthlyIncome.toFixed(2)}`,
        spending: `£${monthlySpend.toFixed(2)}`,
        net: `£${(monthlyIncome - monthlySpend).toFixed(2)}`,
      },
      subscriptions: {
        active_count: subs.length,
        monthly_cost: `£${subscriptionMonthly.toFixed(2)}`,
        annual_cost: `£${(subscriptionMonthly * 12).toFixed(2)}`,
      },
      contracts_expiring_soon: expiringSoon.map(s => ({
        provider: s.provider_name,
        end_date: s.contract_end_date,
        amount: `£${parseFloat(String(s.amount)).toFixed(2)}`,
      })),
      total_money_saved: `£${totalSaved.toFixed(2)}`,
    };
  },
};

export const moneyHubTools: ChatTool[] = [
  getSpendingSummary,
  getSpendingByCategory,
  searchTransactions,
  getBudgets,
  setBudget,
  getFinancialOverview,
];
