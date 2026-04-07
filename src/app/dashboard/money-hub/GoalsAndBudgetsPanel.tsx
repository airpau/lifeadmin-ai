import { formatGBP } from '@/lib/format';
import { Target, Lock, Settings } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import GoalsAndBudgetsModal from './GoalsAndBudgetsModal';

export default function GoalsAndBudgetsPanel({ data, isPro, refreshData }: { data: any, isPro: boolean, refreshData: () => void }) {
  const [modalOpen, setModalOpen] = useState(false);
  const budgets = data.budgets || [];
  const goals = data.goals || [];

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Target className="h-5 w-5 text-green-400" />
          Budgets & Goals
        </h3>
        {isPro && (
          <button onClick={() => setModalOpen(true)} className="text-slate-500 hover:text-white transition-colors" title="Manage Budgets and Goals">
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>
      
      {!isPro ? (
        <div className="bg-navy-950/50 border border-navy-700/50 rounded-xl p-4 relative overflow-hidden flex-1">
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Lock className="h-6 w-6 text-slate-500 mb-2" />
            <p className="text-white font-semibold text-xs mb-1">Upgrade to set Budgets & Goals</p>
            <Link href="/pricing" className="text-mint-400 text-[10px] hover:text-mint-300">View plans</Link>
          </div>
          <div className="space-y-4 opacity-30 pointer-events-none">
            <div className="h-2 bg-navy-700 rounded-full w-full" />
            <div className="h-2 bg-navy-700 rounded-full w-3/4" />
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-6">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Active Budgets</p>
            {budgets.length === 0 ? (
              <p className="text-sm text-slate-500">No budgets set.</p>
            ) : (
              budgets.slice(0, 3).map((b: any) => (
                <div key={b.id} className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white capitalize">{b.category.replace(/_/g, ' ')}</span>
                    <span className="text-slate-400">£{formatGBP(b.spent)} / £{formatGBP(b.monthly_limit)}</span>
                  </div>
                  <div className="w-full bg-navy-800 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full ${b.status === 'over_budget' ? 'bg-red-400' : b.status === 'warning' ? 'bg-amber-400' : 'bg-green-400'}`} 
                      style={{ width: `${Math.min(b.percentage, 100)}%` }} 
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3 font-semibold">Savings Goals</p>
            {goals.length === 0 ? (
              <p className="text-sm text-slate-500">No goals set.</p>
            ) : (
              goals.slice(0, 3).map((g: any) => (
                <div key={g.id} className="mb-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-white flex items-center gap-1">{g.emoji} {g.goal_name}</span>
                    <span className="text-slate-400">£{formatGBP(g.current_amount)} / £{formatGBP(g.target_amount)}</span>
                  </div>
                  <div className="w-full bg-navy-800 rounded-full h-1.5">
                    <div className="bg-mint-400 h-1.5 rounded-full" style={{ width: `${Math.min((g.current_amount / g.target_amount) * 100, 100)}%` }} />
                  </div>
                </div>
              ))
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
    </div>
  );
}
