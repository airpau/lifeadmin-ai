import { createClient } from '@supabase/supabase-js';

const getAdmin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

/* ------------------------------------------------------------------ */
/*  Shared types                                                       */
/* ------------------------------------------------------------------ */

export interface CategorySpend {
  category: string;
  total: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string;       // YYYY-MM
  spend: number;
  income: number;
}

export interface MerchantSpend {
  name: string;
  total: number;
  count: number;
}

export interface AnnualReportData {
  year: number;
  generatedAt: string;
  memberSince: string;
  daysAsMember: number;

  // Money
  totalMoneyRecovered: number;    // tasks.money_recovered + subscriptions.money_saved
  taskMoneyRecovered: number;
  subsMoneySaved: number;

  // Subscriptions
  subscriptionsCancelled: number;
  annualSavingsFromCancellations: number;
  activeSubscriptions: number;
  monthlySubscriptionCost: number;

  // Complaints
  complaintsGenerated: number;

  // Spending
  spendingByCategory: CategorySpend[];
  monthlyTrends: MonthlyTrend[];
  totalIncome: number;
  totalOutgoings: number;
  topMerchants: MerchantSpend[];

  // Deals
  dealClicks: number;

  // Challenges & loyalty
  challengesCompleted: number;
  pointsEarned: number;
  loyaltyTier: string;
  totalPoints: number;

  // Profile
  profileCompleteness: number;

  // Composite score
  moneyRecoveryScore: number;
}

export interface OnDemandReportData {
  generatedAt: string;

  // Current month spending
  currentMonthSpend: number;
  currentMonthIncome: number;
  currentMonth: string;          // e.g. "March 2026"

  // Subscriptions
  activeSubscriptions: number;
  monthlySubscriptionTotal: number;

  // Recent complaints (last 3 months)
  recentComplaints: number;

  // Budgets
  budgets: Array<{
    category: string;
    limit: number;
    spent: number;
    remaining: number;
  }>;

  // Money Recovery Score
  moneyRecoveryScore: number;

