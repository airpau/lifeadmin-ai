'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FileText, Loader2, ArrowLeft, Download, TrendingUp, CreditCard,
  PiggyBank, AlertTriangle, Shield, Wallet, Target, ExternalLink,
  CheckCircle2, XCircle, Mail, Building2, ChevronRight
} from 'lucide-react';
import { formatGBP } from '@/lib/format';
import type { AnnualReportData } from '@/lib/report-generator';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const PIE_COLORS = [
  '#34D399', '#60A5FA', '#F59E0B', '#F87171', '#A78BFA',
  '#FB923C', '#38BDF8', '#E879F9', '#4ADE80', '#FBBF24',
];

export default function AnnualReportPage() {
  const [data, setData] = useState<AnnualReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const generate = async () => {
      try {
        const res = await fetch('/api/reports/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'annual', year: new Date().getFullYear() }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Failed to generate report');
          return;
        }
        setData(json.data);
      } catch {
        setError('Failed to generate report');
      } finally {
        setLoading(false);
      }
    };
    generate();
  }, []);

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
        <p className="text-slate-600 text-sm">Generating your annual report…</p>
        <p className="text-slate-500 text-xs">This may take a few seconds</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-8 w-8 text-red-400" />
        <p className="text-red-400 text-sm">{error}</p>
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
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Your {data.year} Annual Report</h1>
        <p className="text-slate-600 text-sm">
          {data.userName} &middot; {data.userPlan} &middot; Member for {data.daysAsMember} days &middot; Generated {new Date(data.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Executive Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-600" />Executive Summary</h2>
        <p className="text-slate-700 text-sm leading-relaxed">{data.executiveSummary}</p>
      </div>

      {/* Financial Health Score */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><Shield className="h-5 w-5 text-emerald-600" />Financial Health Score</h2>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative w-32 h-32 flex-shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#1e293b" strokeWidth="10" />
              <circle cx="60" cy="60" r="52" fill="none" stroke={data.financialHealth.tier === 'healthy' ? '#4ADE80' : data.financialHealth.tier === 'coping' ? '#FBBF24' : '#F87171'} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(data.financialHealth.overall / 100) * 327} 327`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-slate-900">{data.financialHealth.overall}</span>
              <span className="text-xs text-slate-600">/ 100</span>
            </div>
          </div>
          <div className="flex-1 w-full">
            <p className={`text-xl font-bold ${data.financialHealth.tier === 'healthy' ? 'text-green-400' : data.financialHealth.tier === 'coping' ? 'text-amber-400' : 'text-red-400'} mb-1`}>
              {data.financialHealth.tier.charAt(0).toUpperCase() + data.financialHealth.tier.slice(1)}
            </p>
            <div className="space-y-2 mt-3">
              {Object.entries(data.financialHealth.pillars).map(([key, pillar]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-0.5"><span className="text-slate-600">{pillar.label}</span><span className="text-slate-700">{pillar.score}%</span></div>
                  <div className="bg-slate-100 rounded-full h-2"><div className="h-2 rounded-full transition-all" style={{ width: `${pillar.score}%`, backgroundColor: data.financialHealth.tier === 'healthy' ? '#4ADE80' : data.financialHealth.tier === 'coping' ? '#FBBF24' : '#F87171' }} /></div>
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
            <p className="text-xl font-bold text-green-400">{formatGBP(data.totalIncome)}</p>
          </div>
          <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 text-center">
            <p className="text-[11px] text-slate-600 mb-1">Total Spending</p>
            <p className="text-xl font-bold text-red-400">{formatGBP(data.totalOutgoings)}</p>
          </div>
          <div className="bg-slate-100/50 rounded-xl p-4 border border-slate-200 text-center">
            <p className="text-[11px] text-slate-600 mb-1">Savings Rate</p>
            <p className={`text-xl font-bold ${data.totalIncome > 0 && data.totalIncome >= data.totalOutgoings ? 'text-green-400' : data.totalIncome > 0 ? 'text-red-400' : 'text-slate-500'}`}>
              {data.totalIncome > 0 ? `${(((data.totalIncome - data.totalOutgoings) / data.totalIncome) * 100).toFixed(1)}%` : 'N/A'}
            </p>
          </div>
        </div>
        {trendData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} barGap={4}>
                <XAxis dataKey="month" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} tickLine={false} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `£${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#0F1D35', border: '1px solid #334155', borderRadius: 12, color: '#fff', fontSize: 12 }}
                  formatter={(value) => [formatGBP(Number(value))]} />
                <Bar dataKey="Income" fill="#4ADE80" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="Spending" fill="#F87171" radius={[4, 4, 0, 0]} maxBarSize={32} />
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
                  <Tooltip contentStyle={{ backgroundColor: '#0F1D35', border: '1px solid #334155', borderRadius: 12, color: '#fff', fontSize: 12 }}
                    formatter={(value) => [formatGBP(Number(value))]} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#CBD5E1' }} />
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
                    {sub.priceChange && <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">↑ {sub.priceChange.pctChange.toFixed(1)}%</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      sub.guidance.type === 'switch' ? 'bg-emerald-500/10 text-emerald-400' :
                      sub.guidance.type === 'complain' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'
                    }`}>{sub.guidance.type === 'competitive' ? '✓ Good value' : sub.guidance.type}</span>
                    {sub.guidance.annualSaving && sub.guidance.annualSaving > 0 && (
                      <span className="text-[10px] text-emerald-400">Save {formatGBP(sub.guidance.annualSaving)}/yr</span>
                    )}
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
          <h2 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-red-400" />Price Increases Detected</h2>
          <p className="text-sm text-slate-600 mb-4">Total annual impact: <span className="text-red-400 font-semibold">{formatGBP(data.totalPriceIncreaseImpact)}/yr</span></p>
          <div className="space-y-2">
            {data.priceAlerts.map(alert => (
              <div key={alert.id} className="bg-slate-100/50 rounded-lg p-3 border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-slate-900 text-sm font-medium">{alert.merchantName}</p>
                  <p className="text-xs text-slate-600">{formatGBP(alert.oldAmount)} → {formatGBP(alert.newAmount)} ({alert.pctChange.toFixed(1)}% increase)</p>
                </div>
                <span className="text-red-400 font-semibold text-sm">+{formatGBP(alert.annualImpact)}/yr</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Savings Opportunities */}
      {data.savingsActions.length > 0 && (
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-50 border border-emerald-200 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><PiggyBank className="h-5 w-5 text-emerald-400" />Savings Opportunities</h2>
            <p className="text-emerald-400 font-bold text-lg">{formatGBP(data.potentialAnnualSavings)}/yr</p>
          </div>
          <div className="space-y-2.5">
            {data.savingsActions.map((action, i) => (
              <a key={i} href={action.actionUrl} target={action.actionUrl.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
                className="flex items-center gap-3 bg-slate-50/60 rounded-lg p-3 hover:bg-slate-50/80 transition-all group border border-slate-200">
                <span className="text-lg">{action.difficultyEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 text-sm font-medium">{action.description} — {action.provider}</p>
                  <p className="text-emerald-400 text-xs font-medium">Save {formatGBP(action.annualSaving)}/yr</p>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-500 group-hover:text-slate-900 transition-all flex-shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Disputes */}
      {data.disputes.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-400" />Disputes & Complaints ({data.totalDisputes})</h2>
          <div className="space-y-2">
            {data.disputes.map(d => (
              <div key={d.id} className="flex items-center justify-between bg-slate-100/50 rounded-lg p-3 border border-slate-200">
                <div>
                  <p className="text-slate-900 text-sm font-medium">{d.company}</p>
                  <p className="text-xs text-slate-600 truncate max-w-xs">{d.issue}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    d.status === 'resolved' || d.status === 'resolved_success' ? 'bg-green-500/10 text-green-400' :
                    d.status === 'open' || d.status === 'in_progress' ? 'bg-blue-500/10 text-blue-400' :
                    'bg-slate-500/10 text-slate-600'
                  }`}>{d.status.replace(/_/g, ' ')}</span>
                  <p className="text-[10px] text-slate-500 mt-0.5">{d.dateFiled}</p>
                </div>
              </div>
            ))}
          </div>
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
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                <span className="text-slate-700">{b.name}</span>
              </div>
            ))}
          </div>
        )}
        {data.connectedEmails.length > 0 && (
          <div className="space-y-1.5">
            {data.connectedEmails.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-blue-400" />
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

      {/* Footer actions */}
      <div className="flex flex-wrap gap-3 justify-center">
        <button onClick={handleDownloadPDF} disabled={pdfLoading}
          className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-mint-500 hover:to-mint-600 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all disabled:opacity-50">
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
