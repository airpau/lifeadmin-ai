'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  FileText, Loader2, ArrowLeft, Download, TrendingUp, CreditCard,
  PiggyBank, AlertTriangle, Shield, Wallet, Target, ExternalLink,
  CheckCircle2, Mail, Building2, Lock, CalendarClock, Scale,
  ListChecks, Landmark, Inbox,
} from 'lucide-react';
import { formatGBP } from '@/lib/format';
import type { AnnualReportData } from '@/lib/report-generator';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const PIE_COLORS = [
  '#059669', '#2563EB', '#D97706', '#DC2626', '#7C3AED',
  '#EA580C', '#0284C7', '#C026D3', '#16A34A', '#CA8A04',
];

const DISCLAIMER = 'This report is a factual summary of your own accounts and activity. It is general information, not financial advice.';

function windowTitle(data: AnnualReportData): string {
  if (data.reportWindow?.label) return `Your last 12 months: ${data.reportWindow.label}`;
  const months = data.monthlyTrends;
  if (months.length > 0) {
    const fmt = (yyyymm: string) => {
      const [y, m] = yyyymm.split('-').map(Number);
      return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    };
    return `Your last 12 months: ${fmt(months[0].month)} to ${fmt(months[months.length - 1].month)}`;
  }
  return 'Your last 12 months';
}

function AnnualReportContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');

  const [data, setData] = useState<AnnualReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [proGated, setProGated] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (reportId) {
          // Load a previously saved report
          const res = await fetch(`/api/reports?id=${encodeURIComponent(reportId)}`);
          const json = await res.json();
          if (!res.ok) {
            if (!cancelled) setError(json.error || 'Failed to load report');
            return;
          }
          if (!cancelled) setData(json.report?.data ?? null);
          return;
        }
        const res = await fetch('/api/reports/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'annual', year: new Date().getFullYear() }),
        });
        if (res.status === 403) {
          if (!cancelled) setProGated(true);
          return;
        }
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(json.error || 'Failed to generate report');
          return;
        }
        if (!cancelled) setData(json.data);
      } catch {
        if (!cancelled) setError('Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [reportId]);

  const handleDownloadPDF = async () => {
    if (!data) return;
    setPdfLoading(true);
    try {
      const { renderReportPdf } = await import('@/components/reports/ReportPDF');
      await renderReportPdf(data);
    } catch {
      alert('PDF generation failed');
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
        <p className="text-slate-600 text-sm">{reportId ? 'Loading your report…' : 'Generating your report…'}</p>
        <p className="text-slate-500 text-xs">This may take a few seconds</p>
      </div>
    );
  }

  if (proGated) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <Lock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Financial reports are a Pro feature</h1>
        <p className="text-slate-600 mb-6">
          A full 12-month picture of your money: spending analysis, savings found,
          disputes recovered, and PDF export. Available on the Pro plan (£9.99/month or £99.99/year).
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

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-8 w-8 text-rose-600" />
        <p className="text-rose-600 text-sm">{error}</p>
        <Link href="/dashboard/profile" className="text-emerald-600 text-sm hover:underline">← Back to Profile</Link>
      </div>
    );
  }

  if (!data) return null;

  const trendData = data.monthlyTrends.filter(m => m.hasData).map(m => ({
    month: m.monthLabel,
    Spending: m.spend,
    Income: m.income,
  }));

  const pieData = data.spendingByCategory.slice(0, 8).map(c => ({
    name: c.label,
    value: c.total,
  }));

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/dashboard/profile" className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-all text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to Profile
        </Link>
        <button
          onClick={handleDownloadPDF}
          disabled={pdfLoading}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold px-4 py-2 rounded-xl transition-all disabled:opacity-50 text-sm"
        >
          {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {pdfLoading ? 'Generating PDF…' : 'Download PDF'}
        </button>
      </div>

      {/* Report Header Card */}
      <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl p-8 mb-6">
        <p className="text-emerald-600 text-xs font-semibold uppercase tracking-widest mb-2">Paybacker Financial Report</p>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">{windowTitle(data)}</h1>
        <p className="text-slate-600 text-sm">
          {data.userName} &middot; {data.userPlan} &middot; Member for {data.daysAsMember} days &middot; Generated {new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Executive Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-600" />Executive Summary</h2>
        <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{data.executiveSummary}</p>
      </div>

      {/* Next Actions */}
      {data.nextActions && data.nextActions.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2"><ListChecks className="h-5 w-5 text-emerald-700" />Your Next Actions</h2>
          <ol className="space-y-2 list-none">
            {data.nextActions.map((action, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                <span className="text-sm text-slate-800">{action}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Financial Health Score */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-emerald-600" />Financial Health Score</h2>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-32 h-32 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#E2E8F0" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={data.financialHealth.tier === 'healthy' ? '#059669' : data.financialHealth.tier === 'coping' ? '#D97706' : '#DC2626'} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(data.financialHealth.overall / 100) * 327} 327`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-slate-900">{data.financialHealth.overall}</span>
              <span className="text-xs text-slate-600">/ 100</span>
            </div>
          </div>
          <div className="flex-1 w-full">
            <p className={`text-xl font-bold ${data.financialHealth.tier === 'healthy' ? 'text-emerald-700' : data.financialHealth.tier === 'coping' ? 'text-amber-600' : 'text-rose-600'} mb-1`}>
              {data.financialHealth.tier.charAt(0).toUpperCase() + data.financialHealth.tier.slice(1)}
            </p>
            <div className="space-y-2 mt-3">
              {Object.entries(data.financialHealth.pillars).map(([key, pillar]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-slate-600">{pillar.label}</span><span className="text-slate-700">{pillar.score}%</span></div>
                  <div className="bg-slate-100 rounded-full h-2"><div className="h-2 rounded-full transition-all" style={{ width: `${pillar.score}%`, backgroundColor: data.financialHealth.tier === 'healthy' ? '#059669' : data.financialHealth.tier === 'coping' ? '#D97706' : '#DC2626' }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Income vs Spending Overview */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-600" />Income & Spending</h2>
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 text-center">
            <p className="text-[11px] text-slate-600 mb-1">Total Income</p>
            <p className="text-xl font-bold text-emerald-700">{formatGBP(data.totalIncome)}</p>
          </div>
          <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 text-center">
            <p className="text-[11px] text-slate-600 mb-1">Total Spending</p>
            <p className="text-xl font-bold text-rose-600">{formatGBP(data.totalOutgoings)}</p>
          </div>
          <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 text-center">
            <p className="text-[11px] text-slate-600 mb-1">Savings Rate</p>
            <p className={`text-xl font-bold ${data.totalIncome > 0 && data.totalIncome >= data.totalOutgoings ? 'text-emerald-700' : data.totalIncome > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
              {data.totalIncome > 0 ? `${(((data.totalIncome - data.totalOutgoings) / data.totalIncome) * 100).toFixed(1)}%` : 'N/A'}
            </p>
          </div>
        </div>
        {trendData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} barGap={4}>
                <XAxis dataKey="month" tick={{ fill: '#475569', fontSize: 11 }} axisLine={{ stroke: '#CBD5E1' }} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, color: '#0F172A', fontSize: 12 }}
                  formatter={(value) => [formatGBP(Number(value))]} />
                <Bar dataKey="Income" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="Spending" fill="#DC2626" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Spending by Category */}
      {data.spendingByCategory.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Target className="h-5 w-5 text-emerald-600" />Spending by Category</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, color: '#0F172A', fontSize: 12 }}
                    formatter={(value) => [formatGBP(Number(value))]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#475569' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 overflow-y-auto max-h-64">
              {data.spendingByCategory.map((cat, i) => (
                <div key={cat.category} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-sm text-slate-700 flex-1 truncate">{cat.label}</span>
                  <span className="text-sm text-slate-900 font-medium">{formatGBP(cat.total)}</span>
                  <span className="text-xs text-slate-500 w-12 text-right">{cat.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Budgets vs Actual */}
      {data.budgetsVsActual && data.budgetsVsActual.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><Target className="h-5 w-5 text-emerald-600" />Budgets vs Actual</h2>
          <p className="text-sm text-slate-600 mb-4">Your monthly budgets against your average monthly spend over the period.</p>
          <div className="space-y-3">
            {data.budgetsVsActual.map(b => {
              const pct = b.monthlyLimit > 0 ? Math.min((b.actualMonthlyAverage / b.monthlyLimit) * 100, 150) : 0;
              return (
                <div key={b.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{b.label}</span>
                    <span className={`font-medium ${b.status === 'over' ? 'text-rose-600' : b.status === 'close' ? 'text-amber-600' : 'text-emerald-700'}`}>
                      {formatGBP(b.actualMonthlyAverage)} of {formatGBP(b.monthlyLimit)}/mo
                    </span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: b.status === 'over' ? '#DC2626' : b.status === 'close' ? '#D97706' : '#059669' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subscription Deep Dive */}
      {data.subscriptionsList.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600" />Subscriptions</h2>
          <p className="text-sm text-slate-600 mb-4">{data.activeSubscriptions} active &middot; {formatGBP(data.monthlySubscriptionCost)}/mo &middot; {formatGBP(data.annualSubscriptionCost)}/yr</p>
          <div className="space-y-2">
            {data.subscriptionsList.map(sub => (
              <div key={sub.id} className="bg-slate-100/50 rounded-lg p-3 border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-900 font-medium text-sm">{sub.name}</span>
                    {sub.priceChange && <span className="text-[10px] text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">↑ {sub.priceChange.pctChange.toFixed(1)}%</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      sub.guidance.type === 'switch' ? 'bg-emerald-50 text-emerald-700' :
                      sub.guidance.type === 'complain' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'
                    }`}>{sub.guidance.type === 'competitive' ? sub.guidance.message : sub.guidance.type}</span>
                    {sub.guidance.annualSaving && sub.guidance.annualSaving > 0 ? (
                      <span className="text-[10px] text-emerald-700">Save {formatGBP(sub.guidance.annualSaving)}/yr</span>
                    ) : null}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-slate-900 font-semibold text-sm">{formatGBP(sub.monthlyCost)}/mo</p>
                  <p className="text-xs text-slate-500">{formatGBP(sub.annualCost)}/yr</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price Increase Analysis */}
      {data.priceAlerts.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-rose-600" />Price Increases Detected</h2>
          <p className="text-sm text-slate-600 mb-4">Total annual impact: <span className="text-rose-600 font-semibold">{formatGBP(data.totalPriceIncreaseImpact)}/yr</span></p>
          <div className="space-y-2">
            {data.priceAlerts.map(alert => (
              <div key={alert.id} className="bg-slate-100/50 rounded-lg p-3 border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-slate-900 text-sm font-medium">{alert.merchantName}</p>
                  <p className="text-xs text-slate-600">{formatGBP(alert.oldAmount)} → {formatGBP(alert.newAmount)} ({alert.pctChange.toFixed(1)}% increase)</p>
                </div>
                <span className="text-rose-600 font-semibold text-sm">+{formatGBP(alert.annualImpact)}/yr</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Savings Opportunities */}
      {data.savingsActions.length > 0 && (
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><PiggyBank className="h-5 w-5 text-emerald-700" />Savings Opportunities</h2>
            <p className="text-emerald-700 font-bold text-lg">{formatGBP(data.potentialAnnualSavings)}/yr</p>
          </div>
          <div className="space-y-2.5">
            {data.savingsActions.map((action, i) => (
              <a key={i} href={action.actionUrl} target={action.actionUrl.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                className="flex items-center gap-3 bg-white rounded-lg p-3 hover:bg-slate-50 transition-all group border border-slate-200">
                <span className="text-lg">{action.difficultyEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 text-sm font-medium">{action.description} ({action.provider})</p>
                  <p className="text-emerald-700 text-xs font-medium">Save {formatGBP(action.annualSaving)}/yr</p>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-slate-900 transition-all flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Verified Savings */}
      {data.verifiedSavings && data.verifiedSavings.count > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-700" />Verified Savings</h2>
          <p className="text-sm text-slate-600 mb-4">
            Confirmed wins so far: <span className="text-emerald-700 font-semibold">{formatGBP(data.verifiedSavings.totalSaved)}</span> one-off
            {data.verifiedSavings.totalAnnualSaving > 0 && (
              <> plus <span className="text-emerald-700 font-semibold">{formatGBP(data.verifiedSavings.totalAnnualSaving)}/yr</span> ongoing</>
            )}
          </p>
          <div className="space-y-2">
            {data.verifiedSavings.items.map((v, i) => (
              <div key={i} className="bg-slate-100/50 rounded-lg p-3 border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-slate-900 text-sm font-medium">{v.title}</p>
                  <p className="text-xs text-slate-600 capitalize">{v.savingType.replace(/_/g, ' ')}{v.confirmedAt ? ` · ${new Date(v.confirmedAt).toLocaleDateString('en-GB')}` : ''}</p>
                </div>
                <span className="text-emerald-700 font-semibold text-sm">
                  {v.amountSaved > 0 ? formatGBP(v.amountSaved) : v.annualSaving > 0 ? `${formatGBP(v.annualSaving)}/yr` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disputes & Recovery */}
      {data.disputesDetail && data.disputesDetail.totalDisputes > 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Scale className="h-5 w-5 text-blue-600" />Disputes & Money Recovered</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-200 text-center">
              <p className="text-lg font-bold text-emerald-700">{formatGBP(data.disputesDetail.totalRecovered)}</p>
              <p className="text-[10px] text-slate-600">Recovered</p>
            </div>
            <div className="bg-slate-100/50 rounded-xl p-3 border border-slate-200 text-center">
              <p className="text-lg font-bold text-slate-900">{data.disputesDetail.wins}{data.disputesDetail.partialWins > 0 ? ` + ${data.disputesDetail.partialWins} partial` : ''}</p>
              <p className="text-[10px] text-slate-600">Won</p>
            </div>
            <div className="bg-slate-100/50 rounded-xl p-3 border border-slate-200 text-center">
              <p className="text-lg font-bold text-slate-900">{data.disputesDetail.inProgress}</p>
              <p className="text-[10px] text-slate-600">In Progress</p>
            </div>
            <div className="bg-slate-100/50 rounded-xl p-3 border border-slate-200 text-center">
              <p className="text-lg font-bold text-slate-900">{data.disputesDetail.averageResolutionDays ?? 'N/A'}</p>
              <p className="text-[10px] text-slate-600">Avg Days to Resolve</p>
            </div>
          </div>
          {data.disputes.length > 0 && (
            <div className="space-y-2">
              {data.disputes.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-slate-100/50 rounded-lg p-3 border border-slate-200">
                  <div>
                    <p className="text-slate-900 text-sm font-medium">{d.company}</p>
                    <p className="text-xs text-slate-600 truncate max-w-xs">{d.issue}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      d.status.startsWith('resolved_won') || d.status === 'resolved_partial' ? 'bg-emerald-50 text-emerald-700' :
                      d.status === 'open' || d.status === 'awaiting_response' || d.status === 'escalated' ? 'bg-blue-50 text-blue-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>{d.status.replace(/_/g, ' ')}</span>
                    <p className="text-[10px] text-slate-500 mt-0.5">{d.dateFiled}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Email Scanner Findings */}
      {data.emailFindings && data.emailFindings.totalFindings > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><Inbox className="h-5 w-5 text-emerald-600" />Email Scan Findings</h2>
          <p className="text-sm text-slate-600 mb-4">
            {data.emailFindings.totalFindings} finding{data.emailFindings.totalFindings === 1 ? '' : 's'} in the last 12 months
            {data.emailFindings.refundOpportunities > 0 && <>, including <span className="text-emerald-700 font-semibold">{data.emailFindings.refundOpportunities} refund opportunit{data.emailFindings.refundOpportunities === 1 ? 'y' : 'ies'}</span></>}
            {data.emailFindings.totalPotentialValue > 0 && <> worth up to <span className="text-emerald-700 font-semibold">{formatGBP(data.emailFindings.totalPotentialValue)}</span></>}
          </p>
          <div className="space-y-1.5">
            {data.emailFindings.byType.slice(0, 8).map(t => (
              <div key={t.type} className="flex items-center justify-between text-sm">
                <span className="text-slate-700 capitalize">{t.type.replace(/_/g, ' ')}</span>
                <span className="text-slate-900 font-medium">{t.count}{t.totalAmount > 0 ? ` · ${formatGBP(t.totalAmount)}` : ''}</span>
              </div>
            ))}
          </div>
          {data.emailFindings.newFindings > 0 && (
            <p className="text-xs text-amber-600 mt-3">{data.emailFindings.newFindings} finding{data.emailFindings.newFindings === 1 ? '' : 's'} still waiting for your review.</p>
          )}
        </div>
      )}

      {/* Upcoming Payments */}
      {data.upcomingPayments && data.upcomingPayments.next30DayCount > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><CalendarClock className="h-5 w-5 text-emerald-600" />Next 30 Days</h2>
          <p className="text-sm text-slate-600 mb-4">
            {data.upcomingPayments.next30DayCount} committed payment{data.upcomingPayments.next30DayCount === 1 ? '' : 's'} totalling <span className="text-slate-900 font-semibold">{formatGBP(data.upcomingPayments.totalCommitted)}</span>
          </p>
          <div className="space-y-2">
            {data.upcomingPayments.items.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-100/50 rounded-lg p-3 border border-slate-200">
                <div>
                  <p className="text-slate-900 text-sm font-medium">{p.counterparty}</p>
                  <p className="text-xs text-slate-600">{p.expectedDate ? new Date(p.expectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''} · {p.source.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-slate-900 font-semibold text-sm">{formatGBP(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Net Worth */}
      {data.netWorth && (data.netWorth.totalAssets > 0 || data.netWorth.totalLiabilities > 0 || data.netWorth.goals.length > 0) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Landmark className="h-5 w-5 text-emerald-600" />Net Worth & Goals</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 text-center">
              <p className="text-[11px] text-slate-600 mb-1">Assets</p>
              <p className="text-xl font-bold text-emerald-700">{formatGBP(data.netWorth.totalAssets)}</p>
            </div>
            <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 text-center">
              <p className="text-[11px] text-slate-600 mb-1">Liabilities</p>
              <p className="text-xl font-bold text-rose-600">{formatGBP(data.netWorth.totalLiabilities)}</p>
            </div>
            <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 text-center">
              <p className="text-[11px] text-slate-600 mb-1">Net Worth</p>
              <p className={`text-xl font-bold ${data.netWorth.netWorth >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{formatGBP(data.netWorth.netWorth)}</p>
            </div>
          </div>
          {data.netWorth.goals.length > 0 && (
            <div className="space-y-3">
              {data.netWorth.goals.map((g, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-700">{g.name}</span>
                    <span className="text-slate-900 font-medium">{formatGBP(g.currentAmount)} of {formatGBP(g.targetAmount)} ({g.progressPct}%)</span>
                  </div>
                  <div className="bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${Math.min(g.progressPct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-3">Based on the assets and liabilities you have added to Money Hub.</p>
        </div>
      )}

      {/* Connected Accounts & Data Quality */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Building2 className="h-5 w-5 text-emerald-600" />Data Quality & Connections</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-slate-100/50 rounded-xl p-3 border border-slate-200 text-center">
            <p className="text-lg font-bold text-slate-900">{data.connectedBanks.length}</p>
            <p className="text-[10px] text-slate-600">Banks</p>
          </div>
          <div className="bg-slate-100/50 rounded-xl p-3 border border-slate-200 text-center">
            <p className="text-lg font-bold text-slate-900">{data.connectedEmails.length}</p>
            <p className="text-[10px] text-slate-600">Email Accounts</p>
          </div>
          <div className="bg-slate-100/50 rounded-xl p-3 border border-slate-200 text-center">
            <p className="text-lg font-bold text-slate-900">{data.profileCompleteness}%</p>
            <p className="text-[10px] text-slate-600">Profile Complete</p>
          </div>
          <div className="bg-slate-100/50 rounded-xl p-3 border border-slate-200 text-center">
            <p className="text-lg font-bold text-slate-900">{data.dataMonths}</p>
            <p className="text-[10px] text-slate-600">Months of Data</p>
          </div>
        </div>

        {data.connectedBanks.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {data.connectedBanks.map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-slate-700">{b.name}</span>
              </div>
            ))}
          </div>
        )}
        {data.connectedEmails.length > 0 && (
          <div className="space-y-1.5">
            {data.connectedEmails.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-slate-700">{e.email}</span>
                <span className="text-[10px] text-slate-500">{e.provider}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Merchants */}
      {data.topMerchants.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Top Merchants</h2>
          <div className="space-y-2">
            {data.topMerchants.slice(0, 10).map((m, i) => {
              const pct = data.totalOutgoings > 0 ? (m.total / data.totalOutgoings) * 100 : 0;
              return (
                <div key={m.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-5 text-right">{i + 1}</span>
                  <span className="text-sm text-slate-700 flex-1 truncate">{m.name}</span>
                  <div className="w-24 bg-slate-100 rounded-full h-1.5 hidden sm:block">
                    <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.min(pct * 2, 100)}%` }} />
                  </div>
                  <span className="text-sm text-slate-900 font-medium w-20 text-right">{formatGBP(m.total)}</span>
                  <span className="text-xs text-slate-500 w-12 text-right">{m.count} txns</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-slate-500 text-center mb-6">{DISCLAIMER}</p>

      {/* Footer actions */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button onClick={handleDownloadPDF} disabled={pdfLoading}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-semibold px-6 py-3 rounded-xl transition-all disabled:opacity-50">
          {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PDF
        </button>
        <Link href="/dashboard/profile" className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold px-6 py-3 rounded-xl transition-all">
          <ArrowLeft className="h-4 w-4" /> Back to Profile
        </Link>
      </div>
    </div>
  );
}

export default function AnnualReportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
        </div>
      }
    >
      <AnnualReportContent />
    </Suspense>
  );
}
