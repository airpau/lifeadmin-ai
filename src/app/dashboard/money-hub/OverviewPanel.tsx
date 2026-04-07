import { formatGBP } from '@/lib/format';
import { TrendingUp, TrendingDown, Target } from 'lucide-react';

export default function OverviewPanel({ data }: { data: any }) {
  const { overview, healthScore } = data;
  const { monthlyIncome, monthlyOutgoings, savingsRate } = overview;
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
        <p className="text-3xl font-bold text-green-400">£{formatGBP(monthlyIncome)}</p>
        <p className="text-slate-400 text-sm mt-1 whitespace-nowrap overflow-hidden text-ellipsis">Recorded Income</p>
      </div>
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
        <p className="text-3xl font-bold text-amber-400">£{formatGBP(monthlyOutgoings)}</p>
        <p className="text-slate-400 text-sm mt-1 whitespace-nowrap overflow-hidden text-ellipsis">Actual Spend</p>
      </div>
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5">
        <p className="text-3xl font-bold text-mint-400">{savingsRate.toFixed(1)}%</p>
        <p className="text-slate-400 text-sm mt-1 whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-1">
          {savingsRate >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          Savings Rate
        </p>
      </div>
      <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 relative overflow-hidden group">
        <p className={`text-3xl font-bold ${data.score >= 80 ? 'text-green-400' : data.score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
          {data.score}
        </p>
        <p className="text-slate-400 text-sm mt-1 flex items-center gap-1 whitespace-nowrap overflow-hidden text-ellipsis">
          <Target className="h-3 w-3" />
          Health Score
        </p>
        <div className="absolute inset-0 bg-navy-800/90 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-center px-4 text-xs">
          <div className="flex justify-between mb-1"><span>Spend</span><span>{healthScore?.pillars?.spend?.score || 0}%</span></div>
          <div className="flex justify-between mb-1"><span>Save</span><span>{healthScore?.pillars?.save?.score || 0}%</span></div>
          <div className="flex justify-between mb-1"><span>Borrow</span><span>{healthScore?.pillars?.borrow?.score || 0}%</span></div>
          <div className="flex justify-between"><span>Plan</span><span>{healthScore?.pillars?.plan?.score || 0}%</span></div>
        </div>
      </div>
    </div>
  );
}
