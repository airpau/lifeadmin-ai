import { createClient } from '@supabase/supabase-js';
import { normaliseMerchantName, categoriseTransaction } from '@/lib/merchant-normalise';
import { cleanMerchantName, isLoanOrMortgage, getReportCategoryLabel, getSwitchDifficulty } from '@/lib/merchant-utils';
import { calculateHealthScore, type HealthScore } from '@/lib/financial-health-score';

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
  label: string;
  total: number;
  percentage: number;
  transactionCount: number;
}

export interface MonthlyTrend {
  month: string;       // YYYY-MM
  monthLabel: string;  // "Jan", "Feb" etc.
  spend: number;
  income: number;
  hasData: boolean;
}

export interface MerchantSpend {
  name: string;
  total: number;
  count: number;
}

export interface SubscriptionWithGuidance {
  id: string;
  name: string;
  category: string;
  monthlyCost: number;
  annualCost: number;
  status: string;
  priceChange?: { oldAmount: number; newAmount: number; pctChange: number } | null;
  guidance: {
    type: 'switch' | 'cancel' | 'complain' | 'competitive';
    message: string;
    actionUrl: string;
    annualSaving?: number;
    dealProvider?: string;
  };
}

export interface SavingsAction {
  action: 'switch' | 'cancel' | 'complain' | 'negotiate';
  provider: string;
  description: string;
  monthlySaving: number;
  annualSaving: number;
  actionUrl: string;
  difficulty: 'easy' | 'medium' | 'hard';
  difficultyEmoji: string;
}

export interface RenewalItem {
  provider: string;
  amount: number;
  date: string;
  isRenewal: boolean; // true = contract renewal, false = regular payment
}

export interface PriceAlertItem {
  id: string;
  merchantName: string;
  oldAmount: number;
  newAmount: number;
  pctChange: number;
  annualImpact: number;
  status: string;
}

export interface DisputeItem {
  id: string;
  company: string;
  issue: string;
  dateFiled: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  On-demand (Quick Summary) types                                    */
/* ------------------------------------------------------------------ */

export interface OnDemandReportData {
  generatedAt: string;
  currentMonth: string;

  // Section 1: Financial Health Score
  financialHealth: HealthScore;

  // Section 2: Money Snapshot
  currentMonthSpend: number;
  currentMonthIncome: number;
  netPosition: number;

  // Section 3: Subscription Overview
  totalMonthlyCost: number;
  totalSubscriptions: number;
  potentialAnnualSavings: number;
  topSubscriptions: SubscriptionWithGuidance[];

  // Section 4: Alerts & Actions
  priceAlertCount: number;
  priceAlertAnnualCost: number;
  priceAlerts: PriceAlertItem[];
  upcomingRenewals: RenewalItem[];
  activeDisputeCount: number;
  disputes: DisputeItem[];
  pendingActionCount: number;

  // Section 5: Savings Plan
  savingsActions: SavingsAction[];
  totalPotentialSaving: number;
}

/* ------------------------------------------------------------------ */
/*  Annual report types                                                */
/* ------------------------------------------------------------------ */

export interface AnnualReportData {
  year: number;
  generatedAt: string;
  memberSince: string;
  daysAsMember: number;
  userName: string;
  userPlan: string;

  // Executive Summary
  executiveSummary: string;

  // Financial Health
  financialHealth: HealthScore;

  // Income & Spending
  totalIncome: number;
  totalOutgoings: number;
  netPosition: number;
  monthlyTrends: MonthlyTrend[];

  // Spending by Category
  spendingByCategory: CategorySpend[];

  // Subscriptions
  activeSubscriptions: number;
  monthlySubscriptionCost: number;
  annualSubscriptionCost: number;
  subscriptionsList: SubscriptionWithGuidance[];

  // Price Increases
  priceAlerts: PriceAlertItem[];
  totalPriceIncreaseImpact: number;

  // Savings
  potentialAnnualSavings: number;
  savingsActions: SavingsAction[];

  // Disputes
  totalDisputes: number;
  disputes: DisputeItem[];

  // Connected Accounts
  connectedBanks: Array<{ name: string; status: string }>;
  connectedEmails: Array<{ email: string; provider: string }>;
  profileCompleteness: number;
  dataMonths: number; // how many months of tx data

  // Top merchants
  topMerchants: MerchantSpend[];