  // Upcoming renewals (next 30 days)
  upcomingRenewals: Array<{
    provider: string;
    amount: number;
    date: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Annual report generator                                            */
/* ------------------------------------------------------------------ */

export async function generateAnnualReportData(
  userId: string,
  year: number
): Promise<AnnualReportData> {
  const admin = getAdmin();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31T23:59:59`;

  // Run all queries in parallel
  const [
    profileRes,
    cancelledSubsRes,
    activeSubsRes,
    tasksRes,
    agentRunsRes,
    transactionsRes,
    dealClicksRes,
    challengesRes,
    pointsRes,
  ] = await Promise.all([
    // Profile
    admin.from('profiles')
      .select('full_name, phone, address, postcode, created_at')
      .eq('id', userId)
      .single(),

    // Cancelled subscriptions in the year
    admin.from('subscriptions')
      .select('provider_name, amount, billing_cycle, money_saved, cancelled_at')
      .eq('user_id', userId)
      .eq('status', 'cancelled')
      .gte('cancelled_at', yearStart)
      .lte('cancelled_at', yearEnd),

    // Active subscriptions
    admin.from('subscriptions')
      .select('provider_name, amount, billing_cycle')
      .eq('user_id', userId)
      .eq('status', 'active'),

    // Tasks with money_recovered
    admin.from('tasks')
      .select('money_recovered, created_at')
      .eq('user_id', userId)
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd),

    // Agent runs (complaint letters) in the year
    admin.from('agent_runs')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_type', 'complaint')
      .eq('status', 'completed')
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd),

    // Bank transactions for the year
    admin.from('bank_transactions')
      .select('amount, description, category, timestamp')
      .eq('user_id', userId)
      .gte('timestamp', yearStart)
      .lte('timestamp', yearEnd),

    // Deal clicks
    admin.from('deal_clicks')
      .select('id')
      .eq('user_id', userId)
      .gte('clicked_at', yearStart)
      .lte('clicked_at', yearEnd),

    // Completed challenges
    admin.from('user_challenges')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', yearStart)
      .lte('completed_at', yearEnd),

    // Points / loyalty
    admin.from('user_points')
      .select('balance, lifetime_earned, loyalty_tier')
      .eq('user_id', userId)
      .single(),
  ]);

  const profile = profileRes.data;
  const cancelledSubs = cancelledSubsRes.data || [];
  const activeSubs = activeSubsRes.data || [];
  const tasks = tasksRes.data || [];
  const agentRuns = agentRunsRes.data || [];
  const transactions = transactionsRes.data || [];
  const dealClicks = dealClicksRes.data || [];
  const challenges = challengesRes.data || [];
  const points = pointsRes.data;

  // --- Calculations ---

  // Money recovered
  const taskMoneyRecovered = tasks.reduce(
    (sum, t) => sum + (parseFloat(String(t.money_recovered)) || 0), 0
  );
  const subsMoneySaved = cancelledSubs.reduce(
    (sum, s) => sum + (parseFloat(String(s.money_saved)) || 0), 0
  );
  const totalMoneyRecovered = taskMoneyRecovered + subsMoneySaved;

  // Annual savings from cancellations
  const annualSavingsFromCancellations = cancelledSubs.reduce((sum, s) => {
    const amt = parseFloat(String(s.amount)) || 0;
    const cycle = s.billing_cycle;
    if (cycle === 'yearly') return sum + amt;
    return sum + amt * 12; // monthly -> annual
  }, 0);

  // Active subscription cost
  const monthlySubscriptionCost = activeSubs.reduce((sum, s) => {
    const amt = parseFloat(String(s.amount)) || 0;
    if (s.billing_cycle === 'yearly') return sum + amt / 12;
    return sum + amt;
  }, 0);

  // Spending by category
  const debits = transactions
    .filter((tx) => parseFloat(String(tx.amount)) < 0)
    .map((tx) => ({
      ...tx,
      amount: Math.abs(parseFloat(String(tx.amount))),
    }));
  const credits = transactions
    .filter((tx) => parseFloat(String(tx.amount)) > 0)
    .map((tx) => ({
      ...tx,
      amount: parseFloat(String(tx.amount)),
    }));

  const totalOutgoings = debits.reduce((sum, tx) => sum + tx.amount, 0);
  const totalIncome = credits.reduce((sum, tx) => sum + tx.amount, 0);

  const categoryTotals: Record<string, number> = {};
  for (const tx of debits) {
    const cat = tx.category || 'other';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + tx.amount;
  }
  const spendingByCategory: CategorySpend[] = Object.entries(categoryTotals)
    .map(([category, total]) => ({
      category,
      total: parseFloat(total.toFixed(2)),
      percentage: totalOutgoings > 0
        ? parseFloat(((total / totalOutgoings) * 100).toFixed(1))
        : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Monthly trends
  const monthlyMap: Record<string, { spend: number; income: number }> = {};
  for (let m = 0; m < 12; m++) {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    monthlyMap[key] = { spend: 0, income: 0 };
  }
  for (const tx of debits) {
    const key = tx.timestamp?.substring(0, 7);
    if (key && monthlyMap[key]) monthlyMap[key].spend += tx.amount;
  }
  for (const tx of credits) {
    const key = tx.timestamp?.substring(0, 7);
    if (key && monthlyMap[key]) monthlyMap[key].income += tx.amount;
  }
  const monthlyTrends: MonthlyTrend[] = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month,
      spend: parseFloat(vals.spend.toFixed(2)),
      income: parseFloat(vals.income.toFixed(2)),
    }));

  // Top 5 merchants
  const merchantMap: Record<string, { total: number; count: number }> = {};
  for (const tx of debits) {
    const name = tx.description || 'Unknown';
    if (!merchantMap[name]) merchantMap[name] = { total: 0, count: 0 };
    merchantMap[name].total += tx.amount;
    merchantMap[name].count += 1;
  }
  const topMerchants: MerchantSpend[] = Object.entries(merchantMap)
    .map(([name, v]) => ({
      name,
      total: parseFloat(v.total.toFixed(2)),
      count: v.count,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Profile completeness
  const profileFields = [
    profile?.full_name,
    profile?.phone,
    profile?.address,
    profile?.postcode,
  ];
  const filledFields = profileFields.filter(Boolean).length;
  const profileCompleteness = Math.round((filledFields / profileFields.length) * 100);

  // Days as member
  const createdAt = profile?.created_at ? new Date(profile.created_at) : new Date();
  const daysAsMember = Math.floor(
    (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Money Recovery Score = total money recovered + annual savings from cancellations
  const moneyRecoveryScore = parseFloat(
    (totalMoneyRecovered + annualSavingsFromCancellations).toFixed(2)
  );

  return {
    year,
    generatedAt: new Date().toISOString(),
    memberSince: createdAt.toISOString(),
    daysAsMember,
    totalMoneyRecovered: parseFloat(totalMoneyRecovered.toFixed(2)),
    taskMoneyRecovered: parseFloat(taskMoneyRecovered.toFixed(2)),
    subsMoneySaved: parseFloat(subsMoneySaved.toFixed(2)),
    subscriptionsCancelled: cancelledSubs.length,
    annualSavingsFromCancellations: parseFloat(annualSavingsFromCancellations.toFixed(2)),
    activeSubscriptions: activeSubs.length,
    monthlySubscriptionCost: parseFloat(monthlySubscriptionCost.toFixed(2)),
    complaintsGenerated: agentRuns.length,
    spendingByCategory,
    monthlyTrends,
    totalIncome: parseFloat(totalIncome.toFixed(2)),
    totalOutgoings: parseFloat(totalOutgoings.toFixed(2)),
    topMerchants,
    dealClicks: dealClicks.length,
    challengesCompleted: challenges.length,
    pointsEarned: points?.lifetime_earned || 0,
    loyaltyTier: points?.loyalty_tier || 'Bronze',
    totalPoints: points?.balance || 0,
    profileCompleteness,
    moneyRecoveryScore,
  };
}

/* ------------------------------------------------------------------ */
/*  On-demand report generator                                         */
/* ------------------------------------------------------------------ */

export async function generateOnDemandReportData(
  userId: string
): Promise<OnDemandReportData> {
  const admin = getAdmin();
  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [
    activeSubsRes,
    transactionsRes,
    complaintsRes,
    budgetsRes,
    renewalsRes,
    profileRes,
  ] = await Promise.all([
    // Active subscriptions
    admin.from('subscriptions')
      .select('provider_name, amount, billing_cycle')
      .eq('user_id', userId)
      .eq('status', 'active'),

    // Current month transactions
    admin.from('bank_transactions')
      .select('amount, timestamp')
      .eq('user_id', userId)
      .gte('timestamp', currentMonthStart),

    // Recent complaints (last 3 months)
    admin.from('agent_runs')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_type', 'complaint')
      .eq('status', 'completed')
      .gte('created_at', threeMonthsAgo.toISOString()),

    // Budgets
    admin.from('money_hub_budgets')
      .select('category, monthly_limit')
      .eq('user_id', userId),

    // Upcoming renewals (next 30 days)
    admin.from('subscriptions')
      .select('provider_name, amount, next_billing_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('next_billing_date', now.toISOString().substring(0, 10))
      .lte('next_billing_date', thirtyDaysFromNow.toISOString().substring(0, 10)),

    // Profile for money recovered
    admin.from('profiles')
      .select('total_money_recovered')
      .eq('id', userId)
      .single(),
  ]);

  const activeSubs = activeSubsRes.data || [];
  const transactions = transactionsRes.data || [];
  const complaints = complaintsRes.data || [];
  const budgets = budgetsRes.data || [];
  const renewals = renewalsRes.data || [];

  // Current month spending
  const debits = transactions.filter((tx) => parseFloat(String(tx.amount)) < 0);
  const credits = transactions.filter((tx) => parseFloat(String(tx.amount)) > 0);
  const currentMonthSpend = debits.reduce(
    (sum, tx) => sum + Math.abs(parseFloat(String(tx.amount))), 0
  );
  const currentMonthIncome = credits.reduce(
    (sum, tx) => sum + parseFloat(String(tx.amount)), 0
  );

  // Monthly subscription total
  const monthlySubscriptionTotal = activeSubs.reduce((sum, s) => {
    const amt = parseFloat(String(s.amount)) || 0;
    if (s.billing_cycle === 'yearly') return sum + amt / 12;
    return sum + amt;
  }, 0);

  // Budget status - fetch current month spending by category
  const budgetStatus = budgets.map((b) => ({
    category: b.category,
    limit: parseFloat(String(b.monthly_limit)) || 0,
    spent: 0, // Would need category-level aggregation from transactions
    remaining: parseFloat(String(b.monthly_limit)) || 0,
  }));

  // Upcoming renewals
  const upcomingRenewals = renewals.map((r) => ({
    provider: r.provider_name || 'Unknown',
    amount: parseFloat(String(r.amount)) || 0,
    date: r.next_billing_date,
  }));

  const moneyRecoveryScore = parseFloat(
    String(profileRes.data?.total_money_recovered || 0)
  );

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return {
    generatedAt: now.toISOString(),
    currentMonthSpend: parseFloat(currentMonthSpend.toFixed(2)),
    currentMonthIncome: parseFloat(currentMonthIncome.toFixed(2)),
    currentMonth: monthLabel,
    activeSubscriptions: activeSubs.length,
    monthlySubscriptionTotal: parseFloat(monthlySubscriptionTotal.toFixed(2)),
    recentComplaints: complaints.length,
    budgets: budgetStatus,
    moneyRecoveryScore,
    upcomingRenewals,
  };
}
