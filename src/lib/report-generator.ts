import { createClient } from '@supabase/supabase-js';
import { normaliseMerchantName, categoriseTransaction } from '@/lib/merchant-normalise';
import { cleanMerchantName, isLoanOrMortgage, getReportCategoryLabel, getSwitchDifficulty } from '@/lib/merchant-utils';
import { calculateHealthScore, type HealthScore } from '@/lib/financial-health-score';
import { normalizeSpendingCategoryKey } from '@/lib/money-hub-classification';

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
/*  v4 section types (2026-08-20)                                      */
/* ------------------------------------------------------------------ */

export interface EmailFindingsSummary {
  totalFindings: number;
  newFindings: number;
  actionedFindings: number;
  refundOpportunities: number;
  /** Sum of `amount` across refund opportunities and other money-bearing findings. */
  totalPotentialValue: number;
  urgentCount: number;
  byType: Array<{ type: string; count: number; totalAmount: number }>;
}

export interface UpcomingPaymentsSummary {
  next30DayCount: number;
  totalCommitted: number;
  items: Array<{ counterparty: string; amount: number; expectedDate: string; source: string }>;
}

export interface VerifiedSavingsSummary {
  count: number;
  totalSaved: number;
  totalAnnualSaving: number;
  items: Array<{ savingType: string; title: string; amountSaved: number; annualSaving: number; confirmedAt: string | null }>;
}

export interface DisputesRecoverySummary {
  totalDisputes: number;
  totalRecovered: number;
  wins: number;
  partialWins: number;
  lost: number;
  inProgress: number;
  averageResolutionDays: number | null;
}

export interface BudgetVsActual {
  category: string;
  label: string;
  monthlyLimit: number;
  actualMonthlyAverage: number;
  status: 'under' | 'close' | 'over';
}

export interface NetWorthSummary {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  goals: Array<{ name: string; targetAmount: number; currentAmount: number; progressPct: number }>;
}

export interface ReportWindow {
  start: string; // ISO date of window start
  end: string;   // ISO date of window end
  label: string; // e.g. "September 2025 to August 2026"
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

  // v2 additions (data-driven, replaces shallow AI prose) ──────────
  /** Forward projection: average of last 3 months of spend × 12.
   * Quick "if you carry on as you are" annual-spend headline. */
  projectedAnnualSpend: number;
  /** Same projection for income — useful for net-position forecast. */
  projectedAnnualIncome: number;
  /** Per-month savings rate (income - spend) / income, 0-1. Drives a
   * compact chart showing whether the user's saving rate is
   * improving / drifting. */
  savingsRateByMonth: Array<{ month: string; monthLabel: string; rate: number }>;
  /** Year-over-year comparison — same rolling-12-months window
   * shifted back one year. Null if there isn't enough history. */
  yoy: {
    previousIncome: number;
    previousSpend: number;
    incomeDeltaPct: number; // (current-prev)/prev * 100
    spendDeltaPct: number;
    netDeltaPct: number;
  } | null;

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

  // v3 additions (2026-05-02): "How you've used Paybacker" tool
  // breakdown so the report walks every part of the system, not just
  // money-flow. Founder ask: show users which tools they're getting
  // value from + nudge them toward the ones they haven't tried.
  toolUsage: {
    pocketAgent: {
      telegramConnected: boolean;
      whatsappConnected: boolean;
      telegramLinkedAt: string | null;
      whatsappLinkedAt: string | null;
      lastTelegramAt: string | null;
      lastWhatsappAt: string | null;
    };
    disputesAI: {
      totalRaised: number;
      won: number;
      partial: number;
      lost: number;
      stillOpen: number;
      moneyRecoveredGbp: number;
    };
    complianceCentre: {
      citationsUsedInYourLetters: number;
      topCitedRefs: Array<{ name: string; count: number }>;
    };
    moneyHub: {
      connectedBanks: number;
      connectedEmails: number;
      transactionsAnalysed: number;
      monthsOfData: number;
    };
    incomeAlerts: {
      received: number;
      totalLandedGbp: number;
    };
    subscriptions: {
      tracked: number;
      cancelled: number;
      monthlyCostGbp: number;
      annualSavedFromCancellationsGbp: number;
    };
    deals: {
      explored: number;
    };
  };

