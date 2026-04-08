'use client';

import { fmtNum } from '@/lib/format';
import { Lock, FileText, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import CategoryDrillDownModal from './CategoryDrillDownModal';

const CATEGORY_LABELS: Record<string, { label: string; icon: string; color: string }> = {
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
  eating_out: { label: 'Eating Out', icon: '🍽️', color: '#f97316' },
  fuel: { label: 'Fuel', icon: '⛽', color: '#64748b' },
  shopping: { label: 'Shopping', icon: '🛍️', color: '#a855f7' },
  insurance: { label: 'Insurance', icon: '🛡️', color: '#14b8a6' },
  transport: { label: 'Transport', icon: '🚗', color: '#0ea5e9' },
  tax: { label: 'Tax', icon: '🏛️', color: '#dc2626' },
  bills: { label: 'Bills', icon: '📄', color: '#64748b' },
  software: { label: 'Software', icon: '💻', color: '#818cf8' },
  healthcare: { label: 'Healthcare', icon: '❤️', color: '#fca5a5' },
  charity: { label: 'Charity', icon: '🤝', color: '#2dd4bf' },
  education: { label: 'Education', icon: '🎓', color: '#93c5fd' },
  pets: { label: 'Pets', icon: '🐾', color: '#fcd34d' },
  travel: { label: 'Travel', icon: '✈️', color: '#7dd3fc' },
  gambling: { label: 'Gambling', icon: '🎲', color: '#fde047' },
  fees: { label: 'Fees', icon: '💳', color: '#a3a3a3' },
  fee: { label: 'Fees', icon: '💳', color: '#a3a3a3' },
  credit: { label: 'Credit Cards', icon: '💳', color: '#f43f5e' },
  cash: { label: 'Cash', icon: '🏧', color: '#78716c' },
  childcare: { label: 'Childcare', icon: '👶', color: '#f472b6' },
  motoring: { label: 'Motoring', icon: '🚗', color: '#94a3b8' },
  other: { label: 'Other', icon: '📋', color: '#475569' },
};

function getCatMeta(key: string) {
  return CATEGORY_LABELS[key] || { label: key.replace(/_/g, ' '), icon: '📋', color: '#475569' };
}

export default function SpendingPanel({ data, isPro, refreshData, selectedMonth }: { data: any, isPro: boolean, refreshData: () => void, selectedMonth: string }) {
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const categories = data.spending.categories || [];
  const topMerchants = data.spending.topMerchants || [];
  const totalSpent = categories.reduce((s: number, c: any) => s + c.total, 0);

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-purple-400" />
          Spending Breakdown
        </h3>
        {totalSpent > 0 && (
          <span className="text-slate-400 text-sm">£{fmtNum(totalSpent)} total</span>
        )}
      </div>
      
      <div className="space-y-4 flex-1">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">By Category</p>
            <span className="text-slate-500 text-[10px]">Click row for details</span>
          </div>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">No categorised spend yet.</p>
          ) : (
            (showAll ? categories : categories.slice(0, 8)).map((c: any) => {
              const meta = getCatMeta(c.category);
              const pct = totalSpent > 0 ? (c.total / totalSpent) * 100 : 0;
              return (
                <div 
                  key={c.category} 
                  className="mb-2 cursor-pointer hover:bg-navy-800/50 p-2 -mx-2 rounded-lg transition-colors group"
                  onClick={() => setDrillCategory(c.category)}
                >
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300 flex items-center gap-2 group-hover:text-mint-400 transition-colors">
                      <span className="text-base">{meta.icon}</span>
                      {meta.label}
                      <span className="text-slate-500 text-xs">{pct.toFixed(1)}%</span>
                    </span>
                    <span className="text-white font-medium group-hover:text-mint-400">£{fmtNum(c.total)}</span>
                  </div>
                  <div className="w-full bg-navy-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: meta.color }} />
                  </div>
                </div>
              );
            })
          )}
          {categories.length > 8 && (
            <button 
              onClick={() => setShowAll(!showAll)}
              className="w-full text-xs text-mint-400 hover:text-mint-300 mt-2 py-1 flex items-center justify-center gap-1 transition-colors"
            >
              {showAll ? (
                <><ChevronUp className="h-3 w-3" /> Show less</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> View {categories.length - 8} more categories</>
              )}
            </button>
          )}
        </div>

        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Top Merchants</p>
          {!isPro ? (
            <LockedSection title="Top Merchants">
              <div className="space-y-2 opacity-30 pointer-events-none">
                <div className="h-4 bg-navy-700 rounded w-full" />
                <div className="h-4 bg-navy-700 rounded w-4/5" />
                <div className="h-4 bg-navy-700 rounded w-3/4" />
              </div>
            </LockedSection>
          ) : topMerchants.length === 0 ? (
            <p className="text-sm text-slate-500">No merchant data yet.</p>
          ) : (
            topMerchants.slice(0, 5).map((m: any) => (
              <div key={m.merchant} className="mb-2">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-300 capitalize">{m.merchant}</span>
                  <span className="text-white font-medium">£{fmtNum(m.total)}</span>
                </div>
                <div className="w-full bg-navy-800 rounded-full h-1.5">
                  <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${(m.total / (topMerchants[0]?.total || 1)) * 100}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      <CategoryDrillDownModal 
        isOpen={!!drillCategory} 
        onClose={() => setDrillCategory(null)} 
        category={drillCategory} 
        selectedMonth={selectedMonth}
        onRecategorised={() => { setDrillCategory(null); refreshData(); }}
      />
    </div>
  );
}

function LockedSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-navy-950/50 border border-navy-700/50 rounded-xl p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
        <Lock className="h-6 w-6 text-slate-500 mb-2" />
        <p className="text-white font-semibold text-xs mb-1">Upgrade to unlock {title}</p>
        <Link href="/pricing" className="text-mint-400 text-[10px] hover:text-mint-300">View plans</Link>
      </div>
      {children}
    </div>
  );
}
