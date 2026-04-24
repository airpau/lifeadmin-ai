'use client';

import { useEffect, useState } from 'react';
import { Loader2, TrendingUp, TrendingDown, BarChart3, ArrowRight, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatGBP } from '@/lib/format';

interface SpendingData {
  hasData: boolean;
  summary: {
    total_transactions: number;
    total_spend: number;
    total_income: number;
    current_month_spend: number;
    previous_month_spend: number;
    month_change_percent: number;
    months_analysed: number;
    monthly_avg_spend: number;
    monthly_avg_income: number;
  };
  category_breakdown: Array<{
    category: string;
    label: string;
    color: string;
    icon: string;
    total: number;
    monthly_avg: number;
    percentage: number;
  }>;
  category_transactions: Record<string, Array<{ description: string; total: number; count: number; monthly_avg: number }>>;
  monthly_spend: Array<{ month: string; spend: number; income: number }>;
  biggest_transactions: Array<{ description: string; amount: number; category: string; date: string }>;
}

export default function SpendingPage() {
  const [data, setData] = useState<SpendingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<string>('free');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('subscription_tier').eq('id', user.id).single()
          .then(({ data: profile }) => { if (profile) setTier(profile.subscription_tier || 'free'); });
      }
    });

    fetch('/api/spending')
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  const isPaid = tier === 'essential' || tier === 'pro';
  const isPro = tier === 'pro';

  if (!data?.hasData) {
    return (
      <div className="max-w-5xl">
        <div className="page-title-row">
        <div>
          <h1 className="page-title">Spending Insights</h1>
          <p className="page-sub">Connect your bank account to see where your money goes</p>
        </div>
      </div>
        <div className="card shadow-sm p-12 text-center">
          <BarChart3 className="h-16 w-16 text-slate-700 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-900 mb-2">No spending data yet</h3>
          <p className="text-slate-600 mb-6">Connect your bank account to get personalised spending insights.</p>
          <Link href="/dashboard/subscriptions" className="bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-all">
            Connect Bank Account
          </Link>
        </div>
      </div>
    );
  }

  const { summary, category_breakdown, monthly_spend, biggest_transactions } = data;
  const maxCategoryTotal = category_breakdown[0]?.total || 1;

  return (
    <div className="max-w-5xl">
      <div className="page-title-row">
        <div>
          <h1 className="page-title">Spending Insights</h1>
          <p className="page-sub">
          Based on {summary.months_analysed} months of bank data · {summary.total_transactions.toLocaleString()} transactions
        </p>
        </div>
      </div>

      {/* Summary Cards — Monthly Averages */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="card shadow-sm p-5">
          <p className="text-slate-500 text-xs mb-1">Average monthly spend</p>
          <p className="text-2xl font-bold text-slate-900">£{summary.monthly_avg_spend?.toLocaleString() || Math.round(summary.total_spend / Math.max(summary.months_analysed, 1)).toLocaleString()}</p>
        </div>
        <div className="bg-white border border-green-200 rounded-2xl shadow-sm p-5">
          <p className="text-slate-500 text-xs mb-1">Average monthly income</p>
          <p className="text-2xl font-bold text-green-600">£{summary.monthly_avg_income?.toLocaleString() || Math.round(summary.total_income / Math.max(summary.months_analysed, 1)).toLocaleString()}</p>
        </div>
        <div className="card shadow-sm p-5">
          <p className="text-slate-500 text-xs mb-1">This month so far</p>
          <p className="text-2xl font-bold text-slate-900">£{summary.current_month_spend.toLocaleString()}</p>
          {summary.month_change_percent !== 0 && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${summary.month_change_percent > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {summary.month_change_percent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(summary.month_change_percent)}% vs last month
            </div>
          )}
        </div>
        <div className="card shadow-sm p-5">
          <p className="text-slate-500 text-xs mb-1">Last month</p>
          <p className="text-2xl font-bold text-slate-900">£{summary.previous_month_spend.toLocaleString()}</p>
        </div>
      </div>

      {/* Monthly Breakdown — Spend vs Income */}
      <div className="card shadow-sm p-6 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Monthly Overview</h2>
        <p className="text-slate-500 text-xs mb-4">Spend vs income over the last {summary.months_analysed} months</p>
        <div className="space-y-4">
          {monthly_spend.map((m) => {
            const maxVal = Math.max(...monthly_spend.map(ms => Math.max(ms.spend, ms.income)));
            const spendWidth = maxVal > 0 ? (m.spend / maxVal) * 100 : 0;
            const incomeWidth = maxVal > 0 ? (m.income / maxVal) * 100 : 0;
            const monthLabel = new Date(m.month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
            const net = m.income - m.spend;
            return (
              <div key={m.month}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-slate-900 text-sm font-medium">{monthLabel}</span>
                  <span className={`text-xs font-semibold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {net >= 0 ? '+' : ''}£{Math.abs(net).toLocaleString()} net
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs w-12">Out</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div className="bg-gradient-to-r from-red-400 to-red-500 h-full rounded-full" style={{ width: `${spendWidth}%` }} />
                    </div>
                    <span className="text-red-600 text-xs font-semibold w-20 text-right">£{m.spend.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs w-12">In</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                      <div className="bg-gradient-to-r from-green-400 to-green-500 h-full rounded-full" style={{ width: `${incomeWidth}%` }} />
                    </div>
                    <span className="text-green-600 text-xs font-semibold w-20 text-right">£{m.income.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Breakdown — Expandable */}
      <div className="card shadow-sm p-6 mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Where your money goes</h2>
        <p className="text-slate-500 text-xs mb-4">Monthly average per category · click to expand</p>
        <div className="space-y-2">
          {category_breakdown.slice(0, isPaid ? 50 : 5).map((cat) => {
            const barWidth = (cat.total / maxCategoryTotal) * 100;
            const isExpanded = expandedCategory === cat.category;
            return (
              <div key={cat.category}>
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.category)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-3 py-2 hover:bg-slate-50 rounded-lg px-2 transition-all">
                    <span className="text-lg w-8 text-center">{cat.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-900 text-sm font-medium">{cat.label}</span>
                          {isExpanded ? <ChevronUp className="h-3 w-3 text-slate-500" /> : <ChevronDown className="h-3 w-3 text-slate-500" />}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-emerald-600 text-xs font-semibold">£{cat.monthly_avg.toLocaleString()}/mo</span>
                          <span className="text-slate-900 text-sm font-bold">£{cat.total.toLocaleString()}</span>
                          <span className="text-slate-500 text-xs w-10 text-right">{cat.percentage}%</span>
                        </div>
                      </div>
                      <div className="bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${barWidth}%`, backgroundColor: cat.color }} />
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expanded detail with individual payments */}
                {isExpanded && isPaid && (
                  <div className="ml-12 mt-2 mb-3 bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-slate-500 text-xs">Total ({summary.months_analysed}mo)</p>
                        <p className="text-slate-900 font-semibold">£{cat.total.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Monthly average</p>
                        <p className="text-emerald-600 font-semibold">£{cat.monthly_avg.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs">Share of spending</p>
                        <p className="text-slate-900 font-semibold">{cat.percentage}%</p>
                      </div>
                    </div>

                    {/* Individual payments in this category */}
                    {data.category_transactions?.[cat.category] && (
                      <div className="space-y-1 mb-3">
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-2">Payments in this category</p>
                        {data.category_transactions[cat.category].map((tx, j) => (
                          <div key={j} className="flex items-center justify-between bg-white border border-slate-200 rounded px-3 py-2 text-sm">
                            <div>
                              <span className="text-slate-900">{tx.description}</span>
                              <span className="text-slate-500 text-xs ml-2">({tx.count} payments)</span>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                              <span className="text-slate-600 text-xs">£{tx.monthly_avg}/mo avg</span>
                              <span className="text-slate-900 font-medium">£{tx.total.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <Link href="/dashboard/deals" className="text-emerald-600 hover:text-emerald-700 text-xs font-medium flex items-center gap-1">
                      Find better deals for {cat.label.toLowerCase()} <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                {isExpanded && !isPaid && (
                  <div className="ml-12 mt-2 mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                    <Lock className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
                    <p className="text-slate-600 text-xs">Upgrade to Essential to see detailed breakdown</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!isPaid && category_breakdown.length > 5 && (
          <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
            <Lock className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
            <p className="text-slate-900 font-semibold mb-1">See all {category_breakdown.length} categories</p>
            <p className="text-slate-600 text-sm mb-3">Upgrade to Essential to unlock full spending breakdown</p>
            <Link href="/pricing" className="inline-block bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold px-5 py-2 rounded-lg text-sm transition-all">
              Upgrade Plan
            </Link>
          </div>
        )}
      </div>

      {/* Biggest Transactions — Pro only */}
      <div className={`card shadow-sm p-6 mb-8 ${!isPro ? 'relative' : ''}`}>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Biggest Transactions</h2>
        <p className="text-slate-500 text-xs mb-4">Your largest single payments</p>

        {isPro ? (
          <div className="space-y-2">
            {biggest_transactions.map((tx, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
                <div>
                  <p className="text-slate-900 text-sm font-medium truncate max-w-xs">{tx.description}</p>
                  <p className="text-slate-500 text-xs">
                    {new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · {tx.category}
                  </p>
                </div>
                <span className="text-red-600 font-bold shrink-0 ml-4">-{formatGBP(tx.amount)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative">
            <div className="space-y-2 blur-sm pointer-events-none select-none">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3 border border-slate-200">
                  <div>
                    <p className="text-slate-900 text-sm font-medium">Transaction details hidden</p>
                    <p className="text-slate-500 text-xs">Date · Category</p>
                  </div>
                  <span className="text-red-600 font-bold">-£XXX.XX</span>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white border border-emerald-300 shadow-md rounded-xl p-6 text-center">
                <Lock className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
                <p className="text-slate-900 font-semibold mb-1">Pro feature</p>
                <p className="text-slate-600 text-sm mb-3">See your biggest transactions with Pro</p>
                <Link href="/pricing" className="inline-block bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold px-5 py-2 rounded-lg text-sm transition-all">
                  Upgrade to Pro
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Deal suggestion */}
      <div className="bg-gradient-to-r from-emerald-50 to-emerald-100/60 border border-emerald-200 rounded-2xl p-6 text-center">
        <p className="text-emerald-700 font-semibold mb-2">Based on your spending, we can help you save</p>
        <p className="text-slate-600 text-sm mb-4">Check our deals page for alternatives to your most expensive bills</p>
        <Link href="/dashboard/deals" className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-slate-900 font-semibold px-6 py-3 rounded-lg transition-all">
          View Deals <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