  // v4 additions (2026-08-20). All optional so previously saved reports
  // keep rendering without migration.
  /** True rolling 12-month window this report covers. */
  reportWindow?: ReportWindow;
  /** Summary of email scanner findings (refund opportunities etc.). */
  emailFindings?: EmailFindingsSummary;
  /** Committed outgoing payments over the next 30 days. */
  upcomingPayments?: UpcomingPaymentsSummary;
  /** Confirmed, verified savings (dispute wins, reverted increases...). */
  verifiedSavings?: VerifiedSavingsSummary;
  /** Recovery story built from dispute outcomes. */
  disputesDetail?: DisputesRecoverySummary;
  /** Per-category budget vs actual average monthly spend. */
  budgetsVsActual?: BudgetVsActual[];
  /** Assets minus liabilities plus goal progress. */
  netWorth?: NetWorthSummary;
  /** 3-5 AI-suggested next actions (falls back to data-driven list). */
  nextActions?: string[];
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

/* ------------------------------------------------------------------ */
/*  Real deal intelligence (2026-08-20)                                */
/*                                                                     */
/*  Replaces the old hardcoded DEALS_BY_CATEGORY table. Deals now come */
/*  from the same sources the rest of the app uses:                    */
/*    - subscription_comparisons: per-subscription market comparisons  */
/*      written by the comparison engine cron.                         */
/*    - overcharge_assessments: the overcharge engine's scored view of */
/*      whether each subscription is overpriced, including the best    */
/*      deal it found.                                                 */
/* ------------------------------------------------------------------ */

interface RealDeal {
  dealProvider: string;
  dealPrice: number;
  annualSaving: number;
  dealUrl: string;
}

interface OverchargeAssessmentRow {
  subscription_id: string | null;
  merchant_name: string | null;
  overcharge_score: number | null;
  estimated_annual_saving: number | string | null;
  best_deal_provider: string | null;
  best_deal_url: string | null;
  best_deal_monthly: number | string | null;
}

interface DealIntelligence {
  comparisonsBySub: Map<string, RealDeal>;
  assessmentsBySub: Map<string, OverchargeAssessmentRow>;
}

type AdminClient = ReturnType<typeof getAdmin>;

async function loadDealIntelligence(
  admin: AdminClient,
  userId: string,
  subscriptionIds: string[],
): Promise<DealIntelligence> {
  const comparisonsBySub = new Map<string, RealDeal>();
  const assessmentsBySub = new Map<string, OverchargeAssessmentRow>();

  const [compsRes, assessRes] = await Promise.all([
    subscriptionIds.length > 0
      ? admin
          .from('subscription_comparisons')
          .select('subscription_id, deal_provider, deal_price, annual_saving, deal_url')
          .in('subscription_id', subscriptionIds)
          .eq('dismissed', false)
          .order('annual_saving', { ascending: false })
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    admin
      .from('overcharge_assessments')
      .select('subscription_id, merchant_name, overcharge_score, estimated_annual_saving, best_deal_provider, best_deal_url, best_deal_monthly')
      .eq('user_id', userId)
      .eq('status', 'active'),
  ]);

  for (const raw of (compsRes.data as Array<Record<string, unknown>> | null) || []) {
    const subId = String(raw.subscription_id || '');
    if (!subId || comparisonsBySub.has(subId)) continue; // rows are pre-sorted by saving desc
    const annualSaving = Math.round(parseFloat(String(raw.annual_saving)) || 0);
    if (annualSaving <= 0) continue;
    comparisonsBySub.set(subId, {
      dealProvider: String(raw.deal_provider || 'a cheaper provider'),
      dealPrice: parseFloat(String(raw.deal_price)) || 0,
      annualSaving,
      dealUrl: String(raw.deal_url || '/dashboard/deals'),
    });
  }

  for (const a of (assessRes.data as OverchargeAssessmentRow[] | null) || []) {
    if (a.subscription_id && !assessmentsBySub.has(a.subscription_id)) {
      assessmentsBySub.set(a.subscription_id, a);
    }
  }

  return { comparisonsBySub, assessmentsBySub };
}

/**
 * Resolve the best real switching opportunity for one subscription.
 * Prefers a live subscription_comparisons row; falls back to the
 * overcharge engine's best deal when the assessment says the user is
 * genuinely overpaying (score >= 60).
 */
function findRealDeal(
  subscriptionId: string,
  intel: DealIntelligence,
): RealDeal | null {
  const comparison = intel.comparisonsBySub.get(subscriptionId);
  if (comparison && comparison.annualSaving > 0) return comparison;

  const assessment = intel.assessmentsBySub.get(subscriptionId);
  if (assessment) {
    const score = Number(assessment.overcharge_score) || 0;
    const saving = Math.round(parseFloat(String(assessment.estimated_annual_saving)) || 0);
    if (score >= 60 && saving > 0 && assessment.best_deal_provider) {
      return {
        dealProvider: assessment.best_deal_provider,
        dealPrice: parseFloat(String(assessment.best_deal_monthly)) || 0,
        annualSaving: saving,
        dealUrl: assessment.best_deal_url || '/dashboard/deals',
      };
    }
  }
  return null;
}

/**
 * Honest "no deal" message. Only claims good value when an overcharge
 * assessment actually ran and scored the subscription as fairly priced.
 */
function noDealGuidance(
  subscriptionId: string,
  intel: DealIntelligence,
): { message: string } {
  const assessment = intel.assessmentsBySub.get(subscriptionId);
  if (assessment && assessment.overcharge_score !== null && Number(assessment.overcharge_score) < 40) {
    return { message: 'Good value: our latest market check found no cheaper alternative' };
  }
  return { message: 'We have not found a better deal for this yet. We keep checking.' };
}

/* ------------------------------------------------------------------ */
/*  Transaction filtering shared by both generators                    */
/* ------------------------------------------------------------------ */

interface TxRow {
  id?: string;
  amount: number | string;
  description?: string | null;
  category?: string | null;
  timestamp?: string | null;
  merchant_name?: string | null;
  user_category?: string | null;
  is_pending?: boolean | null;
  transfer_pair_id?: string | null;
}

/**
 * Mirror Money Hub's exclusions: pending transactions are not settled
 * money, and pair-matched transfers are money moving between the user's
 * own accounts. Soft-deleted rows are excluded at query time via
 * .is('deleted_at', null).
 */
function isCountableTransaction(tx: TxRow): boolean {
  if (tx.is_pending) return false;
  if (tx.transfer_pair_id) return false;
  return true;
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
    budgetsRes,
    liabilitiesRes,
    savingsGoalsRes,
    moneyHubGoalsRes,
  ] = await Promise.all([
    // Profile
    admin.from('profiles')
      .select('full_name, first_name, last_name, phone, address, postcode, email, total_money_recovered, subscription_tier')
      .eq('id', userId)
      .single(),

    // Active subscriptions — include extra fields
    admin.from('subscriptions')
      .select('id, provider_name, amount, billing_cycle, category, category_normalized, status, next_billing_date, contract_end_date')
      .eq('user_id', userId)
      .eq('status', 'active'),

    admin.from('bank_transactions')
      .select('amount, description, category, timestamp, merchant_name, user_category, id, is_pending, transfer_pair_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('timestamp', currentMonthStart),

    admin.from('disputes')
      .select('id, provider_name, issue_summary, status, created_at, disputed_amount, money_recovered')
      .eq('user_id', userId),

    // Active price increase alerts
    admin.from('price_increase_alerts')
      .select('id, merchant_name, old_amount, new_amount, increase_pct, annual_impact, status')
      .eq('user_id', userId)
      .eq('status', 'active'),

    // Upcoming renewals (next 30 days)
    admin.from('subscriptions')
      .select('provider_name, amount, next_billing_date, category, category_normalized, contract_end_date')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('next_billing_date', now.toISOString().substring(0, 10))
      .lte('next_billing_date', thirtyDaysFromNow.toISOString().substring(0, 10)),

    // Bank connections (current_balance feeds liquid savings in the score)
    admin.from('bank_connections')
      .select('id, bank_name, status, current_balance')
      .eq('user_id', userId)
      .is('deleted_at', null),

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

    // Real health-score inputs
    admin.from('money_hub_budgets')
      .select('category, monthly_limit')
      .eq('user_id', userId),

    admin.from('money_hub_liabilities')
      .select('liability_type, outstanding_balance, monthly_payment')
      .eq('user_id', userId),

    admin.from('savings_goals')
      .select('name, target_amount, current_amount, is_active')
      .eq('user_id', userId)
      .eq('is_active', true),

    admin.from('money_hub_savings_goals')
      .select('goal_name, target_amount, current_amount')
      .eq('user_id', userId),
  ]);

  const profile = profileRes.data;
  const activeSubs = activeSubsRes.data || [];
  const transactions = ((transactionsRes.data || []) as TxRow[]).filter(isCountableTransaction);
  const disputes = disputesRes.data || [];
  const priceAlerts = priceAlertsRes.data || [];
  const renewals = renewalsRes.data || [];
  const bankConns = bankConnsRes.data || [];
  const emailConns = emailConnsRes.data || [];
  const allPriceAlerts = allPriceAlertsRes.data || [];
  const budgets = budgetsRes.data || [];
  const liabilities = liabilitiesRes.data || [];
  const goals = [
    ...(savingsGoalsRes.data || []).map(g => ({ target_amount: Number(g.target_amount) || 0, current_amount: Number(g.current_amount) || 0 })),
    ...(moneyHubGoalsRes.data || []).map(g => ({ target_amount: Number(g.target_amount) || 0, current_amount: Number(g.current_amount) || 0 })),
  ];

  // Live market intelligence (replaces hardcoded deals table)
  const dealIntel = await loadDealIntelligence(admin, userId, activeSubs.map(s => s.id));

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
  const topSubscriptions: SubscriptionWithGuidance[] = activeSubs
    .map(s => {
      const amt = parseFloat(String(s.amount)) || 0;
      const monthlyCost = s.billing_cycle === 'yearly' ? amt / 12 : s.billing_cycle === 'quarterly' ? amt / 3 : amt;
      const annualCost = monthlyCost * 12;
      const displayName = cleanMerchantName(s.provider_name);
      const cheaperDeal = findRealDeal(s.id, dealIntel);

      // Check for price increase on this sub
      const matchingAlert = priceAlerts.find(a =>
        normaliseMerchantName(a.merchant_name).toLowerCase() === displayName.toLowerCase()
      );

      let guidance: SubscriptionWithGuidance['guidance'];

      if (cheaperDeal) {
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
          message: `Price went up ${parseFloat(String(matchingAlert.increase_pct)).toFixed(1)}%. Write a complaint to negotiate it back down`,
          actionUrl: `/dashboard/complaints?company=${encodeURIComponent(displayName)}&issue=${encodeURIComponent(`Price increase of ${parseFloat(String(matchingAlert.increase_pct)).toFixed(1)}%`)}&amount=${impact}`,
          annualSaving: impact,
        };
      } else {
        guidance = {
          type: 'competitive',
          message: noDealGuidance(s.id, dealIntel).message,
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
          pctChange: parseFloat(String(matchingAlert.increase_pct)),
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
    pctChange: parseFloat(String(a.increase_pct)),
    annualImpact: parseFloat(String(a.annual_impact)),
    status: a.status,
  }));
  const priceAlertAnnualCost = priceAlertItems.reduce((sum, a) => sum + a.annualImpact, 0);

  // --- Upcoming renewals (filter out loans/mortgages) ---
  const filteredRenewals: RenewalItem[] = renewals
    .filter(r => !isLoanOrMortgage(r.category || r.category_normalized, r.provider_name))
    .map(r => ({
      provider: cleanMerchantName(r.provider_name),
      amount: parseFloat(String(r.amount)) || 0,
      date: r.next_billing_date,
      isRenewal: !!r.contract_end_date,
    }));

  // --- Disputes ---
  const disputeItems: DisputeItem[] = disputes.map(d => ({
    id: d.id,
    company: d.provider_name || 'Unknown',
    issue: (d.issue_summary || `Dispute for ${d.disputed_amount ? '£'+d.disputed_amount : 'unknown amount'}`).substring(0, 100),
    dateFiled: d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB') : '',
    status: d.status || 'open',
  }));
  const activeDisputeCount = disputes.filter(d => d.status === 'open' || d.status === 'in_progress' || d.status === 'awaiting_response').length;

  // --- Financial Health Score (real inputs, 2026-08-20) ---
  const actionedAlerts = allPriceAlerts.filter(a => a.status === 'actioned').length;

  // Budget adherence — match budget categories against this month's
  // spend by meaningful category.
  const spendByCategoryKey: Record<string, number> = {};
  for (const tx of validDebits) {
    const key = String(tx.meaningfulCategory || 'other').toLowerCase();
    spendByCategoryKey[key] = (spendByCategoryKey[key] || 0) + tx.amount;
  }
  const budgetInputs = budgets
    .filter(b => Number(b.monthly_limit) > 0)
    .map(b => ({
      monthly_limit: Number(b.monthly_limit) || 0,
      spent: spendByCategoryKey[normalizeSpendingCategoryKey(b.category)] || 0,
    }));

  // Liquid savings — sum of connected account balances.
  const liquidSavings = bankConns
    .filter(b => b.status === 'active')
    .reduce((sum, b) => sum + (parseFloat(String(b.current_balance)) || 0), 0);

  // Debt from Money Hub liabilities.
  const totalDebt = liabilities.reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);
  const totalMonthlyDebtPayments = liabilities.reduce((s, l) => s + (parseFloat(String(l.monthly_payment)) || 0), 0);
  const creditCardBalance = liabilities
    .filter(l => l.liability_type === 'credit_card')
    .reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);

  const financialHealth = calculateHealthScore({
    monthlyIncome: currentMonthIncome,
    monthlyOutgoings: currentMonthSpend,
    budgets: budgetInputs,
    monthlyTrends: [],
    liquidSavings: Math.max(0, liquidSavings),
    goals,
    totalMonthlyDebtPayments,
    totalDebt,
    previousMonthDebt: totalDebt,
    creditCardBalance,
    creditCardLimit: 0,
    expectedBillsPaid: activeSubs.length,
    expectedBillsTotal: activeSubs.length,
    contractsTracked: activeSubs.filter(s => s.contract_end_date).length,
    contractsTotal: activeSubs.length,
    alertsActioned: actionedAlerts,
    alertsTotal: allPriceAlerts.length,
  });

  // --- Savings plan (real deal intelligence) ---
  const savingsActions: SavingsAction[] = [];

  // Add switch opportunities from live comparisons / overcharge engine
  for (const sub of activeSubs) {
    const amt = parseFloat(String(sub.amount)) || 0;
    const monthlyCost = sub.billing_cycle === 'yearly' ? amt / 12 : sub.billing_cycle === 'quarterly' ? amt / 3 : amt;
    const displayName = cleanMerchantName(sub.provider_name);
    const cheaperDeal = findRealDeal(sub.id, dealIntel);

    if (cheaperDeal) {
      const difficulty = getSwitchDifficulty(sub.category || sub.category_normalized);
      savingsActions.push({
        action: 'switch',
        provider: displayName,
        description: `Switch to ${cheaperDeal.dealProvider}`,
        monthlySaving: Math.max(0, Math.round(monthlyCost - cheaperDeal.dealPrice)),
        annualSaving: cheaperDeal.annualSaving,
        actionUrl: cheaperDeal.dealUrl,
        difficulty,
        difficultyEmoji: difficulty === 'easy' ? '🟢' : difficulty === 'medium' ? '🟡' : '🔴',
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

  // Rolling 12-month window, aligned to calendar months so the report
  // always produces exactly 12 monthly buckets (11 full months + the
  // current partial month). The old "now minus 365 days" window spanned
  // 13 partial calendar months, which produced the 13-bar chart bug.
  const yearStartDt = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const yearStart = yearStartDt.toISOString();

  // Exactly 12 month keys, oldest first.
  const monthKeys: string[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const windowLabel = `${yearStartDt.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} to ${now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
  const thirtyDaysFromNow = new Date(now);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

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
    telegramSessionRes,
    whatsappSessionRes,
    legalRefUsagesRes,
    incomeAlertsRes,
    budgetsRes,
    assetsRes,
    liabilitiesRes,
    savingsGoalsRes,
    moneyHubGoalsRes,
    emailFindingsRes,
    upcomingPaymentsRes,
    verifiedSavingsRes,
  ] = await Promise.all([
    admin.from('profiles')
      .select('full_name, first_name, last_name, phone, address, postcode, email, created_at, subscription_tier, total_money_recovered')
      .eq('id', userId)
      .single(),

    admin.from('subscriptions')
      .select('provider_name, amount, billing_cycle, money_saved, cancelled_at')
      .eq('user_id', userId)
      .eq('status', 'cancelled')
      .gte('cancelled_at', yearStart)
      .lte('cancelled_at', yearEnd),

    admin.from('subscriptions')
      .select('id, provider_name, amount, billing_cycle, category, category_normalized, status, next_billing_date, contract_end_date')
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
      .select('amount, description, category, timestamp, merchant_name, user_category, id, is_pending, transfer_pair_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
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
      .select('id, merchant_name, old_amount, new_amount, increase_pct, annual_impact, status')
      .eq('user_id', userId),

    admin.from('disputes')
      .select('id, provider_name, issue_summary, status, created_at, disputed_amount, money_recovered, outcome, recovered_amount_gbp, resolution_time_days')
      .eq('user_id', userId),

    admin.from('bank_connections')
      .select('id, bank_name, status, current_balance')
      .eq('user_id', userId)
      .is('deleted_at', null),

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

    // v3 additions: Pocket Agent + Compliance Centre + income alert
    // counts. All scoped to the rolling 12-month window so the report
    // matches the rest of the data window.
    admin.from('telegram_sessions')
      .select('linked_at, last_message_at, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),

    admin.from('whatsapp_sessions')
      .select('linked_at, last_message_at, is_active, opted_out_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('opted_out_at', null)
      .maybeSingle(),

    // legal_ref_usages joined via legal_references for the friendly
    // name. Filter to the user's own letters within window.
    admin.from('legal_ref_usages')
      .select('ref_id, used_at, legal_references(law_name, section)')
      .eq('user_id', userId)
      .gte('used_at', yearStart)
      .lte('used_at', yearEnd),

    // Income alerts fired in window (drives the Money Hub + alerts
    // section). Cross-references the new income_received cron from
    // PR #446.
    admin.from('notification_log')
      .select('reference_key, sent_at')
      .eq('user_id', userId)
      .eq('notification_type', 'income_received')
      .gte('sent_at', yearStart)
      .lte('sent_at', yearEnd),

    // v4 — real health-score inputs + new report sections
    admin.from('money_hub_budgets')
      .select('category, monthly_limit')
      .eq('user_id', userId),

    admin.from('money_hub_assets')
      .select('asset_type, asset_name, estimated_value')
      .eq('user_id', userId),

    admin.from('money_hub_liabilities')
      .select('liability_type, liability_name, outstanding_balance, monthly_payment')
      .eq('user_id', userId),

    admin.from('savings_goals')
      .select('name, target_amount, current_amount, is_active')
      .eq('user_id', userId)
      .eq('is_active', true),

    admin.from('money_hub_savings_goals')
      .select('goal_name, target_amount, current_amount')
      .eq('user_id', userId),

    admin.from('email_scan_findings')
      .select('finding_type, amount, urgency, status, created_at')
      .eq('user_id', userId)
      .gte('created_at', yearStart)
      .lte('created_at', yearEnd),

    admin.from('upcoming_payments')
      .select('counterparty, amount, expected_date, direction, source')
      .eq('user_id', userId)
      .eq('direction', 'outgoing')
      .gte('expected_date', now.toISOString().substring(0, 10))
      .lte('expected_date', thirtyDaysFromNow.toISOString().substring(0, 10))
      .order('expected_date', { ascending: true }),

    admin.from('verified_savings')
      .select('saving_type, title, amount_saved, annual_saving, confirmed_at')
      .eq('user_id', userId)
      .order('confirmed_at', { ascending: false }),
  ]);

  const profile = profileRes.data;
  const cancelledSubs = cancelledSubsRes.data || [];
  const activeSubs = activeSubsRes.data || [];
  const tasks = tasksRes.data || [];
  const agentRuns = agentRunsRes.data || [];
  const transactions = ((transactionsRes.data || []) as TxRow[]).filter(isCountableTransaction);
  const dealClicks = dealClicksRes.data || [];
  const challenges = challengesRes.data || [];
  const points = pointsRes.data;
  const priceAlerts = priceAlertsRes.data || [];
  const disputes = disputesRes.data || [];
  const bankConns = bankConnsRes.data || [];
  const emailConns = emailConnsRes.data || [];
  const allPriceAlerts = allPriceAlertsRes.data || [];
  const budgets = budgetsRes.data || [];
  const assets = assetsRes.data || [];
  const liabilities = liabilitiesRes.data || [];
  const goals = [
    ...(savingsGoalsRes.data || []).map(g => ({ name: String(g.name || 'Savings goal'), target_amount: Number(g.target_amount) || 0, current_amount: Number(g.current_amount) || 0 })),
    ...(moneyHubGoalsRes.data || []).map(g => ({ name: String(g.goal_name || 'Savings goal'), target_amount: Number(g.target_amount) || 0, current_amount: Number(g.current_amount) || 0 })),
  ];
  const emailFindingRows = emailFindingsRes.data || [];
  const upcomingPaymentRows = upcomingPaymentsRes.data || [];
  const verifiedSavingRows = verifiedSavingsRes.data || [];

  // Live market intelligence (replaces hardcoded deals table)
  const dealIntel = await loadDealIntelligence(admin, userId, activeSubs.map(s => s.id));

  // v3 ── Tool-usage roll-up
  const tg = (telegramSessionRes as { data: { linked_at: string | null; last_message_at: string | null; is_active: boolean } | null }).data ?? null;
  const wa = (whatsappSessionRes as { data: { linked_at: string | null; last_message_at: string | null; is_active: boolean } | null }).data ?? null;
  const incomeAlertRows = (incomeAlertsRes as { data: Array<{ reference_key: string; sent_at: string }> | null }).data ?? [];

  // legal_ref_usages → top citations by frequency.
  type RefUsageRow = {
    ref_id: string;
    used_at: string;
    legal_references:
      | { law_name: string | null; section: string | null }
      | { law_name: string | null; section: string | null }[]
      | null;
  };
  const refRows = (legalRefUsagesRes as { data: RefUsageRow[] | null }).data ?? [];
  const refCounts = new Map<string, number>();
  for (const r of refRows) {
    // Supabase joined object can come back as a single object or an
    // array depending on FK cardinality — handle both safely.
    const ref = Array.isArray(r.legal_references) ? r.legal_references[0] : r.legal_references;
    const name = ref?.law_name
      ? (ref.section ? `${ref.law_name} (${ref.section})` : ref.law_name)
      : 'Unknown reference';
    refCounts.set(name, (refCounts.get(name) ?? 0) + 1);
  }
  const topCitedRefs = Array.from(refCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

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

  const jsOutgoings = validDebits.reduce((sum, tx) => sum + tx.amount, 0);

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
      percentage: jsOutgoings > 0 ? parseFloat(((data.total / jsOutgoings) * 100).toFixed(1)) : 0,
      transactionCount: data.count,
    }))
    .sort((a, b) => b.total - a.total);

  // JS fallback monthly aggregation (used when an RPC call fails)
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

  // Monthly trends — exactly 12 buckets covering the rolling window.
  // Where possible each month's totals come from the same canonical DB
  // RPCs Money Hub uses (get_monthly_spending_breakdown +
  // get_monthly_income_total) so the report and Money Hub agree; the JS
  // aggregation above is the fallback per month.
  const monthlyTrends: MonthlyTrend[] = await Promise.all(
    monthKeys.map(async (month) => {
      const [y, m] = month.split('-').map(Number);
      const fallback = monthlyMap[month] || { spend: 0, income: 0 };
      let spend = fallback.spend;
      let income = fallback.income;
      try {
        const [spendRes, incomeRes] = await Promise.all([
          admin.rpc('get_monthly_spending_breakdown', { p_user_id: userId, p_year: y, p_month: m }),
          admin.rpc('get_monthly_income_total', { p_user_id: userId, p_year: y, p_month: m }),
        ]);
        if (!spendRes.error) {
          const row = Array.isArray(spendRes.data) ? spendRes.data[0] : spendRes.data;
          const rpcSpend = parseFloat(String((row as { spending_total?: number | string } | null)?.spending_total ?? ''));
          if (!Number.isNaN(rpcSpend)) spend = rpcSpend;
        }
        if (!incomeRes.error && incomeRes.data !== null && incomeRes.data !== undefined) {
          const rpcIncome = parseFloat(String(incomeRes.data));
          if (!Number.isNaN(rpcIncome)) income = rpcIncome;
        }
      } catch {
        // Keep the JS fallback for this month.
      }
      return {
        month,
        monthLabel: MONTH_LABELS[month.split('-')[1]] || month.split('-')[1],
        spend: parseFloat(spend.toFixed(2)),
        income: parseFloat(income.toFixed(2)),
        hasData: spend > 0 || income > 0,
      };
    }),
  );

  // Headline totals from the monthly buckets so the numbers on the
  // report agree with the chart (and with Money Hub's month cards).
  const totalOutgoings = monthlyTrends.reduce((s, m) => s + m.spend, 0);
  const totalIncome = monthlyTrends.reduce((s, m) => s + m.income, 0);

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

  // Build subscription list with guidance (real deal intelligence)
  let totalSubSavings = 0;

  const subscriptionsList: SubscriptionWithGuidance[] = activeSubs
    .map(s => {
      const amt = parseFloat(String(s.amount)) || 0;
      const monthlyCost = s.billing_cycle === 'yearly' ? amt / 12 : s.billing_cycle === 'quarterly' ? amt / 3 : amt;
      const annualCost = monthlyCost * 12;
      const displayName = cleanMerchantName(s.provider_name);
      const cheaperDeal = findRealDeal(s.id, dealIntel);

      const matchingAlert = priceAlerts.find(a =>
        normaliseMerchantName(a.merchant_name).toLowerCase() === displayName.toLowerCase()
      );

      let guidance: SubscriptionWithGuidance['guidance'];

      if (cheaperDeal) {
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
          message: `Price went up ${parseFloat(String(matchingAlert.increase_pct)).toFixed(1)}%`,
          actionUrl: `/dashboard/complaints?company=${encodeURIComponent(displayName)}`,
          annualSaving: parseFloat(String(matchingAlert.annual_impact)) || 0,
        };
      } else {
        guidance = { type: 'competitive', message: noDealGuidance(s.id, dealIntel).message, actionUrl: '/dashboard/deals' };
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
          pctChange: parseFloat(String(matchingAlert.increase_pct)),
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
      pctChange: parseFloat(String(a.increase_pct)),
      annualImpact: parseFloat(String(a.annual_impact)),
      status: a.status,
    }));
  const totalPriceIncreaseImpact = priceAlertItems.reduce((sum, a) => sum + a.annualImpact, 0);

  // --- Disputes ---
  const disputeItems: DisputeItem[] = disputes.map(d => ({
    id: d.id,
    company: d.provider_name || 'Unknown',
    issue: (d.issue_summary || `Dispute for ${d.disputed_amount ? '£'+d.disputed_amount : 'unknown amount'}`).substring(0, 100),
    dateFiled: d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB') : '',
    status: d.status || 'open',
  }));

  const totalDisputedAmount = disputes.reduce((sum, d) => sum + (parseFloat(String(d.disputed_amount)) || 0), 0);
  // recovered_amount_gbp is the canonical mirror; money_recovered is the
  // legacy column. Take whichever is populated per dispute.
  const recoveredFor = (d: { money_recovered?: number | string | null; recovered_amount_gbp?: number | string | null }) =>
    Math.max(parseFloat(String(d.money_recovered)) || 0, parseFloat(String(d.recovered_amount_gbp)) || 0);
  const disputesRecovered = disputes.reduce((sum, d) => sum + recoveredFor(d), 0);

  // --- Disputes recovery story (v4) ---
  const RESOLVED_STATUSES = new Set(['resolved_won', 'resolved_partial', 'resolved_lost', 'closed']);
  const disputeWins = disputes.filter(d => d.outcome === 'won' || d.status === 'resolved_won').length;
  const disputePartials = disputes.filter(d => d.outcome === 'partial' || d.status === 'resolved_partial').length;
  const disputeLosses = disputes.filter(d => d.outcome === 'lost' || d.status === 'resolved_lost').length;
  const disputesInProgress = disputes.filter(d => !d.outcome && !RESOLVED_STATUSES.has(String(d.status || ''))).length;
  const resolutionTimes = disputes
    .map(d => Number(d.resolution_time_days))
    .filter(n => Number.isFinite(n) && n > 0);
  const disputesDetail: DisputesRecoverySummary = {
    totalDisputes: disputes.length,
    totalRecovered: parseFloat(disputesRecovered.toFixed(2)),
    wins: disputeWins,
    partialWins: disputePartials,
    lost: disputeLosses,
    inProgress: disputesInProgress,
    averageResolutionDays: resolutionTimes.length > 0
      ? Math.round(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
      : null,
  };

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

  // Financial Health Score (real inputs, 2026-08-20)
  const actionedAlerts = allPriceAlerts.filter(a => a.status === 'actioned').length;

  // Convert monthlyTrends to the ScoreInput format (need income and outgoings)
  const monthlyTrendsForScore = monthlyTrends.map(mt => ({
    income: mt.income,
    outgoings: mt.spend,
  }));

  const monthsWithData = Math.max(1, monthlyTrends.filter(m => m.hasData).length);
  const avgMonthlyIncome = totalIncome > 0 ? Math.round(totalIncome / monthsWithData) : 0;
  const avgMonthlyOutgoings = totalOutgoings > 0 ? Math.round(totalOutgoings / monthsWithData) : 0;

  // Budget adherence — average monthly spend per category vs limit.
  const budgetInputs = budgets
    .filter(b => Number(b.monthly_limit) > 0)
    .map(b => {
      const key = normalizeSpendingCategoryKey(b.category);
      const catTotal = categoryTotals[key]?.total || 0;
      return {
        monthly_limit: Number(b.monthly_limit) || 0,
        spent: catTotal / monthsWithData,
      };
    });

  // Liquid savings — sum of connected account balances.
  const liquidSavings = bankConns
    .filter(b => b.status === 'active')
    .reduce((sum, b) => sum + (parseFloat(String(b.current_balance)) || 0), 0);

  // Debt from Money Hub liabilities.
  const totalLiabilities = liabilities.reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);
  const totalMonthlyDebtPayments = liabilities.reduce((s, l) => s + (parseFloat(String(l.monthly_payment)) || 0), 0);
  const creditCardBalance = liabilities
    .filter(l => l.liability_type === 'credit_card')
    .reduce((s, l) => s + (parseFloat(String(l.outstanding_balance)) || 0), 0);

  const financialHealth = calculateHealthScore({
    monthlyIncome: avgMonthlyIncome,
    monthlyOutgoings: avgMonthlyOutgoings,
    budgets: budgetInputs,
    monthlyTrends: monthlyTrendsForScore,
    liquidSavings: Math.max(0, liquidSavings),
    goals: goals.map(g => ({ target_amount: g.target_amount, current_amount: g.current_amount })),
    totalMonthlyDebtPayments,
    totalDebt: totalLiabilities,
    previousMonthDebt: totalLiabilities,
    creditCardBalance,
    creditCardLimit: 0,
    expectedBillsPaid: activeSubs.length,
    expectedBillsTotal: activeSubs.length,
    contractsTracked: activeSubs.filter(s => s.contract_end_date).length,
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

  // --- v4 sections (2026-08-20) ---

  // Email scanner findings summary
  const findingTypeTotals = new Map<string, { count: number; totalAmount: number }>();
  let findingsPotentialValue = 0;
  for (const f of emailFindingRows) {
    const type = String(f.finding_type || 'other');
    const amount = parseFloat(String(f.amount)) || 0;
    const entry = findingTypeTotals.get(type) || { count: 0, totalAmount: 0 };
    entry.count += 1;
    entry.totalAmount += amount;
    findingTypeTotals.set(type, entry);
    if (f.status !== 'dismissed') findingsPotentialValue += amount;
  }
  const emailFindings: EmailFindingsSummary = {
    totalFindings: emailFindingRows.length,
    newFindings: emailFindingRows.filter(f => f.status === 'new').length,
    actionedFindings: emailFindingRows.filter(f => f.status === 'actioned').length,
    refundOpportunities: emailFindingRows.filter(f => f.finding_type === 'refund_opportunity').length,
    totalPotentialValue: parseFloat(findingsPotentialValue.toFixed(2)),
    urgentCount: emailFindingRows.filter(f => f.urgency === 'immediate').length,
    byType: Array.from(findingTypeTotals.entries())
      .map(([type, v]) => ({ type, count: v.count, totalAmount: parseFloat(v.totalAmount.toFixed(2)) }))
      .sort((a, b) => b.count - a.count),
  };

  // Upcoming committed payments (next 30 days, outgoing)
  const upcomingItems = upcomingPaymentRows.map(p => ({
    counterparty: cleanMerchantName(String(p.counterparty || '')) || 'Unknown',
    amount: Math.abs(parseFloat(String(p.amount)) || 0),
    expectedDate: String(p.expected_date || ''),
    source: String(p.source || ''),
  }));
  const upcomingPayments: UpcomingPaymentsSummary = {
    next30DayCount: upcomingItems.length,
    totalCommitted: parseFloat(upcomingItems.reduce((s, p) => s + p.amount, 0).toFixed(2)),
    items: upcomingItems.slice(0, 20),
  };

  // Verified savings — confirmed outcomes only
  const verifiedSavings: VerifiedSavingsSummary = {
    count: verifiedSavingRows.length,
    totalSaved: parseFloat(verifiedSavingRows.reduce((s, v) => s + (parseFloat(String(v.amount_saved)) || 0), 0).toFixed(2)),
    totalAnnualSaving: parseFloat(verifiedSavingRows.reduce((s, v) => s + (parseFloat(String(v.annual_saving)) || 0), 0).toFixed(2)),
    items: verifiedSavingRows.slice(0, 20).map(v => ({
      savingType: String(v.saving_type || 'other'),
      title: String(v.title || 'Verified saving'),
      amountSaved: parseFloat(String(v.amount_saved)) || 0,
      annualSaving: parseFloat(String(v.annual_saving)) || 0,
      confirmedAt: v.confirmed_at ? String(v.confirmed_at) : null,
    })),
  };

  // Budgets vs actual (average monthly spend per category)
  const budgetsVsActual: BudgetVsActual[] = budgets
    .filter(b => Number(b.monthly_limit) > 0)
    .map(b => {
      const key = normalizeSpendingCategoryKey(b.category);
      const actual = (categoryTotals[key]?.total || 0) / monthsWithData;
      const limit = Number(b.monthly_limit) || 0;
      const ratio = limit > 0 ? actual / limit : 0;
      return {
        category: key,
        label: getReportCategoryLabel(key),
        monthlyLimit: parseFloat(limit.toFixed(2)),
        actualMonthlyAverage: parseFloat(actual.toFixed(2)),
        status: (ratio > 1 ? 'over' : ratio > 0.8 ? 'close' : 'under') as BudgetVsActual['status'],
      };
    })
    .sort((a, b) => (b.actualMonthlyAverage / (b.monthlyLimit || 1)) - (a.actualMonthlyAverage / (a.monthlyLimit || 1)));

  // Net worth — manually tracked assets minus liabilities (no Open
  // Banking balances here, matching Money Hub's FCA-compliant approach)
  const totalAssets = assets.reduce((s, a) => s + (parseFloat(String(a.estimated_value)) || 0), 0);
  const netWorth: NetWorthSummary = {
    totalAssets: parseFloat(totalAssets.toFixed(2)),
    totalLiabilities: parseFloat(totalLiabilities.toFixed(2)),
    netWorth: parseFloat((totalAssets - totalLiabilities).toFixed(2)),
    goals: goals.slice(0, 10).map(g => ({
      name: g.name,
      targetAmount: g.target_amount,
      currentAmount: g.current_amount,
      progressPct: g.target_amount > 0 ? Math.min(100, parseFloat(((g.current_amount / g.target_amount) * 100).toFixed(1))) : 0,
    })),
  };

  const reportWindow: ReportWindow = {
    start: yearStartDt.toISOString(),
    end: yearEnd,
    label: windowLabel,
  };

  // Executive Summary (template fallback; the API route replaces this
  // with an AI-written summary when the Anthropic call succeeds)
  const topCategory = spendingByCategory[0] || null;
  const savingsRatePct = totalIncome > 0
    ? parseFloat((((totalIncome - totalOutgoings) / totalIncome) * 100).toFixed(1))
    : null;
  const executiveSummary = buildExecutiveSummary({
    monthlySpend: totalOutgoings,
    activeSubs: activeSubs.length,
    priceAlertCount: priceAlertItems.length,
    priceAlertCost: totalPriceIncreaseImpact,
    potentialSavings: totalSubSavings,
    disputes: disputes.length,
    monthlySubCost: monthlySubscriptionCost,
    totalDisputedAmount,
    disputesRecovered,
    topCategoryLabel: topCategory?.label ?? null,
    topCategoryTotal: topCategory?.total ?? null,
    savingsRatePct,
    windowLabel,
  });

  // Data-driven next actions fallback (the API route replaces these
  // with AI-written actions when available).
  const nextActions: string[] = [];
  for (const action of savingsActions.slice(0, 3)) {
    nextActions.push(`${action.description} (${action.provider}): save around £${action.annualSaving} a year.`);
  }
  if (emailFindings.refundOpportunities > 0) {
    nextActions.push(`Review ${emailFindings.refundOpportunities} refund opportunit${emailFindings.refundOpportunities === 1 ? 'y' : 'ies'} found in your email scans.`);
  }
  if (disputesInProgress > 0) {
    nextActions.push(`Chase your ${disputesInProgress} open dispute${disputesInProgress === 1 ? '' : 's'} for a response.`);
  }
  if (nextActions.length === 0) {
    nextActions.push('Connect more accounts so we can find savings across everything you pay for.');
  }

  const userName = profile?.full_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'User';
  const userPlan = profile?.subscription_tier
    ? profile.subscription_tier.charAt(0).toUpperCase() + profile.subscription_tier.slice(1) + ' Plan'
    : 'Free Plan';

  // ── v2 derived fields (data-driven, replace shallow AI prose) ───────
  // Forward projection: average of the last 3 months of spend × 12.
  // Recent months reflect current behaviour better than the rolling
  // 12-month average (which dilutes recent changes).
  const recent3 = monthlyTrends.slice(-3).filter((m) => m.hasData);
  const avgRecentSpend = recent3.length > 0
    ? recent3.reduce((s, m) => s + (m.spend ?? 0), 0) / recent3.length
    : 0;
  const avgRecentIncome = recent3.length > 0
    ? recent3.reduce((s, m) => s + (m.income ?? 0), 0) / recent3.length
    : 0;
  const projectedAnnualSpend = parseFloat((avgRecentSpend * 12).toFixed(2));
  const projectedAnnualIncome = parseFloat((avgRecentIncome * 12).toFixed(2));

  // Savings rate by month — (income - spend) / income, clamped to
  // [-1, 1] so a one-off zero-income month doesn't blow the chart.
  const savingsRateByMonth = monthlyTrends.map((m) => ({
    month: m.month,
    monthLabel: m.monthLabel,
    rate: m.income > 0
      ? Math.max(-1, Math.min(1, (m.income - m.spend) / m.income))
      : 0,
  }));

  // Year-over-year — pull the same rolling window shifted back one
  // year. Compare totals against the current period.
  const prevYearStartDt = new Date(yearStartDt);
  prevYearStartDt.setFullYear(prevYearStartDt.getFullYear() - 1);
  const prevYearEndDt = new Date(yearStartDt);
  let yoy: AnnualReportData['yoy'] = null;
  try {
    const { data: prevTx } = await admin
      .from('bank_transactions')
      .select('amount, is_pending, transfer_pair_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .gte('timestamp', prevYearStartDt.toISOString())
      .lt('timestamp', prevYearEndDt.toISOString());
    if (prevTx && prevTx.length > 0) {
      let prevIncome = 0;
      let prevSpend = 0;
      for (const t of prevTx) {
        if (!isCountableTransaction(t as TxRow)) continue;
        const amt = Number(t.amount) || 0;
        if (amt > 0) prevIncome += amt;
        else prevSpend += Math.abs(amt);
      }
      const prevNet = prevIncome - prevSpend;
      const currNet = totalIncome - totalOutgoings;
      yoy = {
        previousIncome: parseFloat(prevIncome.toFixed(2)),
        previousSpend: parseFloat(prevSpend.toFixed(2)),
        incomeDeltaPct: prevIncome > 0 ? parseFloat((((totalIncome - prevIncome) / prevIncome) * 100).toFixed(1)) : 0,
        spendDeltaPct: prevSpend > 0 ? parseFloat((((totalOutgoings - prevSpend) / prevSpend) * 100).toFixed(1)) : 0,
        netDeltaPct: Math.abs(prevNet) > 0.01 ? parseFloat((((currNet - prevNet) / Math.abs(prevNet)) * 100).toFixed(1)) : 0,
      };
    }
  } catch {
    // Non-fatal; YoY just stays null.
  }

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

    // v2 fields
    projectedAnnualSpend,
    projectedAnnualIncome,
    savingsRateByMonth,
    yoy,

    // v4 fields (2026-08-20)
    reportWindow,
    emailFindings,
    upcomingPayments,
    verifiedSavings,
    disputesDetail,
    budgetsVsActual,
    netWorth,
    nextActions,

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

    // v3 — Tool usage roll-up so the report walks every part of the
    // system the user has access to (founder ask 2026-05-02).
    toolUsage: {
      pocketAgent: {
        telegramConnected: !!tg,
        whatsappConnected: !!wa,
        telegramLinkedAt: tg?.linked_at ?? null,
        whatsappLinkedAt: wa?.linked_at ?? null,
        lastTelegramAt: tg?.last_message_at ?? null,
        lastWhatsappAt: wa?.last_message_at ?? null,
      },
      disputesAI: {
        totalRaised: disputes.length,
        won: disputes.filter((d) => (d as { status?: string }).status === 'resolved_won').length,
        partial: disputes.filter((d) => (d as { status?: string }).status === 'resolved_partial').length,
        lost: disputes.filter((d) => (d as { status?: string }).status === 'resolved_lost').length,
        stillOpen: disputes.filter((d) => {
          const status = (d as { status?: string }).status;
          return !!status && !status.startsWith('resolved') && status !== 'closed' && status !== 'withdrawn' && status !== 'timeout';
        }).length,
        moneyRecoveredGbp: parseFloat(
          disputes
            .reduce((s, d) => s + (Number((d as { money_recovered?: number }).money_recovered) || 0), 0)
            .toFixed(2),
        ),
      },
      complianceCentre: {
        citationsUsedInYourLetters: refRows.length,
        topCitedRefs,
      },
      moneyHub: {
        // Match the active-only filter used for `connectedBanks` above
        // (line ~1073) — bank_connections is queried unfiltered, so a
        // disconnected/expired link would otherwise overstate usage.
        connectedBanks: bankConns.filter((b) => b.status === 'active').length,
        connectedEmails: emailConns.length,
        transactionsAnalysed: transactions.length,
        monthsOfData: dataMonths,
      },
      incomeAlerts: {
        received: incomeAlertRows.length,
        // notification_log doesn't carry the amount, so we cross-
        // reference the txn id (encoded in reference_key) against the
        // transactions we already loaded for the window.
        totalLandedGbp: (() => {
          const txMap = new Map(transactions.map((t) => [(t as { id?: string }).id, Number((t as { amount?: number | string }).amount)]));
          let total = 0;
          for (const r of incomeAlertRows) {
            const txId = r.reference_key.replace(/^income_received_/, '');
            const amt = txMap.get(txId);
            if (typeof amt === 'number' && amt > 0) total += amt;
          }
          return parseFloat(total.toFixed(2));
        })(),
      },
      subscriptions: {
        tracked: activeSubs.length + cancelledSubs.length,
        cancelled: cancelledSubs.length,
        monthlyCostGbp: parseFloat(monthlySubscriptionCost.toFixed(2)),
        annualSavedFromCancellationsGbp: parseFloat(annualSavingsFromCancellations.toFixed(2)),
      },
      deals: {
        explored: dealClicks.length,
      },
    },
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
  disputesRecovered?: number;
  topCategoryLabel?: string | null;
  topCategoryTotal?: number | null;
  savingsRatePct?: number | null;
  windowLabel?: string;
}): string {
  const parts: string[] = [];
  const gbp = (n: number, dp = 0) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const windowPhrase = data.windowLabel ? `Over the last 12 months (${data.windowLabel})` : 'Over the last 12 months';

  if (data.monthlySpend > 0 || data.activeSubs > 0) {
    const spendStr = data.monthlySpend > 0 ? gbp(data.monthlySpend, 2) : '';
    const subsStr = data.activeSubs > 0 ? `${data.activeSubs} active subscription${data.activeSubs === 1 ? '' : 's'} and regular payments totalling ${gbp(data.monthlySubCost)} a month` : '';

    if (spendStr && subsStr) {
      parts.push(`${windowPhrase}, you spent approximately ${spendStr}, including ${subsStr}.`);
    } else if (spendStr) {
      parts.push(`${windowPhrase}, your total spending was ${spendStr}.`);
    } else if (subsStr) {
      parts.push(`You currently have ${subsStr}.`);
    }
  }

  if (data.topCategoryLabel && data.topCategoryTotal && data.topCategoryTotal > 0) {
    parts.push(`Your biggest spending category was ${data.topCategoryLabel} at ${gbp(data.topCategoryTotal)}.`);
  }

  if (typeof data.savingsRatePct === 'number') {
    if (data.savingsRatePct >= 0) {
      parts.push(`You kept ${data.savingsRatePct.toFixed(1)}% of your income after spending.`);
    } else {
      parts.push(`Your spending was higher than your income over this period.`);
    }
  }

  if (data.disputes > 0) {
    if (data.disputesRecovered && data.disputesRecovered > 0) {
      parts.push(`Your ${data.disputes} dispute${data.disputes !== 1 ? 's' : ''} have recovered ${gbp(data.disputesRecovered)} so far.`);
    } else {
      const dispAmountStr = data.totalDisputedAmount ? ` worth ${gbp(data.totalDisputedAmount)} in potential recovery` : '';
      parts.push(`You have ${data.disputes} dispute${data.disputes !== 1 ? 's' : ''}${dispAmountStr}.`);
    }
  }

  if (data.priceAlertCount > 0) {
    parts.push(`We detected ${data.priceAlertCount} price increase${data.priceAlertCount !== 1 ? 's' : ''} costing you an extra ${gbp(data.priceAlertCost)} a year.`);
  }

  if (data.potentialSavings > 0) {
    parts.push(`Based on live market comparisons, we have identified potential savings of ${gbp(data.potentialSavings)} a year.`);
  }

  return parts.join(' ') || 'Your financial report is ready. Connect your bank account and add subscriptions to unlock personalised insights.';
}
