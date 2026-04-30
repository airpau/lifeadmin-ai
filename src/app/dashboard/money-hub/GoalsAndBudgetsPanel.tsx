'use client';

import { fmtNum } from '@/lib/format';
import { Target, Lock, Settings, Plus, PiggyBank } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import GoalsAndBudgetsModal from './GoalsAndBudgetsModal';
import CategoryDrillDownModal from './CategoryDrillDownModal';

export default function GoalsAndBudgetsPanel({ data, isPro, refreshData, selectedMonth }: { data: any, isPro: boolean, refreshData: () => void, selectedMonth: string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const budgets = data.budgets || [];
  const goals = data.goals || [];

  return (
    <div className="card p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-900 font-semibold text-lg flex items-center gap-2">
          <Target className="h-5 w-5 text-green-400" />
          Budgets & Goals
        </h3>
        {isPro && (
          <button onClick={() => setModalOpen(true)} className="text-slate-500 hover:text-slate-900 transition-colors" title="Manage Budgets and Goals">
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
      
      {!isPro ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 relative overflow-hidden flex-1">
          <div className="absolute inset-0 bg-white backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Lock className="h-6 w-6 text-slate-500 mb-2" />
            <p className="text-slate-900 font-semibold text-xs mb-1">Upgrade to set Budgets & Goals</p>
            <Link href="/pricing" className="text-mint-400 text-[10px] hover:text-mint-300">View plans</Link>
          </div>
          <div className="space-y-4 opacity-30 pointer-events-none">
            <div className="h-2 bg-slate-100 rounded-full w-full" />
            <div className="h-2 bg-slate-100 rounded-full w-3/4" />
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-6">
          {/* Budgets */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Active Budgets</p>
              {budgets.length === 0 && (
                <button onClick={() => setModalOpen(true)} className="text-mint-400 hover:text-mint-300 text-xs flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add
                </button>
              )}
            </div>
            {budgets.length === 0 ? (
              <p className="text-sm text-slate-500">No budgets set. Add one to track spending limits.</p>
            ) : (
              budgets.slice(0, 4).map((b: any) => (
                <button
                  key={b.id}
                  onClick={() => setDrillCategory(b.category)}
                  className="mb-3 w-full text-left group hover:bg-slate-100 rounded-lg px-2 -mx-2 py-1 transition-colors"
                >
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-900 capitalize group-hover:text-mint-400 transition-colors">{(b.category || '').replace(/_/g, ' ')}</span>
                    <span className={`text-xs font-medium ${b.status === 'over_budget' ? 'text-red-400' : b.status === 'warning' ? 'text-amber-400' : 'text-slate-500'}`}>
                      £{fmtNum(b.spent)} / £{fmtNum(b.monthly_limit)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${b.status === 'over_budget' ? 'bg-red-400' : b.status === 'warning' ? 'bg-amber-400' : 'bg-green-400'}`}
                      style={{ width: `${Math.min(b.percentage, 100)}%` }}
                    />
                  </div>
                  {b.status === 'over_budget' && (
                    <p className="text-[10px] text-red-400 mt-0.5">Over by £{fmtNum(Math.abs(b.remaining))}</p>
                  )}
                </button>
              ))
            )}
          </div>
          
          {/* Savings Goals */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1">
                <PiggyBank className="h-3 w-3" /> Savings Goals
              </p>
              {goals.length === 0 && (
                <button onClick={() => setModalOpen(true)} className="text-mint-400 hover:text-mint-300 text-xs flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Add
                </button>
              )}
            </div>
            {goals.length === 0 ? (
              <p className="text-sm text-slate-500">No goals set. Create one to start saving.</p>
            ) : (
              goals.slice(0, 3).map((g: any) => {
                const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
                const remaining = Math.max(0, g.target_amount - g.current_amount);
                return (
                  <div key={g.id} className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-900 flex items-center gap-1">{g.emoji} {g.goal_name}</span>
                      <span className="text-slate-500 text-xs">£{fmtNum(g.current_amount)} / £{fmtNum(g.target_amount)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-mint-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    {remaining > 0 && g.target_date && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        £{fmtNum(remaining)} to go · Target: {new Date(g.target_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      
      <GoalsAndBudgetsModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        data={data}
        onUpdated={() => { refreshData(); }}
      />

      <CategoryDrillDownModal
        isOpen={!!drillCategory}
        onClose={() => setDrillCategory(null)}
        category={drillCategory}
        selectedMonth={selectedMonth}
        onRecategorised={refreshData}
      />
    </div>
  );
}
