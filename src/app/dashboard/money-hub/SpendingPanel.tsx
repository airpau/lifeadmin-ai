import { formatGBP } from '@/lib/format';
import { Lock, FileText } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import CategoryDrillDownModal from './CategoryDrillDownModal';

export default function SpendingPanel({ data, isPro, refreshData, selectedMonth }: { data: any, isPro: boolean, refreshData: () => void, selectedMonth: string }) {
  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const categories = data.spending.categories || [];
  const topMerchants = data.spending.topMerchants || [];
  const maxTotal = categories.length > 0 ? categories[0].total : 1;
  const maxMTotal = topMerchants.length > 0 ? topMerchants[0].total : 1;

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-purple-400" />
          Spending Breakdown
        </h3>
      </div>
      
      <div className="space-y-4 flex-1">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">By Category</p>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-500">No categorised spend yet.</p>
          ) : (
            categories.slice(0, 5).map((c: any) => (
              <div 
                key={c.category} 
                className="mb-2 cursor-pointer hover:bg-navy-800/50 p-2 -mx-2 rounded-lg transition-colors group"
                onClick={() => setDrillCategory(c.category)}
              >
                <div className="flex justify-between text-sm mb-1 group-hover:text-mint-400 transition-colors">
                  <span className="text-slate-300 capitalize group-hover:text-mint-400">{c.category.replace(/_/g, ' ')}</span>
                  <span className="text-white font-medium group-hover:text-mint-400">£{formatGBP(c.total)}</span>
                </div>
                <div className="w-full bg-navy-800 rounded-full h-1.5">
                  <div className="bg-purple-400 h-1.5 rounded-full" style={{ width: `${(c.total / maxTotal) * 100}%` }} />
                </div>
              </div>
            ))
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
                  <span className="text-white font-medium">£{formatGBP(m.total)}</span>
                </div>
                <div className="w-full bg-navy-800 rounded-full h-1.5">
                  <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${(m.total / maxMTotal) * 100}%` }} />
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