  // Legacy fields for backwards compat with PDF & sample
  subscriptionsCancelled: number;
  annualSavingsFromCancellations: number;
  complaintsGenerated: number;
  totalMoneyRecovered: number;
  taskMoneyRecovered: number;
  subsMoneySaved: number;
  dealClicks: number;
  challengesCompleted: number;
  pointsEarned: number;
  loyaltyTier: string;
  totalPoints: number;
  profileCompletenessNum: number;
  moneyRecoveryScore: number;
}

/* ------------------------------------------------------------------ */
/*  Deals data for comparison                                          */
/* ------------------------------------------------------------------ */

interface DealForComparison {
  provider: string;
  headline: string;
  monthlyPrice: number;
  awinMid: string;
  providerUrl: string;
  category: string;
}

const AWIN_AFF_ID = '2825812';

function buildAwinUrl(awinMid: string, providerUrl: string): string {
  return `https://www.awin1.com/cread.php?awinmid=${awinMid}&awinaffid=${AWIN_AFF_ID}&ued=${encodeURIComponent(providerUrl)}`;
}

// Inline key deals for quick comparison (from comparison-engine.ts)
const DEALS_BY_CATEGORY: Record<string, DealForComparison[]> = {
  energy: [
    { provider: 'OVO Energy', headline: 'Fixed rate', monthlyPrice: 110, awinMid: '5318', providerUrl: 'https://www.ovoenergy.com', category: 'energy' },
    { provider: 'EDF', headline: 'Fixed price tariffs', monthlyPrice: 115, awinMid: '1887', providerUrl: 'https://www.edfenergy.com', category: 'energy' },
    { provider: 'MoneySuperMarket', headline: 'Compare all suppliers', monthlyPrice: 100, awinMid: '22713', providerUrl: 'https://www.moneysupermarket.com/gas-and-electricity/', category: 'energy' },
  ],
  broadband: [
    { provider: 'Community Fibre', headline: 'London full fibre', monthlyPrice: 25, awinMid: '19595', providerUrl: 'https://communityfibre.co.uk', category: 'broadband' },
    { provider: 'Sky', headline: 'Ultrafast broadband', monthlyPrice: 30, awinMid: '11005', providerUrl: 'https://www.sky.com/shop/broadband', category: 'broadband' },
    { provider: 'TalkTalk', headline: 'Budget broadband', monthlyPrice: 22, awinMid: '5765', providerUrl: 'https://www.talktalk.co.uk/shop/broadband', category: 'broadband' },
  ],
  mobile: [
    { provider: 'Lebara', headline: 'SIM-only from £5', monthlyPrice: 5, awinMid: '30681', providerUrl: 'https://www.lebara.co.uk/en/best-sim-only-deals.html', category: 'mobile' },
    { provider: 'iD Mobile', headline: 'SIM-only from £6', monthlyPrice: 8, awinMid: '6366', providerUrl: 'https://www.idmobile.co.uk', category: 'mobile' },
    { provider: 'SMARTY', headline: 'No contract', monthlyPrice: 10, awinMid: '10933', providerUrl: 'https://smarty.co.uk', category: 'mobile' },
  ],
  insurance: [
    { provider: 'Compare the Market', headline: 'Compare 100+ insurers', monthlyPrice: 0, awinMid: '3738', providerUrl: 'https://www.comparethemarket.com', category: 'insurance' },
    { provider: 'MoneySuperMarket', headline: 'Car, home and life', monthlyPrice: 0, awinMid: '12049', providerUrl: 'https://www.moneysupermarket.com/car-insurance/', category: 'insurance' },
  ],
};

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

/* ------------------------------------------------------------------ */
/*  Helper: normalise sub category to deals category                   */
/* ------------------------------------------------------------------ */
function subCategoryToDealCategory(category?: string | null, providerName?: string | null): string | null {
  if (!category && !providerName) return null;
  const cat = (category || '').toLowerCase();

  const categoryMap: Record<string, string> = {
    energy: 'energy', broadband: 'broadband', mobile: 'mobile',
    insurance: 'insurance', streaming: 'streaming', fitness: 'fitness',
  };
  if (categoryMap[cat]) return categoryMap[cat];

  // Check provider name keywords
  if (providerName) {
    const n = providerName.toLowerCase();
    if (['energy', 'gas', 'electric', 'british gas', 'octopus', 'ovo', 'edf', 'eon'].some(k => n.includes(k))) return 'energy';
    if (['broadband', 'fibre', 'bt ', 'sky broadband', 'virgin media', 'talktalk'].some(k => n.includes(k))) return 'broadband';
    if (['mobile', 'vodafone', 'three', 'o2', 'ee', 'giffgaff', 'lebara'].some(k => n.includes(k))) return 'mobile';
    if (['insurance', 'aviva', 'admiral', 'direct line'].some(k => n.includes(k))) return 'insurance';
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Helper: find the cheapest deal for a subscription                  */
/* ------------------------------------------------------------------ */
function findCheaperDeal(
  providerName: string,
  monthlyCost: number,
  category: string | null,
): { dealProvider: string; dealPrice: number; annualSaving: number; dealUrl: string } | null {
  if (!category || !DEALS_BY_CATEGORY[category]) return null;
  const deals = DEALS_BY_CATEGORY[category];

  let best: typeof deals[0] | null = null;
  let bestSaving = 0;

  for (const deal of deals) {
    if (deal.monthlyPrice <= 0) continue;
    if (deal.provider.toLowerCase() === providerName.toLowerCase()) continue;
    const saving = (monthlyCost - deal.monthlyPrice) * 12;
    if (saving > 24 && saving > bestSaving) {
      best = deal;
      bestSaving = saving;
    }
  }

  if (!best) return null;
  return {
    dealProvider: best.provider,
    dealPrice: best.monthlyPrice,
    annualSaving: Math.round(bestSaving),
    dealUrl: buildAwinUrl(best.awinMid, best.providerUrl),
  };
}

/* ------------------------------------------------------------------ */
/*  On-demand report generator (Quick Summary)                         */
/* ------------------------------------------------------------------ */

export async function generateOnDemandReportData(
  userId: string
): Promise<OnDemandReportData> {
  const admin = getAdmin();
  const now = new Date();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [
    profileRes,
    activeSubsRes,
    transactionsRes,
    disputesRes,
    priceAlertsRes,
    renewalsRes,
    bankConnsRes,
    emailConnsRes,
    pendingTasksRes,
    allPriceAlertsRes,
  ] = await Promise.all([
    // Profile
    admin.from('profiles')
      .select('full_name, first_name, last_name, phone, address, postcode, email, total_money_recovered, subscription_tier')
      .eq('id', userId)
      .single(),

    // Active subscriptions — include extra fields
    admin.from('subscriptions')
      .select('id, provider_name, company, amount, billing_cycle, category, category_normalized, status, next_billing_date, contract_end_date')
      .eq('user_id', userId)
      .eq('status', 'active'),

    admin.from('bank_transactions')
      .select('amount, description, category, timestamp, merchant_name, user_category, id')
      .eq('user_id', userId)
      .gte('timestamp', currentMonthStart),

    admin.from('disputes')
      .select('id, provider_name, company_name, description, status, created_at, disputed_amount, money_recovered')
      .eq('user_id', userId),

    // Active price increase alerts
    admin.from('price_increase_alerts')
      .select('id, merchant_name, old_amount, new_amount, percentage_increase, annual_impact, status')
      .eq('user_id', userId)
      .eq('status', 'active'),

    // Upcoming renewals (next 30 days)
    admin.from('subscriptions')
      .select('provider_name, company, amount, next_billing_date, category, category_normalized, contract_end_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('next_billing_date', now.toISOString().substring(0, 10))
      .lte('next_billing_date', thirtyDaysFromNow.toISOString().substring(0, 10)),

    // Bank connections
    admin.from('bank_connections')
      .select('id, bank_name, status')
      .eq('user_id', userId),

    admin.from('email_connections')
      .select('id, email_address, provider_type, status')
      .eq('user_id', userId)
      .eq('status', 'active'),

    // Pending action items
    admin.from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending_review'),

    // All price alerts (for score calculation)
    admin.from('price_increase_alerts')
      .select('id, status')
      .eq('user_id', userId),
  ]);

  const profile = profileRes.data;
  const activeSubs = activeSubsRes.data || [];
  const transactions = transactionsRes.data || [];
  const disputes = disputesRes.data || [];
  const priceAlerts = priceAlertsRes.data || [];
  const renewals = renewalsRes.data || [];
  const bankConns = bankConnsRes.data || [];
  const emailConns = emailConnsRes.data || [];
  const allPriceAlerts = allPriceAlertsRes.data || [];

  // --- Money Snapshot ---
  const validDebits = transactions
    .filter(tx => parseFloat(String(tx.amount)) < 0)
    .map(tx => ({
      ...tx,
      amount: Math.abs(parseFloat(String(tx.amount))),
      meaningfulCategory: tx.user_category || categoriseTransaction(tx.merchant_name || tx.description || '', tx.category || ''),
    }))
    .filter(tx => tx.meaningfulCategory !== 'transfers' && tx.meaningfulCategory !== 'internal');

  const validCredits = transactions
    .filter(tx => parseFloat(String(tx.amount)) > 0)
    .map(tx => ({
      ...tx,
      amount: parseFloat(String(tx.amount)),
      meaningfulCategory: tx.user_category || categoriseTransaction(tx.merchant_name || tx.description || '', tx.category || ''),
    }))
    .filter(tx => tx.meaningfulCategory !== 'transfers' && tx.meaningfulCategory !== 'internal');

  const currentMonthSpend = validDebits.reduce((sum, tx) => sum + tx.amount, 0);
  const currentMonthIncome = validCredits.reduce((sum, tx) => sum + tx.amount, 0);
  const netPosition = currentMonthIncome - currentMonthSpend;

  // --- Subscription overview ---
  const totalMonthlyCost = activeSubs.reduce((sum, s) => {
    const amt = parseFloat(String(s.amount)) || 0;
    if (s.billing_cycle === 'yearly') return sum + amt / 12;
    if (s.billing_cycle === 'quarterly') return sum + amt / 3;
    return sum + amt;
  }, 0);

  // Build subscription guidance
  let potentialAnnualSavings = 0;
  let subsWithCheaperDeal = 0;
  const topSubscriptions: SubscriptionWithGuidance[] = activeSubs
    .map(s => {
      const amt = parseFloat(String(s.amount)) || 0;
      const monthlyCost = s.billing_cycle === 'yearly' ? amt / 12 : s.billing_cycle === 'quarterly' ? amt / 3 : amt;
      const annualCost = monthlyCost * 12;
      const displayName = cleanMerchantName(s.provider_name, s.company);
      const dealCat = subCategoryToDealCategory(s.category || s.category_normalized, s.provider_name);
      const cheaperDeal = findCheaperDeal(displayName, monthlyCost, dealCat);

      // Check for price increase on this sub
      const matchingAlert = priceAlerts.find(a =>
        normaliseMerchantName(a.merchant_name).toLowerCase() === displayName.toLowerCase()
      );

      let guidance: SubscriptionWithGuidance['guidance'];

      if (cheaperDeal) {
        subsWithCheaperDeal++;
        potentialAnnualSavings += cheaperDeal.annualSaving;
        guidance = {
          type: 'switch',
          message: `Switch to ${cheaperDeal.dealProvider} and save £${Math.round(cheaperDeal.annualSaving / 12)}/month (£${cheaperDeal.annualSaving}/yr)`,
          actionUrl: cheaperDeal.dealUrl,
          annualSaving: cheaperDeal.annualSaving,
          dealProvider: cheaperDeal.dealProvider,
        };
      } else if (matchingAlert) {
        const impact = parseFloat(String(matchingAlert.annual_impact)) || 0;
        guidance = {
          type: 'complain',
          message: `Price went up ${parseFloat(String(matchingAlert.percentage_increase)).toFixed(1)}%. Write a complaint to negotiate it back down`,
          actionUrl: `/dashboard/complaints?company=${encodeURIComponent(displayName)}&issue=${encodeURIComponent(`Price increase of ${parseFloat(String(matchingAlert.percentage_increase)).toFixed(1)}%`)}&amount=${impact}`,
          annualSaving: impact,
        };
      } else {
        guidance = {
          type: 'competitive',
          message: '✓ Good value — no cheaper alternatives found',
          actionUrl: '/dashboard/deals',
        };
      }

      return {
        id: s.id,
        name: displayName,
        category: s.category || s.category_normalized || 'other',
        monthlyCost: parseFloat(monthlyCost.toFixed(2)),
        annualCost: parseFloat(annualCost.toFixed(2)),
        status: s.status,
        priceChange: matchingAlert ? {
          oldAmount: parseFloat(String(matchingAlert.old_amount)),
          newAmount: parseFloat(String(matchingAlert.new_amount)),
          pctChange: parseFloat(String(matchingAlert.percentage_increase)),
        } : null,
        guidance,
      };
    })
    .sort((a, b) => b.monthlyCost - a.monthlyCost)
    .slice(0, 5);

  // --- Price alerts ---
  const priceAlertItems: PriceAlertItem[] = priceAlerts.map(a => ({
    id: a.id,
    merchantName: normaliseMerchantName(a.merchant_name),
    oldAmount: parseFloat(String(a.old_amount)),
    newAmount: parseFloat(String(a.new_amount)),
    pctChange: parseFloat(String(a.percentage_increase)),
    annualImpact: parseFloat(String(a.annual_impact)),
    status: a.status,
  }));
  const priceAlertAnnualCost = priceAlertItems.reduce((sum, a) => sum + a.annualImpact, 0);

  // --- Upcoming renewals (filter out loans/mortgages) ---
  const filteredRenewals: RenewalItem[] = renewals
    .filter(r => !isLoanOrMortgage(r.category || r.category_normalized, r.provider_name))
    .map(r => ({
      provider: cleanMerchantName(r.provider_name, r.company),
      amount: parseFloat(String(r.amount)) || 0,
      date: r.next_billing_date,
      isRenewal: !!r.contract_end_date,
    }));

  // --- Disputes ---
  const disputeItems: DisputeItem[] = disputes.map(d => ({
    id: d.id,
    company: d.provider_name || d.company_name || 'Unknown',
    issue: (d.description || `Dispute for ${d.disputed_amount ? '£'+d.disputed_amount : 'unknown amount'}`).substring(0, 100),
    dateFiled: d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB') : '',
    status: d.status || 'open',
  }));
  const activeDisputeCount = disputes.filter(d => d.status === 'open' || d.status === 'in_progress' || d.status === 'awaiting_response').length;

  // --- Financial Health Score ---
  const activeBanks = bankConns.filter(b => b.status === 'active').length;
  const activeEmails = emailConns.filter(e => e.status === 'active').length;
  const actionedAlerts = allPriceAlerts.filter(a => a.status === 'actioned').length;

  const financialHealth = calculateHealthScore({
    monthlyIncome: currentMonthIncome,
    monthlyOutgoings: currentMonthSpend,
    budgets: [],
    monthlyTrends: [],
    liquidSavings: 0,
    goals: [],
    totalMonthlyDebtPayments: 0,
    totalDebt: 0,
    previousMonthDebt: 0,
    creditCardBalance: 0,
    creditCardLimit: 0,
    expectedBillsPaid: activeSubs.length,
    expectedBillsTotal: activeSubs.length,
    contractsTracked: activeSubs.length,
    contractsTotal: activeSubs.length,
    alertsActioned: actionedAlerts,
    alertsTotal: allPriceAlerts.length,
  });

  // --- Savings plan ---
  const savingsActions: SavingsAction[] = [];

  // Add switch opportunities from top subscriptions
  for (const sub of activeSubs) {
    const amt = parseFloat(String(sub.amount)) || 0;
    const monthlyCost = sub.billing_cycle === 'yearly' ? amt / 12 : sub.billing_cycle === 'quarterly' ? amt / 3 : amt;
    const displayName = cleanMerchantName(sub.provider_name, sub.company);
    const dealCat = subCategoryToDealCategory(sub.category || sub.category_normalized, sub.provider_name);
    const cheaperDeal = findCheaperDeal(displayName, monthlyCost, dealCat);

    if (cheaperDeal) {
      savingsActions.push({
        action: 'switch',
        provider: displayName,
        description: `Switch to ${cheaperDeal.dealProvider}`,
        monthlySaving: Math.round(monthlyCost - cheaperDeal.dealPrice),
        annualSaving: cheaperDeal.annualSaving,
        actionUrl: cheaperDeal.dealUrl,
        difficulty: getSwitchDifficulty(sub.category || sub.category_normalized),
        difficultyEmoji: getSwitchDifficulty(sub.category || sub.category_normalized) === 'easy' ? '🟢' : getSwitchDifficulty(sub.category || sub.category_normalized) === 'medium' ? '🟡' : '🔴',
      });
    }
  }

  // Add price increase complaints
  for (const alert of priceAlertItems) {
    savingsActions.push({
      action: 'complain',
      provider: alert.merchantName,
      description: `Complain about ${alert.pctChange.toFixed(1)}% price increase`,
      monthlySaving: Math.round(alert.annualImpact / 12),
      annualSaving: Math.round(alert.annualImpact),
      actionUrl: `/dashboard/complaints?company=${encodeURIComponent(alert.merchantName)}&issue=${encodeURIComponent(`Price increase of ${alert.pctChange.toFixed(1)}%`)}&amount=${alert.annualImpact}`,
      difficulty: 'medium',
      difficultyEmoji: '🟡',
    });
  }

  // Sort by annual saving descending
  savingsActions.sort((a, b) => b.annualSaving - a.annualSaving);

  const totalPotentialSaving = savingsActions.reduce((sum, a) => sum + a.annualSaving, 0);

  const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return {
    generatedAt: now.toISOString(),
    currentMonth: monthLabel,
    financialHealth,
    currentMonthSpend: parseFloat(currentMonthSpend.toFixed(2)),
    currentMonthIncome: parseFloat(currentMonthIncome.toFixed(2)),
    netPosition: parseFloat(netPosition.toFixed(2)),
    totalMonthlyCost: parseFloat(totalMonthlyCost.toFixed(2)),
    totalSubscriptions: activeSubs.length,
    potentialAnnualSavings: parseFloat(potentialAnnualSavings.toFixed(2)),
    topSubscriptions,
    priceAlertCount: priceAlerts.length,
    priceAlertAnnualCost: parseFloat(priceAlertAnnualCost.toFixed(2)),
    priceAlerts: priceAlertItems,
    upcomingRenewals: filteredRenewals,
    activeDisputeCount,
    disputes: disputeItems,
    pendingActionCount: pendingTasksRes.count || 0,
    savingsActions,
    totalPotentialSaving: parseFloat(totalPotentialSaving.toFixed(2)),
  };
}

/* ------------------------------------------------------------------ */
/*  Annual report generator                                            */
/* ------------------------------------------------------------------ */

export async function generateAnnualReportData(
  userId: string,
  year: number
): Promise<AnnualReportData> {
  const admin = getAdmin();
  const now = new Date();
  const yearEnd = now.toISOString();
  
  // Use a rolling 12-month window instead of the calendar year
  const yearStartDt = new Date(now);
  yearStartDt.setFullYear(yearStartDt.getFullYear() - 1);
  const yearStart = yearStartDt.toISOString();

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
    priceAlertsRes,
    disputesRes,
    bankConnsRes,
    emailConnsRes,
    allPriceAlertsRes,
    pendingTasksRes,
  ] = await Promise.all([
    admin.from('profiles')
      .select('full_name, first_name, last_name, phone, address, postcode, email, created_at, subscription_tier, total_money_recovered')
      .eq('id', userId)
      .single(),

    admin.from('subscriptions')
      .select('provider_name, company, amount, billing_cycle, money_saved, cancelled_at')
      .eq('user_id', userId)
      .eq('status', 'cancelled')
      .gte('cancelled_at', yearStart)
      .lte('cancelled_at', yearEnd),

    admin.from('subscriptions')
      .select('id, provider_name, company, amount, billing_cycle, category, category_normalized, status, next_billing_date, contract_end_date')
      .eq('user_id', userId)
      .eq('status', 'active'),

    admin.from('tasks')
      .select('money_recovered, created_at')
      .eq('user_id', userId)
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd),

    admin.from('agent_runs')
      .select('id')
      .eq('user_id', userId)
      .eq('agent_type', 'complaint')
      .eq('status', 'completed')
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd),

    admin.from('bank_transactions')
      .select('amount, description, category, timestamp, merchant_name, user_category, id')
      .eq('user_id', userId)
      .gte('timestamp', yearStart)
      .lte('timestamp', yearEnd),

    admin.from('deal_clicks')
      .select('id')
      .eq('user_id', userId)
      .gte('clicked_at', yearStart)
      .lte('clicked_at', yearEnd),

    admin.from('user_challenges')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', yearStart)
      .lte('completed_at', yearEnd),

    admin.from('user_points')
      .select('balance, lifetime_earned, loyalty_tier')
      .eq('user_id', userId)
      .single(),

    admin.from('price_increase_alerts')
      .select('id, merchant_name, old_amount, new_amount, percentage_increase, annual_impact, status')
      .eq('user_id', userId),

    admin.from('disputes')
      .select('id, provider_name, company_name, description, status, created_at, disputed_amount, money_recovered')
      .eq('user_id', userId),

    admin.from('bank_connections')
      .select('id, bank_name, status')
      .eq('user_id', userId),

    admin.from('email_connections')
      .select('id, email_address, provider_type, status')
      .eq('user_id', userId)
      .eq('status', 'active'),

    admin.from('price_increase_alerts')
      .select('id, status')
      .eq('user_id', userId),

    admin.from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'pending_review'),
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
  const priceAlerts = priceAlertsRes.data || [];
  const disputes = disputesRes.data || [];
  const bankConns = bankConnsRes.data || [];
  const emailConns = emailConnsRes.data || [];
  const allPriceAlerts = allPriceAlertsRes.data || [];

  // --- Spending calculations with meaningful categories ---
  const validDebits = transactions
    .filter(tx => parseFloat(String(tx.amount)) < 0)
    .map(tx => ({
      ...tx,
      amount: Math.abs(parseFloat(String(tx.amount))),
      meaningfulCategory: tx.user_category || categoriseTransaction(tx.merchant_name || tx.description || '', tx.category || ''),
    }))
    .filter(tx => tx.meaningfulCategory !== 'transfers' && tx.meaningfulCategory !== 'internal');

  const validCredits = transactions
    .filter(tx => parseFloat(String(tx.amount)) > 0)
    .map(tx => ({
      ...tx,
      amount: parseFloat(String(tx.amount)),
      meaningfulCategory: tx.user_category || categoriseTransaction(tx.merchant_name || tx.description || '', tx.category || ''),
    }))
    .filter(tx => tx.meaningfulCategory !== 'transfers' && tx.meaningfulCategory !== 'internal');

  const totalOutgoings = validDebits.reduce((sum, tx) => sum + tx.amount, 0);
  const totalIncome = validCredits.reduce((sum, tx) => sum + tx.amount, 0);

  // Spending by meaningful category
  const categoryTotals: Record<string, { total: number; count: number }> = {};
  for (const tx of validDebits) {
    const cat = tx.meaningfulCategory;
    if (!categoryTotals[cat]) categoryTotals[cat] = { total: 0, count: 0 };
    categoryTotals[cat].total += tx.amount;
    categoryTotals[cat].count += 1;
  }
  const spendingByCategory: CategorySpend[] = Object.entries(categoryTotals)
    .map(([category, data]) => ({
      category,
      label: getReportCategoryLabel(category),
      total: parseFloat(data.total.toFixed(2)),
      percentage: totalOutgoings > 0 ? parseFloat(((data.total / totalOutgoings) * 100).toFixed(1)) : 0,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.total - a.total);

  // Monthly trends — only populated months
  const monthlyMap: Record<string, { spend: number; income: number }> = {};
  for (const tx of validDebits) {
    const key = tx.timestamp?.substring(0, 7);
    if (key) {
      if (!monthlyMap[key]) monthlyMap[key] = { spend: 0, income: 0 };
      monthlyMap[key].spend += tx.amount;
    }
  }
  for (const tx of validCredits) {
    const key = tx.timestamp?.substring(0, 7);
    if (key) {
      if (!monthlyMap[key]) monthlyMap[key] = { spend: 0, income: 0 };
      monthlyMap[key].income += tx.amount;
    }
  }
  const monthlyTrends: MonthlyTrend[] = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month,
      monthLabel: MONTH_LABELS[month.split('-')[1]] || month.split('-')[1],
      spend: parseFloat(vals.spend.toFixed(2)),
      income: parseFloat(vals.income.toFixed(2)),
      hasData: vals.spend > 0 || vals.income > 0,
    }));

  // Top 5 merchants (clean names)
  const merchantMap: Record<string, { total: number; count: number }> = {};
  for (const tx of validDebits) {
    // Fallback to description if merchant_name is absent, and normalize it
    const rawName = tx.merchant_name || tx.description || 'Unknown';
    const name = cleanMerchantName(tx.merchant_name || '', rawName) || normaliseMerchantName(rawName);
    
    if (!merchantMap[name]) merchantMap[name] = { total: 0, count: 0 };
    merchantMap[name].total += tx.amount;
    merchantMap[name].count += 1;
  }
  const topMerchants: MerchantSpend[] = Object.entries(merchantMap)
    .map(([name, v]) => ({ name, total: parseFloat(v.total.toFixed(2)), count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // --- Subscription costs ---
  const monthlySubscriptionCost = activeSubs.reduce((sum, s) => {
    const amt = parseFloat(String(s.amount)) || 0;
    if (s.billing_cycle === 'yearly') return sum + amt / 12;
    if (s.billing_cycle === 'quarterly') return sum + amt / 3;
    return sum + amt;
  }, 0);

  // Build subscription list with guidance
  let subsWithCheaperDeal = 0;
  let totalSubSavings = 0;

  const subscriptionsList: SubscriptionWithGuidance[] = activeSubs
    .map(s => {
      const amt = parseFloat(String(s.amount)) || 0;
      const monthlyCost = s.billing_cycle === 'yearly' ? amt / 12 : s.billing_cycle === 'quarterly' ? amt / 3 : amt;
      const annualCost = monthlyCost * 12;
      const displayName = cleanMerchantName(s.provider_name, s.company);
      const dealCat = subCategoryToDealCategory(s.category || s.category_normalized, s.provider_name);
      const cheaperDeal = findCheaperDeal(displayName, monthlyCost, dealCat);

      const matchingAlert = priceAlerts.find(a =>
        normaliseMerchantName(a.merchant_name).toLowerCase() === displayName.toLowerCase()
      );

      let guidance: SubscriptionWithGuidance['guidance'];

      if (cheaperDeal) {
        subsWithCheaperDeal++;
        totalSubSavings += cheaperDeal.annualSaving;
        guidance = {
          type: 'switch',
          message: `Switch to ${cheaperDeal.dealProvider} and save £${Math.round(cheaperDeal.annualSaving / 12)}/month (£${cheaperDeal.annualSaving}/yr)`,
          actionUrl: cheaperDeal.dealUrl,
          annualSaving: cheaperDeal.annualSaving,
          dealProvider: cheaperDeal.dealProvider,
        };
      } else if (matchingAlert) {
        guidance = {
          type: 'complain',
          message: `Price went up ${parseFloat(String(matchingAlert.percentage_increase)).toFixed(1)}%`,
          actionUrl: `/dashboard/complaints?company=${encodeURIComponent(displayName)}`,
          annualSaving: parseFloat(String(matchingAlert.annual_impact)) || 0,
        };
      } else {
        guidance = { type: 'competitive', message: '✓ Good value', actionUrl: '/dashboard/deals' };
      }

      return {
        id: s.id,
        name: displayName,
        category: s.category || s.category_normalized || 'other',
        monthlyCost: parseFloat(monthlyCost.toFixed(2)),
        annualCost: parseFloat(annualCost.toFixed(2)),
        status: s.status,
        priceChange: matchingAlert ? {
          oldAmount: parseFloat(String(matchingAlert.old_amount)),
          newAmount: parseFloat(String(matchingAlert.new_amount)),
          pctChange: parseFloat(String(matchingAlert.percentage_increase)),
        } : null,
        guidance,
      };
    })
    .sort((a, b) => b.monthlyCost - a.monthlyCost);

  // --- Price alerts ---
  const priceAlertItems: PriceAlertItem[] = priceAlerts
    .filter(a => a.status === 'active')
    .map(a => ({
      id: a.id,
      merchantName: normaliseMerchantName(a.merchant_name),
      oldAmount: parseFloat(String(a.old_amount)),
      newAmount: parseFloat(String(a.new_amount)),
      pctChange: parseFloat(String(a.percentage_increase)),
      annualImpact: parseFloat(String(a.annual_impact)),
      status: a.status,
    }));
  const totalPriceIncreaseImpact = priceAlertItems.reduce((sum, a) => sum + a.annualImpact, 0);

  // --- Disputes ---
  const disputeItems: DisputeItem[] = disputes.map(d => ({
    id: d.id,
    company: d.provider_name || d.company_name || 'Unknown',
    issue: (d.description || `Dispute for ${d.disputed_amount ? '£'+d.disputed_amount : 'unknown amount'}`).substring(0, 100),
    dateFiled: d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB') : '',
    status: d.status || 'open',
  }));

  const totalDisputedAmount = disputes.reduce((sum, d) => sum + (parseFloat(String(d.disputed_amount)) || 0), 0);
  const disputesRecovered = disputes.reduce((sum, d) => sum + (parseFloat(String(d.money_recovered)) || 0), 0);

  // --- Legacy calculations ---
  const taskMoneyRecovered = tasks.reduce((sum, t) => sum + (parseFloat(String(t.money_recovered)) || 0), 0);
  const subsMoneySaved = cancelledSubs.reduce((sum, s) => sum + (parseFloat(String(s.money_saved)) || 0), 0);
  const totalMoneyRecovered = taskMoneyRecovered + subsMoneySaved + disputesRecovered;

  const annualSavingsFromCancellations = cancelledSubs.reduce((sum, s) => {
    const amt = parseFloat(String(s.amount)) || 0;
    const cycle = s.billing_cycle;
    if (cycle === 'yearly') return sum + amt;
    return sum + amt * 12;
  }, 0);

  // Profile completeness
  const profileFields = [profile?.full_name, profile?.phone, profile?.address, profile?.postcode, profile?.email];
  const filledFields = profileFields.filter(Boolean).length;
  const profileCompleteness = Math.round((filledFields / profileFields.length) * 100);

  const createdAt = profile?.created_at ? new Date(profile.created_at) : new Date();
  const daysAsMember = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  // Connected accounts
  const connectedBanks = bankConns
    .filter(b => b.status === 'active')
    .map(b => ({ name: b.bank_name || 'Bank Account', status: b.status }));
  const connectedEmails = emailConns
    .map(e => ({ email: e.email_address, provider: e.provider_type }));

  // Data months
  const uniqueMonths = new Set(transactions.map(tx => tx.timestamp?.substring(0, 7)).filter(Boolean));
  const dataMonths = uniqueMonths.size;

  // Financial Health Score
  const activeBanks = bankConns.filter(b => b.status === 'active').length;
  const activeEmails = emailConns.filter(e => e.status === 'active').length;
  const actionedAlerts = allPriceAlerts.filter(a => a.status === 'actioned').length;

  // Convert monthlyTrends to the ScoreInput format (need income and outgoings)
  const monthlyTrendsForScore = monthlyTrends.map(mt => ({
    income: mt.income,
    outgoings: mt.spend,
  }));

  const financialHealth = calculateHealthScore({
    monthlyIncome: totalIncome > 0 ? Math.round(totalIncome / monthlyTrends.length) : 0,
    monthlyOutgoings: totalOutgoings > 0 ? Math.round(totalOutgoings / monthlyTrends.length) : 0,
    budgets: [],
    monthlyTrends: monthlyTrendsForScore,
    liquidSavings: 0,
    goals: [],
    totalMonthlyDebtPayments: 0,
    totalDebt: 0,
    previousMonthDebt: 0,
    creditCardBalance: 0,
    creditCardLimit: 0,
    expectedBillsPaid: activeSubs.length,
    expectedBillsTotal: activeSubs.length,
    contractsTracked: activeSubs.length,
    contractsTotal: activeSubs.length,
    alertsActioned: actionedAlerts,
    alertsTotal: allPriceAlerts.length,
  });

  // --- Savings plan ---
  const savingsActions: SavingsAction[] = [];
  for (const sub of subscriptionsList) {
    if (sub.guidance.type === 'switch' && sub.guidance.annualSaving) {
      savingsActions.push({
        action: 'switch',
        provider: sub.name,
        description: `Switch to ${sub.guidance.dealProvider}`,
        monthlySaving: Math.round((sub.guidance.annualSaving || 0) / 12),
        annualSaving: sub.guidance.annualSaving,
        actionUrl: sub.guidance.actionUrl,
        difficulty: getSwitchDifficulty(sub.category),
        difficultyEmoji: getSwitchDifficulty(sub.category) === 'easy' ? '🟢' : getSwitchDifficulty(sub.category) === 'medium' ? '🟡' : '🔴',
      });
    }
  }
  for (const alert of priceAlertItems) {
    savingsActions.push({
      action: 'complain',
      provider: alert.merchantName,
      description: `Complain about ${alert.pctChange.toFixed(1)}% increase`,
      monthlySaving: Math.round(alert.annualImpact / 12),
      annualSaving: Math.round(alert.annualImpact),
      actionUrl: `/dashboard/complaints?company=${encodeURIComponent(alert.merchantName)}&amount=${alert.annualImpact}`,
      difficulty: 'medium',
      difficultyEmoji: '🟡',
    });
  }
  savingsActions.sort((a, b) => b.annualSaving - a.annualSaving);

  // Executive Summary (template-based)
  const executiveSummary = buildExecutiveSummary({
    monthlySpend: totalOutgoings,
    activeSubs: activeSubs.length,
    priceAlertCount: priceAlertItems.length,
    priceAlertCost: totalPriceIncreaseImpact,
    potentialSavings: totalSubSavings,
    disputes: disputes.length,
    monthlySubCost: monthlySubscriptionCost,
    totalDisputedAmount,
  });

  const userName = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User';
  const userPlan = profile?.subscription_tier
    ? profile.subscription_tier.charAt(0).toUpperCase() + profile.subscription_tier.slice(1) + ' Plan'
    : 'Free Plan';

  return {
    year,
    generatedAt: new Date().toISOString(),
    memberSince: createdAt.toISOString(),
    daysAsMember,
    userName,
    userPlan,
    executiveSummary,
    financialHealth,
    totalIncome: parseFloat(totalIncome.toFixed(2)),
    totalOutgoings: parseFloat(totalOutgoings.toFixed(2)),
    netPosition: parseFloat((totalIncome - totalOutgoings).toFixed(2)),
    monthlyTrends,
    spendingByCategory,
    activeSubscriptions: activeSubs.length,
    monthlySubscriptionCost: parseFloat(monthlySubscriptionCost.toFixed(2)),
    annualSubscriptionCost: parseFloat((monthlySubscriptionCost * 12).toFixed(2)),
    subscriptionsList,
    priceAlerts: priceAlertItems,
    totalPriceIncreaseImpact: parseFloat(totalPriceIncreaseImpact.toFixed(2)),
    potentialAnnualSavings: parseFloat(totalSubSavings.toFixed(2)),
    savingsActions,
    totalDisputes: disputes.length,
    disputes: disputeItems,
    connectedBanks,
    connectedEmails,
    profileCompleteness,
    dataMonths,
    topMerchants,

    // Legacy fields
    subscriptionsCancelled: cancelledSubs.length,
    annualSavingsFromCancellations: parseFloat(annualSavingsFromCancellations.toFixed(2)),
    complaintsGenerated: agentRuns.length,
    totalMoneyRecovered: parseFloat(totalMoneyRecovered.toFixed(2)),
    taskMoneyRecovered: parseFloat(taskMoneyRecovered.toFixed(2)),
    subsMoneySaved: parseFloat(subsMoneySaved.toFixed(2)),
    dealClicks: dealClicks.length,
    challengesCompleted: challenges.length,
    pointsEarned: points?.lifetime_earned || 0,
    loyaltyTier: points?.loyalty_tier || 'Bronze',
    totalPoints: points?.balance || 0,
    profileCompletenessNum: profileCompleteness,
    moneyRecoveryScore: parseFloat((totalMoneyRecovered + annualSavingsFromCancellations).toFixed(2)),
  };
}

/* ------------------------------------------------------------------ */
/*  Executive Summary Builder (template-based)                         */
/* ------------------------------------------------------------------ */

function buildExecutiveSummary(data: {
  monthlySpend: number;
  activeSubs: number;
  priceAlertCount: number;
  priceAlertCost: number;
  potentialSavings: number;
  disputes: number;
  monthlySubCost: number;
  totalDisputedAmount?: number;
}): string {
  const parts: string[] = [];

  if (data.monthlySpend > 0 || data.activeSubs > 0) {
    const spendStr = data.monthlySpend > 0 ? `£${data.monthlySpend.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
    const subsStr = data.activeSubs > 0 ? `${data.activeSubs} active subscriptions and regular payments totalling £${data.monthlySubCost.toLocaleString('en-GB', { minimumFractionDigits: 0 })}/month` : '';
    
    if (spendStr && subsStr) {
      parts.push(`Over the past 12 months, you spent approximately ${spendStr} across ${subsStr}.`);
    } else if (spendStr) {
      parts.push(`Over the past 12 months, your total spending was ${spendStr}.`);
    } else if (subsStr) {
      parts.push(`You currently have ${subsStr}.`);
    }
  }

  if (data.disputes > 0) {
    const dispAmountStr = data.totalDisputedAmount ? ` worth £${data.totalDisputedAmount.toLocaleString('en-GB', { minimumFractionDigits: 0 })} in potential recovery` : '';
    parts.push(`You have ${data.disputes} open dispute${data.disputes !== 1 ? 's' : ''}${dispAmountStr}.`);
  }

  if (data.priceAlertCount > 0) {
    parts.push(`We detected ${data.priceAlertCount} price increase${data.priceAlertCount !== 1 ? 's' : ''} costing you an extra £${data.priceAlertCost.toLocaleString('en-GB', { minimumFractionDigits: 0 })}/yr.`);
  }

  if (data.potentialSavings > 0) {
    parts.push(`Based on your spending patterns, we've identified potential savings of £${data.potentialSavings.toLocaleString('en-GB', { minimumFractionDigits: 0 })}/yr.`);
  }

  return parts.join(' ') || 'Your financial report is ready. Connect your bank account and add subscriptions to unlock personalised insights.';
}
