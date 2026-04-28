'use client';

/**
 * /dashboard/insights/annual — Annual report v2.
 *
 * Replaces the prose-heavy "executive summary" report buried under
 * Profile → Subscription with a data-driven, chart-first view that
 * lives where the user looks for money insights — under the Money
 * Hub / Insights area.
 *
 * What's new in v2 (Paul's brief, 28 April 2026):
 *   - YoY comparison panel (this rolling-12-mo vs the previous one)
 *   - Projected annual spend (last-3-month average × 12)
 *   - Savings rate over time chart (income-spend / income, monthly)
 *   - Top merchants bar chart
 *   - Spend-by-category donut
 *   - Income vs spend monthly line chart
 *
 * No prose summary at the top. The numbers tell the story.
 */

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Target,
  Loader2,
  Lock,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import type { AnnualReportData } from '@/lib/report-generator';

const fmtGBP = (n: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
const fmtPct = (n: number, dp = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`;

const CHART_COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16'];

export default function AnnualInsightsPage() {
  const [data, setData] = useState<AnnualReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proGated, setProGated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/reports/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'annual' }),
          cache: 'no-store',
        });
        if (res.status === 403) {
          setProGated(true);
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error('Failed to load annual report');
        const json = await res.json();
        if (!cancelled) setData(json.data ?? json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (proGated) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <Lock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Annual report is a Pro feature</h1>
        <p className="text-slate-600 mb-6">
          Visual annual analytics with YoY comparison, projected spend, and savings-rate
          trends. Available on the Pro plan (£9.99/month or £99.99/year).
        </p>
        <Link
          href="/pricing"
          className="inline-flex items-center px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
        >
          Upgrade to Pro
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto p-8 text-center">
        <p className="text-red-600 mb-4">{error ?? 'No data available'}</p>
        <Link href="/dashboard/money-hub" className="text-emerald-600 hover:underline">← Back to Money Hub</Link>
      </div>
    );
  }

  const months = data.monthlyTrends.filter((m) => m.hasData);
  const incomeVsSpend = months.map((m) => ({
    month: m.monthLabel,
    Income: m.income,
    Spend: m.spend,
    Net: m.income - m.spend,
  }));

  const savingsRateData = data.savingsRateByMonth
    .filter((m) => months.some((mm) => mm.month === m.month))
    .map((m) => ({ month: m.monthLabel, rate: parseFloat((m.rate * 100).toFixed(1)) }));

  const avgSavingsRate = savingsRateData.length > 0
    ? savingsRateData.reduce((s, m) => s + m.rate, 0) / savingsRateData.length
    : 0;

  const topMerchants = data.topMerchants.slice(0, 8).map((m) => ({
    name: m.name.length > 16 ? m.name.slice(0, 14) + '…' : m.name,
    Spend: m.total,
  }));

  const spendCategories = data.spendingByCategory.slice(0, 8);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <Link href="/dashboard/money-hub" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-700 mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Money Hub
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Annual insights</h1>
          <p className="text-slate-600 text-sm mt-1">
            Rolling 12-month view based on {data.dataMonths} month{data.dataMonths === 1 ? '' : 's'} of bank data
            {data.connectedBanks.length > 0 && ` from ${data.connectedBanks.map((b) => b.name).join(', ')}`}.
          </p>
        </div>
      </div>

      {/* Headline KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<Wallet className="h-5 w-5" />}
          label="Income (12mo)"
          value={fmtGBP(data.totalIncome)}
          delta={data.yoy ? data.yoy.incomeDeltaPct : null}
          deltaPositive={(data.yoy?.incomeDeltaPct ?? 0) >= 0}
        />
        <Kpi
          icon={<TrendingDown className="h-5 w-5" />}
          label="Spend (12mo)"
          value={fmtGBP(data.totalOutgoings)}
          delta={data.yoy ? data.yoy.spendDeltaPct : null}
          deltaPositive={(data.yoy?.spendDeltaPct ?? 0) <= 0}
        />
        <Kpi
          icon={<PiggyBank className="h-5 w-5" />}
          label="Net position"
          value={fmtGBP(data.netPosition)}
          delta={data.yoy ? data.yoy.netDeltaPct : null}
          deltaPositive={(data.yoy?.netDeltaPct ?? 0) >= 0}
        />
        <Kpi
          icon={<Target className="h-5 w-5" />}
          label="Projected annual spend"
          value={fmtGBP(data.projectedAnnualSpend)}
          subtext="Based on last 3 months × 12"
        />
      </div>

      {/* Income vs Spend ──────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-6 border border-slate-200/60">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-lg font-semibold">Income vs spend</h2>
          <span className="text-xs text-slate-500">Last {months.length} months</span>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={incomeVsSpend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(v) => fmtGBP(Number(v) || 0)}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
              />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Line type="monotone" dataKey="Income" stroke="#10b981" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Spend" stroke="#ef4444" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Savings rate trend ────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-6 border border-slate-200/60">
        <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-semibold">Savings rate over time</h2>
          <span className="text-sm text-slate-700 font-medium">
            Avg <span className="text-emerald-600">{avgSavingsRate.toFixed(1)}%</span>
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          What share of income you kept each month (income minus spend ÷ income).
        </p>
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={savingsRateData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[Math.min(0, ...savingsRateData.map((d) => d.rate)) - 5, 100]}
              />
              <Tooltip
                formatter={(v) => `${(Number(v) || 0).toFixed(1)}%`}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
              />
              <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2.5} fill="url(#savingsGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend by category — donut */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200/60">
          <h2 className="text-lg font-semibold mb-4">Where your money went</h2>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={spendCategories}
                  dataKey="total"
                  nameKey="label"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={1}
                >
                  {spendCategories.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, _n, p) => [fmtGBP(Number(v) || 0), (p?.payload as { label?: string })?.label ?? '']}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            {spendCategories.slice(0, 5).map((c, i) => (
              <div key={c.category} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-slate-700">{c.label}</span>
                </div>
                <span className="text-slate-600 font-medium">{fmtGBP(c.total)}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Top merchants — bar */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200/60">
          <h2 className="text-lg font-semibold mb-4">Top merchants</h2>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topMerchants} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `£${(v / 1000).toFixed(1)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} width={110} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => fmtGBP(Number(v) || 0)} contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
                <Bar dataKey="Spend" fill="#3b82f6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* YoY comparison ──────────────────────────────────────── */}
      {data.yoy && (
        <section className="bg-white rounded-2xl p-6 border border-slate-200/60">
          <h2 className="text-lg font-semibold mb-1">Year on year</h2>
          <p className="text-xs text-slate-500 mb-4">
            This rolling 12 months vs the previous rolling 12 months.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <YoyCard label="Income" current={data.totalIncome} previous={data.yoy.previousIncome} pct={data.yoy.incomeDeltaPct} positiveIsGood />
            <YoyCard label="Spend" current={data.totalOutgoings} previous={data.yoy.previousSpend} pct={data.yoy.spendDeltaPct} positiveIsGood={false} />
            <YoyCard label="Net" current={data.netPosition} previous={data.yoy.previousIncome - data.yoy.previousSpend} pct={data.yoy.netDeltaPct} positiveIsGood />
          </div>
        </section>
      )}

      {/* Subscriptions ──────────────────────────────────────── */}
      <section className="bg-white rounded-2xl p-6 border border-slate-200/60">
        <h2 className="text-lg font-semibold mb-1">Subscriptions</h2>
        <p className="text-xs text-slate-500 mb-4">
          {data.activeSubscriptions} active · {fmtGBP(data.monthlySubscriptionCost)}/month · {fmtGBP(data.annualSubscriptionCost)}/year
          {data.totalPriceIncreaseImpact > 0 && (
            <span> · <span className="text-amber-600 font-medium">{fmtGBP(data.totalPriceIncreaseImpact)}</span> in detected price increases this year</span>
          )}
        </p>
        {data.potentialAnnualSavings > 0 && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-900">
            <strong>Potential savings: {fmtGBP(data.potentialAnnualSavings)}/year</strong> identified across your active subscriptions.
            <Link href="/dashboard/subscriptions" className="ml-2 text-emerald-700 underline">Review →</Link>
          </div>
        )}
      </section>

      <div className="text-xs text-slate-500 text-center pt-4">
        Generated {new Date(data.generatedAt).toLocaleString('en-GB')} · Member for {data.daysAsMember} days
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  delta = null,
  deltaPositive = true,
  subtext,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta?: number | null;
  deltaPositive?: boolean;
  subtext?: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-200/60">
      <div className="flex items-center gap-2 text-slate-500 text-xs uppercase tracking-wide font-medium">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {delta !== null && (
        <div className={`mt-1 text-xs font-medium inline-flex items-center gap-1 ${deltaPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {deltaPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          <span>{fmtPct(delta)} YoY</span>
        </div>
      )}
      {subtext && <div className="mt-1 text-xs text-slate-500">{subtext}</div>}
    </div>
  );
}

function YoyCard({
  label,
  current,
  previous,
  pct,
  positiveIsGood,
}: {
  label: string;
  current: number;
  previous: number;
  pct: number;
  positiveIsGood: boolean;
}) {
  const good = positiveIsGood ? pct >= 0 : pct <= 0;
  return (
    <div className="rounded-xl border border-slate-200/60 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="mt-1 text-xl font-bold">{fmtGBP(current)}</div>
      <div className={`mt-1 text-xs ${good ? 'text-emerald-600' : 'text-red-600'} font-medium`}>
        {fmtPct(pct)} vs prior 12m ({fmtGBP(previous)})
      </div>
    </div>
  );
}
