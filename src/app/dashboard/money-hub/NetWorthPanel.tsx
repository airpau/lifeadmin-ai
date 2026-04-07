import { formatGBP } from '@/lib/format';
import { PiggyBank, Lock, Settings } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import NetWorthManagementModal from './NetWorthManagementModal';

export default function NetWorthPanel({ data, isPro, refreshData }: { data: any, isPro: boolean, refreshData: () => void }) {
  const [modalOpen, setModalOpen] = useState(false);
  const { total, assets, liabilities, assetsList, liabilitiesList } = data.netWorth || { total: 0, assets: 0, liabilities: 0, assetsList: [], liabilitiesList: [] };

  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <PiggyBank className="h-5 w-5 text-mint-400" />
          Net Worth
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-mint-400 font-bold text-xl">£{formatGBP(total)}</span>
          {isPro && (
            <button onClick={() => setModalOpen(true)} className="text-slate-500 hover:text-white transition-colors" title="Manage Net Worth">
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      
      {!isPro ? (
        <div className="bg-navy-950/50 border border-navy-700/50 rounded-xl p-4 relative overflow-hidden flex-1">
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Lock className="h-6 w-6 text-slate-500 mb-2" />
            <p className="text-white font-semibold text-xs mb-1">Upgrade to track Net Worth</p>
            <Link href="/pricing" className="text-mint-400 text-[10px] hover:text-mint-300">View plans</Link>
          </div>
          <div className="flex justify-between items-center opacity-30 mt-4 pointer-events-none">
            <div><p className="text-xs text-slate-400">Assets</p><p className="text-lg text-white font-semibold">£---</p></div>
            <div className="text-right"><p className="text-xs text-slate-400">Liabilities</p><p className="text-lg text-white font-semibold">£---</p></div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex justify-between items-center bg-navy-950/50 rounded-xl p-4 border border-navy-800 mb-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Total Assets</p>
              <p className="text-lg text-green-400 font-semibold">£{formatGBP(assets)}</p>
            </div>
            <div className="px-4 text-slate-500">-</div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-1">Total Liabilities</p>
              <p className="text-lg text-red-400 font-semibold">£{formatGBP(liabilities)}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Top Assets</p>
              {assetsList.length === 0 ? <p className="text-xs text-slate-500">None manually added.</p> : assetsList.slice(0, 2).map((a: any) => (
                <div key={a.id} className="flex justify-between text-sm py-1 border-b border-navy-800/50 last:border-0">
                  <span className="text-slate-300">{a.asset_name}</span>
                  <span className="text-green-400 font-medium">£{formatGBP(a.estimated_value)}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Top Liabilities</p>
              {liabilitiesList.length === 0 ? <p className="text-xs text-slate-500">None manually added.</p> : liabilitiesList.slice(0, 2).map((l: any) => (
                <div key={l.id} className="flex justify-between text-sm py-1 border-b border-navy-800/50 last:border-0">
                  <span className="text-slate-300">{l.liability_name}</span>
                  <span className="text-red-400 font-medium">£{formatGBP(l.outstanding_balance)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      <NetWorthManagementModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        data={data}
        onUpdated={() => { refreshData(); }}
      />
    </div>
  );
}
