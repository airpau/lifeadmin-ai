'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Wallet, TrendingUp, TrendingDown, CreditCard, BarChart3,
  AlertTriangle, Clock, Target, PiggyBank, FileText, Building2,
  ArrowRight, Loader2, Lock, RefreshCw, Plus, ChevronDown, ChevronUp,
  Shield, Zap, Mail, Calendar, DollarSign, X, Send, MessageCircle,
  ArrowLeft,
} from 'lucide-react';

interface MoneyHubData {
  tier: string;
  score: number;
  overview: { monthlyIncome: number; monthlyOutgoings: number; netPosition: number; monthProgress: number; dayOfMonth: number; daysInMonth: number };
  accounts: Array<{ id: string; bank_name: string; status: string; last_synced_at: string }>;
  spending: { categories: Array<{ category: string; total: number }>; topMerchants: Array<{ merchant: string; total: number }>; monthlyTrends: Array<{ month: string; income: number; outgoings: number }>; totalSpent: number };
  subscriptions: { list: any[]; monthlyTotal: number; annualTotal: number; count: number };
  contracts: { expiring: Array<{ provider: string; endDate: string; daysLeft: number; monthlyCost: number }>; totalCommitted: number };
  netWorth: { total: number; assets: number; liabilities: number; assetsList: any[]; liabilitiesList: any[] };
  budgets: any[];
  goals: any[];
  alerts: any[];
  opportunities: any[];
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  mortgage: { label: 'Mortgage', color: '#8b5cf6', icon: '🏠' },
  loans: { label: 'Loans', color: '#ef4444', icon: '🏦' },
  council_tax: { label: 'Council Tax', color: '#6366f1', icon: '🏛️' },
  energy: { label: 'Energy', color: '#f59e0b', icon: '⚡' },
  water: { label: 'Water', color: '#06b6d4', icon: '💧' },
  broadband: { label: 'Broadband', color: '#3b82f6', icon: '📡' },
  mobile: { label: 'Mobile', color: '#8b5cf6', icon: '📱' },
  streaming: { label: 'Streaming', color: '#ec4899', icon: '📺' },
  fitness: { label: 'Fitness', color: '#10b981', icon: '💪' },
  groceries: { label: 'Groceries', color: '#22c55e', icon: '🛒' },
  eating_out: { label: 'Eating Out', color: '#f97316', icon: '🍽️' },
  fuel: { label: 'Fuel', color: '#64748b', icon: '⛽' },
  shopping: { label: 'Shopping', color: '#a855f7', icon: '🛍️' },
  insurance: { label: 'Insurance', color: '#14b8a6', icon: '🛡️' },
  transport: { label: 'Transport', color: '#0ea5e9', icon: '🚗' },
  tax: { label: 'Tax', color: '#dc2626', icon: '🏛️' },
  bills: { label: 'Bills', color: '#64748b', icon: '📄' },
  income: { label: 'Income', color: '#16a34a', icon: '💰' },
  other: { label: 'Other', color: '#475569', icon: '📋' },
};

function LockedSection({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
        <Lock className="h-8 w-8 text-slate-500 mb-3" />
        <p className="text-white font-semibold text-sm mb-1">Upgrade to unlock {title}</p>
        <Link href="/pricing" className="text-amber-400 text-xs hover:text-amber-300">View plans</Link>
      </div>
      <div className="opacity-30">{children || <div className="h-32" />}</div>
    </div>
  );
}

