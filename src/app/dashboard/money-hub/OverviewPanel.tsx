'use client';

import { fmtNum } from '@/lib/format';
import { TrendingUp, TrendingDown, Target, Wallet, BarChart3 } from 'lucide-react';
import { useState } from 'react';
import CategoryDrillDownModal from './CategoryDrillDownModal';

const INCOME_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  salary: { label: 'Salary', icon: '💼', color: '#22c55e' },
  freelance: { label: 'Freelance', icon: '💻', color: '#3b82f6' },
  benefits: { label: 'Benefits', icon: '🏛️', color: '#8b5cf6' },
  rental: { label: 'Rental Income', icon: '🏠', color: '#f59e0b' },
  rental_airbnb: { label: 'Rental Income', icon: '🏠', color: '#f59e0b' },
  rental_direct: { label: 'Rental Income', icon: '🏠', color: '#f59e0b' },
  investment: { label: 'Investments', icon: '📈', color: '#06b6d4' },
  refund: { label: 'Refunds', icon: '💸', color: '#10b981' },
  loan_repayment: { label: 'Loan Repayment', icon: '🏦', color: '#ef4444' },
  gift: { label: 'Gifts', icon: '🎁', color: '#ec4899' },
  credit_loan: { label: 'Credit / Loan', icon: '🏦', color: '#ef4444' },
  other: { label: 'Other', icon: '📋', color: '#475569' },
};

