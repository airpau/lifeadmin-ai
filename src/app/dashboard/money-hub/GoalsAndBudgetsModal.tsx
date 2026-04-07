import { useState } from 'react';
import { X, Plus, Trash2, Target, PlusCircle } from 'lucide-react';
import { fmtNum } from '@/lib/format';

export default function GoalsAndBudgetsModal({ isOpen, onClose, data, onUpdated }: { isOpen: boolean, onClose: () => void, data: any, onUpdated: () => void }) {
  const [activeTab, setActiveTab] = useState<'budgets' | 'goals'>('budgets');
  const [loading, setLoading] = useState(false);
  
  // Forms
  const [budgetCategory, setBudgetCategory] = useState('groceries');
  const [budgetAmount, setBudgetAmount] = useState('');
  
  const [goalForm, setGoalForm] = useState({ name: '', emoji: '🎯', targetAmount: '', currentAmount: '0' });

  const { budgets = [], goals = [] } = data;

  const ALL_CATEGORIES = [
    'groceries', 'eating_out', 'transport', 'bills', 'energy', 'water', 'streaming', 
    'shopping', 'software', 'healthcare', 'pets', 'travel', 'fuel', 'insurance', 'other'
  ].sort();
  const GOAL_EMOJIS = ['🎯', '🏠', '✈️', '🚗', '💍', '🎓', '🏖️', '💻', '🐕', '👶', '📱'];

  const handleAddBudget = async () => {
    if (!budgetAmount || !budgetCategory) return;
    setLoading(true);
    try {
      await fetch('/api/money-hub/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: budgetCategory, monthly_limit: parseFloat(budgetAmount) }),
      });
      setBudgetAmount('');
      onUpdated();
    } catch { /* silent */ }
    setLoading(false);
  };

  const handleDeleteBudget = async (id: string) => {
    setLoading(true);
    try {
      await fetch(`/api/money-hub/budgets?id=${id}`, { method: 'DELETE' });
      onUpdated();
    } catch { /* silent */ }
    setLoading(false);
  };

  const handleAddGoal = async () => {
    if (!goalForm.name || !goalForm.targetAmount) return;
    setLoading(true);
    try {
      await fetch('/api/money-hub/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal_name: goalForm.name, emoji: goalForm.emoji, target_amount: parseFloat(goalForm.targetAmount), current_amount: parseFloat(goalForm.currentAmount || '0') }),
      });
      setGoalForm({ name: '', emoji: '🎯', targetAmount: '', currentAmount: '0' });
      onUpdated();
    } catch { /* silent */ }
    setLoading(false);
  };

  const handleDeleteGoal = async (id: string) => {
    setLoading(true);
    try {
      await fetch(`/api/money-hub/goals?id=${id}`, { method: 'DELETE' });
      onUpdated();
    } catch { /* silent */ }
    setLoading(false);
  };

  const handleAddMoneyToGoal = async (id: string, current: number) => {
    const amount = prompt('How much to add? (£)');
    if (!amount) return;
    setLoading(true);
    try {
      await fetch('/api/money-hub/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, current_amount: current + parseFloat(amount) }),
      });
      onUpdated();
    } catch { /* silent */ }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-navy-700 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-navy-800">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 pt-1"><Target className="h-6 w-6 text-green-400" /> Manage Budgets & Goals</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-2 rounded-lg hover:bg-navy-800 transition-colors"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex border-b border-navy-800">
          <button onClick={() => setActiveTab('budgets')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'budgets' ? 'text-green-400 border-b-2 border-green-400' : 'text-slate-500 hover:text-slate-300'}`}>Budgets</button>
          <button onClick={() => setActiveTab('goals')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === 'goals' ? 'text-mint-400 border-b-2 border-mint-400' : 'text-slate-500 hover:text-slate-300'}`}>Savings Goals</button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {activeTab === 'budgets' ? (
            <div className="space-y-6">
              <div className="bg-navy-950/50 p-4 rounded-xl border border-navy-800">
                <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">Add New Budget</h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <select value={budgetCategory} onChange={e => setBudgetCategory(e.target.value)} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none capitalize">
                    {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                  <input type="number" placeholder="Limit (£)" value={budgetAmount} onChange={e => setBudgetAmount(e.target.value)} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-green-400 focus:outline-none" />
                </div>
                <button onClick={handleAddBudget} disabled={loading || !budgetAmount || !budgetCategory} className="w-full bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg text-sm flex justify-center items-center gap-2"><Plus className="h-4 w-4" /> Save Budget</button>
              </div>
              <div>
                {budgets.length === 0 ? <p className="text-slate-500 text-sm">No budgets set.</p> : budgets.map((b: any) => (
                  <div key={b.id} className="flex justify-between items-center py-3 border-b border-navy-800 last:border-0">
                    <div><p className="text-white text-sm capitalize">{b.category.replace(/_/g, ' ')}</p><p className="text-xs text-slate-500">Target: £{fmtNum(b.monthly_limit)}</p></div>
                    <button onClick={() => handleDeleteBudget(b.id)} disabled={loading} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-navy-950/50 p-4 rounded-xl border border-navy-800">
                <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">Add Savings Goal</h3>
                <div className="mb-3">
                  <div className="flex gap-2 flex-wrap mb-2">
                    {GOAL_EMOJIS.map(em => (
                      <button key={em} onClick={() => setGoalForm(prev => ({ ...prev, emoji: em }))} className={`h-8 w-8 rounded-full flex items-center justify-center text-lg ${goalForm.emoji === em ? 'bg-mint-400/20 border border-mint-400/50' : 'hover:bg-navy-800 border border-transparent'}`}>{em}</button>
                    ))}
                  </div>
                  <input type="text" placeholder="Goal Name (e.g. Holiday)" value={goalForm.name} onChange={e => setGoalForm(prev => ({ ...prev, name: e.target.value }))} className="w-full mb-2 bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-mint-400 focus:outline-none" />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" placeholder="Target (£)" value={goalForm.targetAmount} onChange={e => setGoalForm(prev => ({ ...prev, targetAmount: e.target.value }))} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-mint-400 focus:outline-none" />
                    <input type="number" placeholder="Already saved (£)" value={goalForm.currentAmount} onChange={e => setGoalForm(prev => ({ ...prev, currentAmount: e.target.value }))} className="bg-navy-900 border border-navy-700 rounded-lg px-3 py-2 text-sm text-white focus:border-mint-400 focus:outline-none" />
                  </div>
                </div>
                <button onClick={handleAddGoal} disabled={loading || !goalForm.name || !goalForm.targetAmount} className="w-full bg-mint-400 hover:bg-mint-500 disabled:opacity-50 text-navy-950 font-semibold py-2 rounded-lg text-sm flex justify-center items-center gap-2"><Plus className="h-4 w-4" /> Save Goal</button>
              </div>
              <div>
                {goals.length === 0 ? <p className="text-slate-500 text-sm">No goals set.</p> : goals.map((g: any) => (
                  <div key={g.id} className="flex justify-between items-center py-3 border-b border-navy-800 last:border-0">
                    <div>
                      <p className="text-white text-sm">{g.emoji} {g.goal_name}</p>
                      <p className="text-xs text-slate-500">Saved: £{fmtNum(g.current_amount)} / £{fmtNum(g.target_amount)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleAddMoneyToGoal(g.id, g.current_amount)} className="text-mint-400 hover:text-mint-300 transition-colors flex items-center gap-1 text-xs font-semibold bg-mint-400/10 px-2 py-1 rounded-full"><PlusCircle className="h-3 w-3 " /> Add</button>
                      <button onClick={() => handleDeleteGoal(g.id)} disabled={loading} className="text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