export default function MoneyHubPage() {
  const [data, setData] = useState<MoneyHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const syncMoneyHub = async () => {
    setSyncing(true);
    try {
      await fetch('/api/money-hub/sync', { method: 'POST' });
      const res = await fetch('/api/money-hub');
      const d = await res.json();
      if (!d.error) setData(d);
    } catch {}
    setSyncing(false);
  };

  // Category drill-down
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<{ transactions: any[]; merchants: any[]; totalSpent: number } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  // Budget form
  const [showBudgetForm, setShowBudgetForm] = useState<string | null>(null); // category name
  const [budgetAmount, setBudgetAmount] = useState('');
  const [savingBudget, setSavingBudget] = useState(false);

  // AI Chat (Pro)
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const loadDrillDown = async (category: string) => {
    setDrillCategory(category);
    setDrillLoading(true);
    try {
      const res = await fetch(`/api/money-hub/transactions?category=${category}&months=1`);
      const d = await res.json();
      setDrillData(d);
    } catch {}
    setDrillLoading(false);
  };

  const saveBudget = async (category: string) => {
    if (!budgetAmount) return;
    setSavingBudget(true);
    try {
      await fetch('/api/money-hub/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, monthly_limit: parseFloat(budgetAmount) }),
      });
      // Refresh data
      const res = await fetch('/api/money-hub');
      const d = await res.json();
      if (!d.error) setData(d);
      setShowBudgetForm(null);
      setBudgetAmount('');
    } catch {}
    setSavingBudget(false);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    const updated = [...chatMessages, { role: 'user', content: msg }];
    setChatMessages(updated);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch('/api/money-hub/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history: updated }),
      });
      const d = await res.json();
      if (d.reply) {
        setChatMessages([...updated, { role: 'assistant', content: d.reply }]);
      } else if (d.error) {
        setChatMessages([...updated, { role: 'assistant', content: d.error }]);
      }
    } catch {
      setChatMessages([...updated, { role: 'assistant', content: 'Sorry, something went wrong.' }]);
    }
    setChatLoading(false);
  };

  useEffect(() => {
    fetch('/api/money-hub')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl text-center py-16">
        <Wallet className="h-16 w-16 text-slate-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Connect your bank to get started</h2>
        <p className="text-slate-400 mb-6">The Money Hub analyses your bank transactions to give you a complete financial picture.</p>
        <Link href="/dashboard/subscriptions" className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-6 py-3 rounded-lg">
          Connect Bank Account
        </Link>
      </div>
    );
  }

  const isPaid = data.tier === 'essential' || data.tier === 'pro';
  const isPro = data.tier === 'pro';
  const totalOpportunityValue = data.alerts.reduce((s, a) => s + (a.value_gbp || 0), 0) +
    data.opportunities.reduce((s, o) => s + (o.amount || 0), 0);

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white flex items-center gap-3">
            <Wallet className="h-9 w-9 text-amber-500" />
            Money Hub
          </h1>
          <p className="text-slate-400 mt-1">Your complete financial intelligence centre</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={syncMoneyHub}
            disabled={syncing}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
          <div className="text-right">
            <div className={`text-4xl font-bold ${data.score >= 70 ? 'text-green-400' : data.score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
              {data.score}
            </div>
            <p className="text-slate-500 text-xs">Financial Health Score</p>
          </div>
        </div>
      </div>

      {/* SECTION 1: Financial Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <TrendingUp className="h-5 w-5 text-green-400 mb-2" />
          <p className="text-2xl font-bold text-white">£{data.overview.monthlyIncome.toLocaleString()}</p>
          <p className="text-slate-400 text-xs">Income this month</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <TrendingDown className="h-5 w-5 text-red-400 mb-2" />
          <p className="text-2xl font-bold text-white">£{data.overview.monthlyOutgoings.toLocaleString()}</p>
          <p className="text-slate-400 text-xs">Spent this month</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <DollarSign className={`h-5 w-5 ${data.overview.netPosition >= 0 ? 'text-green-400' : 'text-red-400'} mb-2`} />
          <p className={`text-2xl font-bold ${data.overview.netPosition >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {data.overview.netPosition >= 0 ? '+' : ''}£{data.overview.netPosition.toLocaleString()}
          </p>
          <p className="text-slate-400 text-xs">Net position</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <Calendar className="h-5 w-5 text-blue-400 mb-2" />
          <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
            <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${data.overview.monthProgress}%` }} />
          </div>
          <p className="text-slate-400 text-xs">Day {data.overview.dayOfMonth} of {data.overview.daysInMonth}</p>
        </div>
      </div>

      {/* SECTION 2: Accounts */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-purple-400" /> Bank Accounts
          </h2>
          {isPro && (
            <Link href="/dashboard/subscriptions" className="text-amber-400 text-xs flex items-center gap-1">
              <Plus className="h-3 w-3" /> Connect another
            </Link>
          )}
        </div>
        {data.accounts.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-slate-400 text-sm mb-3">No bank accounts connected</p>
            <Link href="/dashboard/subscriptions" className="text-amber-400 text-sm">Connect bank account</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {data.accounts.map(acc => (
              <div key={acc.id} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-3 border border-slate-800">
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-green-400" />
                  <span className="text-white text-sm font-medium">{acc.bank_name || 'Bank Account'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${acc.status === 'active' ? 'text-green-400' : 'text-slate-500'}`}>{acc.status}</span>
                  {acc.last_synced_at && (
                    <span className="text-slate-500 text-xs">
                      Synced {Math.round((Date.now() - new Date(acc.last_synced_at).getTime()) / 60000)}m ago
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3: Spending Intelligence */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-sky-400" /> Spending Breakdown
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            {data.spending.categories.map(cat => {
              const info = CATEGORY_LABELS[cat.category] || CATEGORY_LABELS.other;
              const pct = data.spending.totalSpent > 0 ? (cat.total / data.spending.totalSpent) * 100 : 0;
              const budget = data.budgets.find((b: any) => b.category === cat.category);
              const budgetPct = budget ? (cat.total / budget.monthly_limit) * 100 : 0;
              return (
                <div key={cat.category}>
                  <button
                    onClick={() => isPaid ? loadDrillDown(cat.category) : undefined}
                    className={`flex items-center gap-3 w-full text-left ${isPaid ? 'hover:bg-slate-800/50 rounded-lg p-1 -m-1 cursor-pointer' : ''}`}
                  >
                    <span className="text-lg w-7">{info.icon}</span>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white text-xs font-medium">{info.label}</span>
                        <div className="flex items-center gap-2">
                          {budget && (
                            <span className={`text-[10px] ${budgetPct > 100 ? 'text-red-400' : budgetPct > 80 ? 'text-amber-400' : 'text-green-400'}`}>
                              {budgetPct.toFixed(0)}% of £{budget.monthly_limit} budget
                            </span>
                          )}
                          <span className="text-white text-xs font-bold">£{cat.total.toFixed(0)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: info.color }} />
                      </div>
                    </div>
                  </button>
                  {isPaid && (
                    <div className="flex justify-end mt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowBudgetForm(cat.category); setBudgetAmount(budget?.monthly_limit?.toString() || ''); }}
                        className="text-[10px] text-slate-500 hover:text-amber-400"
                      >
                        {budget ? 'Edit budget' : 'Set budget'}
                      </button>
                    </div>
                  )}
                  {showBudgetForm === cat.category && (
                    <div className="flex items-center gap-2 mt-1 ml-10">
                      <span className="text-slate-400 text-xs">£</span>
                      <input
                        type="number"
                        value={budgetAmount}
                        onChange={(e) => setBudgetAmount(e.target.value)}
                        placeholder="Monthly limit"
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white w-24 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => saveBudget(cat.category)}
                        disabled={savingBudget}
                        className="bg-amber-500 text-slate-950 text-xs px-2 py-1 rounded font-medium disabled:opacity-50"
                      >
                        {savingBudget ? '...' : 'Save'}
                      </button>
                      <button onClick={() => setShowBudgetForm(null)} className="text-slate-500 text-xs">Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
            {!isPaid && data.spending.categories.length >= 5 && (
              <div className="text-center pt-2">
                <Link href="/pricing" className="text-amber-400 text-xs">Upgrade to see all categories</Link>
              </div>
            )}
          </div>

          {/* Top merchants (Pro only) */}
          {isPro && data.spending.topMerchants.length > 0 && (
            <div>
              <h3 className="text-white text-sm font-semibold mb-3">Top Merchants</h3>
              <div className="space-y-2">
                {data.spending.topMerchants.slice(0, 7).map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300 truncate max-w-[200px]">{m.merchant}</span>
                    <span className="text-white font-medium">£{m.total.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: Monthly Trends (paid only) */}
      {isPaid && data.spending.monthlyTrends.length > 0 ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <TrendingUp className="h-5 w-5 text-green-400" /> Monthly Trends
          </h2>
          <div className="grid grid-cols-6 gap-2">
            {data.spending.monthlyTrends.map(m => {
              const maxVal = Math.max(...data.spending.monthlyTrends.map(t => Math.max(t.income, t.outgoings)), 1);
              return (
                <div key={m.month} className="text-center">
                  <div className="h-24 flex items-end justify-center gap-1 mb-1">
                    <div className="w-3 bg-green-500/60 rounded-t" style={{ height: `${(m.income / maxVal) * 100}%` }} />
                    <div className="w-3 bg-red-500/60 rounded-t" style={{ height: `${(m.outgoings / maxVal) * 100}%` }} />
                  </div>
                  <p className="text-slate-500 text-[10px]">{m.month.substring(5)}</p>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 justify-center mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full" /> Income</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full" /> Outgoings</span>
          </div>
        </div>
      ) : !isPaid ? (
        <LockedSection title="Monthly Trends" />
      ) : null}

      {/* SECTION 5: Smart Alerts */}
      {data.alerts.length > 0 && (
        <div className="bg-slate-900/50 border border-amber-500/20 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-400" /> Smart Alerts
          </h2>
          <div className="space-y-2">
            {data.alerts.map(alert => (
              <div key={alert.id} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-3 border border-slate-800">
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{alert.title}</p>
                  <p className="text-slate-500 text-xs">{alert.description?.substring(0, 80)}</p>
                </div>
                {alert.value_gbp > 0 && (
                  <span className="text-amber-400 font-bold text-sm ml-3">£{alert.value_gbp}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 6: Subscriptions Summary */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-amber-400" /> Subscriptions
          </h2>
          <Link href="/dashboard/subscriptions" className="text-amber-400 text-xs flex items-center gap-1">
            Manage <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{data.subscriptions.count}</p>
            <p className="text-slate-500 text-xs">Active</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">£{data.subscriptions.monthlyTotal.toFixed(0)}</p>
            <p className="text-slate-500 text-xs">/month</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">£{data.subscriptions.annualTotal.toFixed(0)}</p>
            <p className="text-slate-500 text-xs">/year</p>
          </div>
        </div>
      </div>

      {/* SECTION 7: Contracts Expiring */}
      {data.contracts.expiring.length > 0 && (
        <div className="bg-slate-900/50 border border-red-500/20 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-red-400" /> Contracts Expiring
          </h2>
          <div className="space-y-2">
            {data.contracts.expiring.map((c, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-4 py-3 border border-slate-800">
                <div>
                  <p className="text-white text-sm font-medium">{c.provider}</p>
                  <p className="text-slate-500 text-xs">£{c.monthlyCost}/month</p>
                </div>
                <span className={`text-sm font-semibold ${c.daysLeft <= 7 ? 'text-red-400' : c.daysLeft <= 30 ? 'text-amber-400' : 'text-blue-400'}`}>
                  {c.daysLeft} days left
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 8: Net Worth */}
      {isPaid ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Shield className="h-5 w-5 text-emerald-400" /> Net Worth
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">£{data.netWorth.assets.toLocaleString()}</p>
              <p className="text-slate-500 text-xs">Assets</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-400">£{data.netWorth.liabilities.toLocaleString()}</p>
              <p className="text-slate-500 text-xs">Liabilities</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${data.netWorth.total >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                £{data.netWorth.total.toLocaleString()}
              </p>
              <p className="text-slate-500 text-xs">Net Worth</p>
            </div>
          </div>
          {isPro && (
            <div className="mt-4 flex gap-2">
              <Link href="/dashboard/money-hub" className="text-amber-400 text-xs">Add assets and liabilities to track your full net worth</Link>
            </div>
          )}
        </div>
      ) : (
        <LockedSection title="Net Worth Tracker" />
      )}

      {/* SECTION 9: Budget Planner */}
      {isPaid ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <Target className="h-5 w-5 text-purple-400" /> Budget Planner
          </h2>
          {data.budgets.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-slate-400 text-sm mb-2">No budgets set yet</p>
              <p className="text-slate-500 text-xs">Set spending limits per category to stay on track</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.budgets.map((b: any) => {
                const spent = data.spending.categories.find(c => c.category === b.category)?.total || 0;
                const pct = b.monthly_limit > 0 ? (spent / b.monthly_limit) * 100 : 0;
                const info = CATEGORY_LABELS[b.category] || CATEGORY_LABELS.other;
                return (
                  <div key={b.id}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white">{info.icon} {info.label}</span>
                      <span className={pct > 100 ? 'text-red-400' : pct > 80 ? 'text-amber-400' : 'text-slate-400'}>
                        £{spent.toFixed(0)} / £{b.monthly_limit}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div className={`h-2 rounded-full ${pct > 100 ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <LockedSection title="Budget Planner" />
      )}

      {/* SECTION 10: Financial Action Centre */}
      <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-amber-400 flex items-center gap-2">
            <Zap className="h-5 w-5" /> Financial Action Centre
          </h2>
          {totalOpportunityValue > 0 && (
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-400">£{totalOpportunityValue.toFixed(0)}</p>
              <p className="text-slate-500 text-xs">potential savings</p>
            </div>
          )}
        </div>
        {data.opportunities.length > 0 ? (
          <div className="space-y-2">
            {data.opportunities.slice(0, isPaid ? 20 : 3).map((opp: any) => (
              <div key={opp.id} className="flex items-center justify-between bg-slate-900/50 rounded-lg px-4 py-3 border border-slate-800">
                <div className="flex-1">
                  <p className="text-white text-sm font-medium">{opp.title}</p>
                  <p className="text-slate-500 text-xs">{opp.provider_name || 'Opportunity detected'}</p>
                </div>
                <Link href="/dashboard/scanner" className="text-amber-400 text-xs flex items-center gap-1">
                  Take Action <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-slate-400 text-sm">No pending actions. Scan your inbox to find opportunities.</p>
            <Link href="/dashboard/scanner" className="text-amber-400 text-sm mt-2 inline-block">Run Opportunity Scan</Link>
          </div>
        )}
        {!isPaid && data.opportunities.length >= 3 && (
          <div className="text-center pt-3 border-t border-amber-500/20 mt-3">
            <Link href="/pricing" className="text-amber-400 text-xs">Upgrade to see all actions</Link>
          </div>
        )}
      </div>

      {/* SECTION 11: Savings Goals */}
      {isPaid ? (
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
            <PiggyBank className="h-5 w-5 text-pink-400" /> Savings Goals
          </h2>
          {data.goals.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-slate-400 text-sm mb-2">No savings goals yet</p>
              <p className="text-slate-500 text-xs">Set a target and track your progress</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.goals.map((g: any) => {
                const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
                const daysLeft = g.target_date ? Math.ceil((new Date(g.target_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                return (
                  <div key={g.id} className="bg-slate-950/50 rounded-lg p-4 border border-slate-800">
                    <div className="flex justify-between mb-2">
                      <span className="text-white font-medium text-sm">{g.emoji || '🎯'} {g.goal_name}</span>
                      <span className="text-slate-400 text-xs">
                        £{g.current_amount?.toFixed(0)} / £{g.target_amount?.toFixed(0)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2 mb-1">
                      <div className="bg-pink-500 h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>{pct.toFixed(0)}% complete</span>
                      {daysLeft !== null && <span>{daysLeft > 0 ? `${daysLeft} days left` : 'Past due'}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <LockedSection title="Savings Goals" />
      )}

      {/* Email Intelligence teaser */}
      {!isPaid && (
        <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/5 border border-blue-500/20 rounded-2xl p-6 text-center">
          <Mail className="h-10 w-10 text-blue-400 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Email Financial Intelligence</h2>
          <p className="text-slate-400 text-sm mb-4 max-w-lg mx-auto">
            Upgrade to scan your email inbox for overcharges, price increases, compensation opportunities, and forgotten subscriptions. This is something no other finance app offers.
          </p>
          <Link href="/pricing" className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-6 py-2 rounded-lg text-sm">
            Upgrade to Essential
          </Link>
        </div>
      )}

      {/* Category Drill-Down Modal */}
      {drillCategory && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <button onClick={() => { setDrillCategory(null); setDrillData(null); }} className="text-slate-400 hover:text-white">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-white font-semibold">
                  {(CATEGORY_LABELS[drillCategory] || CATEGORY_LABELS.other).icon} {(CATEGORY_LABELS[drillCategory] || CATEGORY_LABELS.other).label}
                </h2>
              </div>
              {drillData && <span className="text-amber-400 font-bold">£{drillData.totalSpent.toFixed(2)}</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {drillLoading ? (
                <div className="text-center py-8"><Loader2 className="h-6 w-6 text-amber-500 animate-spin mx-auto" /></div>
              ) : drillData ? (
                <div className="space-y-6">
                  {/* Merchant breakdown */}
                  {drillData.merchants.length > 0 && (
                    <div>
                      <h3 className="text-white text-sm font-semibold mb-3">Merchants</h3>
                      <div className="space-y-2">
                        {drillData.merchants.map((m, i) => (
                          <div key={i} className="flex items-center justify-between bg-slate-950/50 rounded-lg px-3 py-2 border border-slate-800">
                            <div>
                              <span className="text-white text-sm">{m.merchant}</span>
                              <span className="text-slate-500 text-xs ml-2">{m.count} transactions</span>
                            </div>
                            <span className="text-white font-medium text-sm">£{m.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Transaction list */}
                  <div>
                    <h3 className="text-white text-sm font-semibold mb-3">Transactions ({drillData.transactions.length})</h3>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {drillData.transactions.map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-slate-800/50">
                          <div className="flex-1 min-w-0">
                            <span className="text-slate-300 truncate block">{t.description?.substring(0, 40)}</span>
                            <span className="text-slate-500 text-xs">{t.date}</span>
                          </div>
                          <span className={`font-medium ml-2 ${t.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {t.amount < 0 ? '-' : '+'}£{Math.abs(t.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* AI Chat Panel (Pro only) */}
      {isPro && (
        <>
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className="fixed bottom-20 left-6 z-40 bg-purple-500 hover:bg-purple-600 text-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 lg:bottom-6"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          )}
          {chatOpen && (
            <div className="fixed bottom-20 left-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[460px] bg-slate-900 border border-purple-500/30 rounded-2xl shadow-2xl flex flex-col overflow-hidden lg:bottom-6 lg:left-6">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-purple-400" />
                  <div>
                    <p className="text-white text-sm font-semibold">Money Hub AI</p>
                    <p className="text-purple-400 text-xs">Pro feature</p>
                  </div>
                </div>
                <button onClick={() => setChatOpen(false)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center py-6">
                    <MessageCircle className="h-8 w-8 text-purple-400/30 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm mb-3">Ask me about your finances</p>
                    <div className="space-y-1">
                      {['How much did I spend on eating out?', 'What subscriptions could I cancel?', 'Set a budget for groceries'].map(q => (
                        <button key={q} onClick={() => { setChatInput(q); }} className="block w-full text-left text-xs text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded px-3 py-1.5">{q}</button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-purple-500 text-white' : 'bg-slate-800 text-slate-200'}`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start"><div className="bg-slate-800 rounded-2xl px-3 py-2"><Loader2 className="h-4 w-4 text-purple-400 animate-spin" /></div></div>
                )}
              </div>
              <div className="p-3 border-t border-slate-700">
                <div className="flex items-center gap-2">
                  <input
                    type="text" value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                    placeholder="Ask about your finances..."
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    disabled={chatLoading}
                  />
                  <button onClick={sendChatMessage} disabled={!chatInput.trim() || chatLoading} className="bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white w-9 h-9 rounded-xl flex items-center justify-center">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