export default function OverviewPanel({ data, refreshData, selectedMonth }: { data: any, refreshData?: () => void, selectedMonth?: string }) {
  const [showIncome, setShowIncome] = useState(false);
  const [showSpending, setShowSpending] = useState(false);
  const [drillIncomeType, setDrillIncomeType] = useState<string | null>(null);
  const [drillSpendingCategory, setDrillSpendingCategory] = useState<string | null>(null);
  const { overview, healthScore, spending } = data;
  const { monthlyIncome, monthlyOutgoings, savingsRate, incomeBreakdown } = overview;
  const monthlyTrends = spending?.monthlyTrends || [];

  // Income breakdown entries
  const incomeEntries = Object.entries(incomeBreakdown || {})
    .map(([type, amount]) => ({
      type,
      amount: amount as number,
      ...(INCOME_LABELS[type] || INCOME_LABELS.other),
    }))
    .filter(e => e.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const totalIncomeFromBreakdown = incomeEntries.reduce((s, e) => s + e.amount, 0);

  // Monthly trends max for bar scaling
  const trendsMax = monthlyTrends.length > 0 
    ? Math.max(...monthlyTrends.flatMap((t: any) => [t.income, t.outgoings]), 1) 
    : 1;

  const spendingCategories = spending?.categories || [];
  const totalSpentFromBreakdown = spendingCategories.reduce((s: number, c: any) => s + c.total, 0);

  // Constants mapping helper
  const SPEND_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    mortgage: { label: 'Mortgage', icon: '🏠', color: '#8b5cf6' },
    loans: { label: 'Loans', icon: '🏦', color: '#ef4444' },
    council_tax: { label: 'Council Tax', icon: '🏛️', color: '#6366f1' },
    energy: { label: 'Energy', icon: '⚡', color: '#f59e0b' },
    water: { label: 'Water', icon: '💧', color: '#06b6d4' },
    broadband: { label: 'Broadband', icon: '📡', color: '#3b82f6' },
    mobile: { label: 'Mobile', icon: '📱', color: '#8b5cf6' },
    streaming: { label: 'Streaming', icon: '📺', color: '#ec4899' },
    fitness: { label: 'Fitness', icon: '💪', color: '#10b981' },
    groceries: { label: 'Groceries', icon: '🛒', color: '#22c55e' },
    shopping: { label: 'Shopping', icon: '🛍️', color: '#a855f7' },
    eating_out: { label: 'Eating Out', icon: '🍽️', color: '#f97316' },
    transport: { label: 'Transport', icon: '🚗', color: '#0ea5e9' },
    other: { label: 'Other', icon: '📋', color: '#475569' },
  };
  function getSpendMeta(key: string) { return SPEND_LABELS[key] || { label: key.replace(/_/g, ' '), icon: '📋', color: '#475569' }; }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-green-400" />
            <span className="text-slate-400 text-xs">Income this month</span>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-green-400">£{fmtNum(monthlyIncome)}</p>
          {incomeEntries.length > 1 && (
            <button 
              onClick={() => setShowIncome(!showIncome)}
              className="text-xs text-mint-400 hover:text-mint-300 mt-1 transition-colors"
            >
              {showIncome ? 'Hide' : 'Show'} breakdown →
            </button>
          )}
        </div>

        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-4 w-4 text-amber-400" />
            <span className="text-slate-400 text-xs">Spent this month</span>
          </div>
          <p className="text-2xl md:text-3xl font-bold text-amber-400">£{fmtNum(monthlyOutgoings)}</p>
          {spendingCategories.length > 0 && (
            <button 
              onClick={() => setShowSpending(!showSpending)}
              className="text-xs text-amber-400 hover:text-amber-300 mt-1 transition-colors"
            >
              {showSpending ? 'Hide' : 'Show'} breakdown →
            </button>
          )}
        </div>

        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-mint-400" />
            <span className="text-slate-400 text-xs">Savings Rate</span>
          </div>
          <p className={`text-2xl md:text-3xl font-bold ${(savingsRate || 0) >= 0 ? 'text-mint-400' : 'text-red-400'}`}>
            {(savingsRate || 0).toFixed(1)}%
          </p>
        </div>

        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 relative overflow-hidden group">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-4 w-4 text-purple-400" />
            <span className="text-slate-400 text-xs">Health Score</span>
          </div>
          <p className={`text-2xl md:text-3xl font-bold ${data.score >= 80 ? 'text-green-400' : data.score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
            {data.score}
          </p>
          {/* Hover detail */}
          <div className="absolute inset-0 bg-navy-800/95 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center px-4 text-xs rounded-2xl">
            <div className="flex justify-between mb-1"><span className="text-slate-400">Spend</span><span className="text-white">{healthScore?.pillars?.spend?.score || 0}%</span></div>
            <div className="flex justify-between mb-1"><span className="text-slate-400">Save</span><span className="text-white">{healthScore?.pillars?.save?.score || 0}%</span></div>
            <div className="flex justify-between mb-1"><span className="text-slate-400">Borrow</span><span className="text-white">{healthScore?.pillars?.borrow?.score || 0}%</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Plan</span><span className="text-white">{healthScore?.pillars?.plan?.score || 0}%</span></div>
          </div>
        </div>
      </div>

      {/* Income Breakdown (expandable) */}
      {showIncome && incomeEntries.length > 0 && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-400" />
            Income Breakdown
            <span className="text-slate-400 text-sm font-normal ml-auto">Click a category to see details</span>
          </h3>
          <div className="space-y-2">
            {incomeEntries.map((entry) => {
              const pct = totalIncomeFromBreakdown > 0 ? (entry.amount / totalIncomeFromBreakdown) * 100 : 0;
              return (
                <div 
                  key={entry.type} 
                  className="group cursor-pointer hover:bg-navy-800/50 p-2 -mx-2 rounded-lg transition-colors"
                  onClick={() => setDrillIncomeType(entry.type)}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-300 flex items-center gap-2 group-hover:text-mint-400 transition-colors">
                      <span>{entry.icon}</span>
                      {entry.label}
                      <span className="text-slate-500 text-xs">{pct.toFixed(1)}%</span>
                    </span>
                    <span className="text-green-400 font-semibold">£{fmtNum(entry.amount)}</span>
                  </div>
                  <div className="w-full bg-navy-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: entry.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-navy-800 flex justify-between text-sm">
            <span className="text-slate-400">Total Recorded Income</span>
            <span className="text-green-400 font-bold">£{fmtNum(totalIncomeFromBreakdown)}</span>
          </div>
        </div>
      )}

      {/* Spending Breakdown (expandable) */}
      {showSpending && spendingCategories.length > 0 && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-amber-400" />
            Spending Breakdown
            <span className="text-slate-400 text-sm font-normal ml-auto">Click a category to see details</span>
          </h3>
          <div className="space-y-2">
            {spendingCategories.map((c: any) => {
              const meta = getSpendMeta(c.category);
              const pct = totalSpentFromBreakdown > 0 ? (c.total / totalSpentFromBreakdown) * 100 : 0;
              return (
                <div 
                  key={c.category} 
                  className="group cursor-pointer hover:bg-navy-800/50 p-2 -mx-2 rounded-lg transition-colors"
                  onClick={() => setDrillSpendingCategory(c.category)}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-300 flex items-center gap-2 group-hover:text-amber-400 transition-colors">
                      <span>{meta.icon}</span>
                      {meta.label}
                      <span className="text-slate-500 text-xs">{pct.toFixed(1)}%</span>
                    </span>
                    <span className="text-amber-400 font-semibold">£{fmtNum(c.total)}</span>
                  </div>
                  <div className="w-full bg-navy-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-navy-800 flex justify-between text-sm">
            <span className="text-slate-400">Total Recorded Spend</span>
            <span className="text-amber-400 font-bold">£{fmtNum(totalSpentFromBreakdown)}</span>
          </div>
        </div>
      )}

      {/* Monthly Trends */}
      {monthlyTrends.length >= 2 && (
        <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-lg mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-400" />
            Monthly Trends
          </h3>
          <div className="flex items-end gap-2 h-32">
            {monthlyTrends.map((t: any, i: number) => {
              const monthLabel = new Date(t.month + '-15').toLocaleDateString('en-GB', { month: 'short' });
              const incomeH = (t.income / trendsMax) * 100;
              const outH = (t.outgoings / trendsMax) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="flex gap-0.5 items-end w-full justify-center" style={{ height: '100px' }}>
                    <div className="w-3 bg-green-400/80 rounded-t transition-all" style={{ height: `${incomeH}%`, minHeight: t.income > 0 ? '4px' : '0' }} />
                    <div className="w-3 bg-amber-400/80 rounded-t transition-all" style={{ height: `${outH}%`, minHeight: t.outgoings > 0 ? '4px' : '0' }} />
                  </div>
                  <span className="text-[10px] text-slate-500">{monthLabel}</span>
                  {/* Hover tooltip */}
                  <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-navy-950 border border-navy-700 rounded-lg p-2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap pointer-events-none">
                    <p className="text-green-400">In: £{fmtNum(t.income)}</p>
                    <p className="text-amber-400">Out: £{fmtNum(t.outgoings)}</p>
                    <p className="text-slate-300">Net: £{fmtNum(t.income - t.outgoings)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-center gap-6 mt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-400 rounded-full" /> Income</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-full" /> Spending</span>
          </div>
        </div>
      )}

      {drillIncomeType && (
        <CategoryDrillDownModal 
          isOpen={!!drillIncomeType} 
          onClose={() => setDrillIncomeType(null)} 
          category={null}
          incomeType={drillIncomeType} 
          selectedMonth={selectedMonth || ''}
          onRecategorised={() => { setDrillIncomeType(null); refreshData?.(); }}
        />
      )}

      {drillSpendingCategory && (
        <CategoryDrillDownModal 
          isOpen={!!drillSpendingCategory} 
          onClose={() => setDrillSpendingCategory(null)} 
          category={drillSpendingCategory} 
          selectedMonth={selectedMonth || ''}
          onRecategorised={() => { setDrillSpendingCategory(null); refreshData?.(); }}
        />
      )}
    </div>
  );
}
