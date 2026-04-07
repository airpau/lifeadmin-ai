'use client';

import { useState } from 'react';
import {
  FileText,
  TrendingUp,
  CreditCard,
  BarChart3,
  Trophy,
  Download,
  Star,
  ShoppingCart,
  AlertCircle,
} from 'lucide-react';
import { formatGBP } from '@/lib/format';
import type { AnnualReportData, OnDemandReportData } from '@/lib/report-generator';

/* ------------------------------------------------------------------ */
/*  Sample data for non-Pro users                                      */
/* ------------------------------------------------------------------ */

const SAMPLE_ANNUAL: AnnualReportData = {
  year: 2026,
  generatedAt: new Date().toISOString(),
  memberSince: '2025-06-15T00:00:00Z',
  daysAsMember: 284,
  totalMoneyRecovered: 847,
  taskMoneyRecovered: 476,
  subsMoneySaved: 371,
  subscriptionsCancelled: 4,
  annualSavingsFromCancellations: 371,
  activeSubscriptions: 6,
  monthlySubscriptionCost: 52.94,
  complaintsGenerated: 3,
  spendingByCategory: [
    { category: 'groceries', label: 'Food & Groceries', total: 4820, percentage: 28.5, transactionCount: 96 },
    { category: 'mortgage', label: 'Housing & Mortgage', total: 3600, percentage: 21.3, transactionCount: 12 },
    { category: 'energy', label: 'Utilities (Energy)', total: 1920, percentage: 11.4, transactionCount: 12 },
    { category: 'transport', label: 'Transport', total: 1440, percentage: 8.5, transactionCount: 45 },
    { category: 'eating_out', label: 'Eating Out', total: 1200, percentage: 7.1, transactionCount: 28 },
    { category: 'shopping', label: 'Shopping', total: 960, percentage: 5.7, transactionCount: 22 },
    { category: 'streaming', label: 'Entertainment & Streaming', total: 480, percentage: 2.8, transactionCount: 6 },
    { category: 'insurance', label: 'Insurance', total: 360, percentage: 2.1, transactionCount: 4 },
    { category: 'other', label: 'Other / Uncategorised', total: 2120, percentage: 12.6, transactionCount: 38 },
  ],
  monthlyTrends: [
    { month: '2026-01', monthLabel: 'Jan', spend: 1450, income: 3200, hasData: true },
    { month: '2026-02', monthLabel: 'Feb', spend: 1380, income: 3200, hasData: true },
    { month: '2026-03', monthLabel: 'Mar', spend: 1520, income: 3400, hasData: true },
    { month: '2026-04', monthLabel: 'Apr', spend: 1290, income: 3200, hasData: true },
    { month: '2026-05', monthLabel: 'May', spend: 1610, income: 3200, hasData: true },
    { month: '2026-06', monthLabel: 'Jun', spend: 1420, income: 3500, hasData: true },
    { month: '2026-07', monthLabel: 'Jul', spend: 1550, income: 3200, hasData: true },
    { month: '2026-08', monthLabel: 'Aug', spend: 1480, income: 3200, hasData: true },
    { month: '2026-09', monthLabel: 'Sep', spend: 1350, income: 3200, hasData: true },
    { month: '2026-10', monthLabel: 'Oct', spend: 1420, income: 3400, hasData: true },
    { month: '2026-11', monthLabel: 'Nov', spend: 1560, income: 3200, hasData: true },
    { month: '2026-12', monthLabel: 'Dec', spend: 1870, income: 3600, hasData: true },
  ],
  totalIncome: 39400,
  totalOutgoings: 16900,
  netPosition: 22500,
  userName: 'Sample User',
  userPlan: 'Pro Plan',
  executiveSummary: 'Your total spending this period was £16,900.00 across 6 active subscriptions and regular payments. Based on your spending patterns, we\'ve identified potential savings of £480.00/yr through better deals and subscription optimisation.',
  financialHealth: {
    overall: 72,
    tier: 'healthy',
    pillars: {
      spend: { score: 100, label: 'Spend', metrics: [{ name: 'Savings Rate', score: 100, weight: 40, tip: '5/5 fields completed' }] },
      save: { score: 67, label: 'Save', metrics: [{ name: 'Emergency Fund', score: 67, weight: 50, tip: '4/6 on best deals' }] },
      borrow: { score: 50, label: 'Borrow', metrics: [{ name: 'Debt-to-Income', score: 50, weight: 50, tip: '1/2 alerts actioned' }] },
      plan: { score: 75, label: 'Plan', metrics: [{ name: 'Bills Managed', score: 75, weight: 40, tip: '3 disputes filed' }] },
    },
  },
  annualSubscriptionCost: 635.28,
  subscriptionsList: [],
  priceAlerts: [],
  totalPriceIncreaseImpact: 0,
  potentialAnnualSavings: 480,
  savingsActions: [],
  totalDisputes: 3,
  disputes: [],
  connectedBanks: [{ name: 'HSBC', status: 'active' }],
  connectedEmails: [{ email: 'user@example.com', provider: 'Gmail' }],
  dataMonths: 12,
  topMerchants: [
    { name: 'Tesco', total: 2840, count: 96 },
    { name: 'Amazon', total: 1260, count: 34 },
    { name: 'Deliveroo', total: 980, count: 42 },
    { name: 'Sky', total: 720, count: 12 },
    { name: 'British Gas', total: 640, count: 12 },
  ],
  dealClicks: 8,
  challengesCompleted: 5,
  pointsEarned: 2450,
  loyaltyTier: 'Silver',
  totalPoints: 1800,
  profileCompleteness: 100,
  profileCompletenessNum: 100,
  moneyRecoveryScore: 847,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function monthLabel(yyyymm: string): string {
  const parts = yyyymm.split('-');
  return MONTH_LABELS[parts[1]] || parts[1];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface FinancialReportProps {
  data?: AnnualReportData | OnDemandReportData | null;
  type: 'sample' | 'annual' | 'on_demand';
}

export default function FinancialReport({ data, type }: FinancialReportProps) {
  const [pdfLoading, setPdfLoading] = useState(false);

  const isSample = true;
  const report: AnnualReportData = (data as AnnualReportData) || SAMPLE_ANNUAL;
  const isAnnual = true;

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const { renderReportPdf } = await import('./ReportPDF');
      await renderReportPdf(report as AnnualReportData);
    } catch (err) {
      console.error('PDF generation error:', err);
    } finally {
      setPdfLoading(false);
    }
  };

  /* ---- Annual report (sample preview for non-Pro users) ---- */
  const annual = (isSample ? SAMPLE_ANNUAL : report) as AnnualReportData;

  const maxCategorySpend = annual.spendingByCategory[0]?.total || 1;
  const maxMonthlySpend = Math.max(...annual.monthlyTrends.map((m) => m.spend), 1);

  return (
    <div className="space-y-6 relative">
      {/* Sample overlay */}
      {isSample && (
        <div className="absolute inset-0 z-10 flex items-start justify-center pt-32 pointer-events-none">
          <div className="bg-navy-950/90 backdrop-blur-sm border border-mint-400/30 rounded-2xl p-8 text-center pointer-events-auto max-w-md mx-4">
            <Star className="h-10 w-10 text-mint-400 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white mb-2">Sample Report</h3>
            <p className="text-slate-400 text-sm mb-4">
              This is a preview with sample data. Upgrade to Pro to generate your personalised annual financial report.
            </p>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-mint-400 to-mint-500 hover:from-mint-500 hover:to-mint-600 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all"
            >
              Upgrade to Pro
            </a>
          </div>
        </div>
      )}

      <div className={isSample ? 'opacity-40 pointer-events-none select-none' : ''}>
        {/* Hero */}
        <div className="bg-gradient-to-br from-navy-900 via-navy-900 to-mint-400/5 border border-navy-700/50 rounded-2xl p-8 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-mint-400 text-sm font-medium mb-1">Paybacker Financial Report</p>
              <h1 className="text-3xl md:text-4xl font-bold text-white font-[family-name:var(--font-heading)]">
                Your {annual.year} Financial Report
              </h1>
              <p className="text-slate-400 mt-2">
                Member for {annual.daysAsMember} days
              </p>
            </div>
            {!isSample && (
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                className="flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {pdfLoading ? 'Generating...' : 'Download PDF'}
              </button>
            )}
          </div>
        </div>

        {/* Key stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Money Recovered"
            value={formatGBP(annual.totalMoneyRecovered)}
            icon={<TrendingUp className="h-5 w-5" />}
            color="green"
          />
          <StatCard
            label="Subs Cancelled"
            value={String(annual.subscriptionsCancelled)}
            icon={<CreditCard className="h-5 w-5" />}
            color="blue"
          />
          <StatCard
            label="Complaints Sent"
            value={String(annual.complaintsGenerated)}
            icon={<FileText className="h-5 w-5" />}
            color="purple"
          />
          <StatCard
            label="Annual Savings"
            value={formatGBP(annual.annualSavingsFromCancellations)}
            icon={<BarChart3 className="h-5 w-5" />}
            color="mint"
          />
        </div>

        {/* Income vs outgoings */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Income vs Outgoings</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-green-400">Total Income</span>
                  <span className="text-white font-semibold">{formatGBP(annual.totalIncome)}</span>
                </div>
                <div className="w-full bg-navy-800 rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-red-400">Total Outgoings</span>
                  <span className="text-white font-semibold">{formatGBP(annual.totalOutgoings)}</span>
                </div>
                <div className="w-full bg-navy-800 rounded-full h-3">
                  <div
                    className="bg-red-500 h-3 rounded-full"
                    style={{
                      width: `${annual.totalIncome > 0 ? Math.min((annual.totalOutgoings / annual.totalIncome) * 100, 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              {annual.totalIncome > annual.totalOutgoings && (
                <p className="text-sm text-mint-400 font-medium">
                  You saved {formatGBP(annual.totalIncome - annual.totalOutgoings)} this year
                </p>
              )}
            </div>
          </div>

          {/* Subscriptions */}
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Subscriptions</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-400">Active</p>
                <p className="text-2xl font-bold text-white">{annual.activeSubscriptions}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Cancelled</p>
                <p className="text-2xl font-bold text-white">{annual.subscriptionsCancelled}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Monthly Cost</p>
                <p className="text-2xl font-bold text-white">{formatGBP(annual.monthlySubscriptionCost)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400">Saved by Cancelling</p>
                <p className="text-2xl font-bold text-mint-400">{formatGBP(annual.subsMoneySaved)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Spending by category */}
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Spending by Category</h3>
          <div className="space-y-3">
            {annual.spendingByCategory.slice(0, 10).map((cat) => (
              <div key={cat.category}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300 capitalize">{cat.category}</span>
                  <span className="text-white font-medium">
                    {formatGBP(cat.total)}{' '}
                    <span className="text-slate-500">({cat.percentage}%)</span>
                  </span>
                </div>
                <div className="w-full bg-navy-800 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-mint-400 to-mint-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${(cat.total / maxCategorySpend) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly trends */}
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">Monthly Spending Trends</h3>
          <div className="flex items-end gap-1 h-40">
            {annual.monthlyTrends.map((m) => (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-400">{formatGBP(m.spend)}</span>
                <div
                  className="w-full bg-gradient-to-t from-mint-400 to-mint-500 rounded-t transition-all"
                  style={{
                    height: `${(m.spend / maxMonthlySpend) * 100}%`,
                    minHeight: m.spend > 0 ? '4px' : '0',
                  }}
                />
                <span className="text-[10px] text-slate-500">{monthLabel(m.month)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top merchants */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Top 5 Merchants</h3>
            <div className="space-y-3">
              {annual.topMerchants.map((m, i) => (
                <div key={m.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-navy-800 flex items-center justify-center text-xs text-slate-400 font-bold">
                      {i + 1}
                    </span>
                    <span className="text-white text-sm">{m.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-white font-semibold text-sm">{formatGBP(m.total)}</span>
                    <span className="text-slate-500 text-xs ml-1">({m.count}x)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Achievements */}
          <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              Achievements
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-slate-300 text-sm">Challenges Completed</span>
                <span className="text-white font-semibold">{annual.challengesCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300 text-sm">Points Earned</span>
                <span className="text-white font-semibold">{annual.pointsEarned.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300 text-sm">Loyalty Tier</span>
                <span className="text-mint-400 font-semibold">{annual.loyaltyTier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300 text-sm">Total Points Balance</span>
                <span className="text-white font-semibold">{annual.totalPoints.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300 text-sm">Deals Explored</span>
                <span className="text-white font-semibold">{annual.dealClicks}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-300 text-sm">Profile Completeness</span>
                <span className="text-white font-semibold">{annual.profileCompleteness}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Money Recovery Score */}
        <div className="bg-gradient-to-br from-mint-400/10 to-mint-500/5 border border-mint-400/20 rounded-2xl p-8 text-center">
          <p className="text-sm text-mint-400 font-medium mb-1">Money Recovery Score</p>
          <p className="text-5xl font-bold text-white mb-2">{formatGBP(annual.moneyRecoveryScore)}</p>
          <p className="text-slate-400 text-sm">
            Total money recovered + annual savings from cancelled subscriptions
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat card sub-component                                            */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: 'green' | 'blue' | 'purple' | 'mint' | 'red';
}) {
  const bgColors = {
    green: 'bg-green-500/10',
    blue: 'bg-blue-500/10',
    purple: 'bg-purple-500/10',
    mint: 'bg-mint-400/10',
    red: 'bg-red-500/10',
  };
  const textColors = {
    green: 'text-green-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
    mint: 'text-mint-400',
    red: 'text-red-500',
  };

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
      <div className={`${bgColors[color]} w-10 h-10 rounded-full flex items-center justify-center mb-3`}>
        <span className={textColors[color]}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}
