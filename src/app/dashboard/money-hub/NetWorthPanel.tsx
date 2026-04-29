'use client';

import { fmtNum } from '@/lib/format';
import { PiggyBank, Lock, Settings, TrendingUp, TrendingDown } from 'lucide-react';
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
          <span className={`font-bold text-xl ${total >= 0 ? 'text-mint-400' : 'text-red-400'}`}>
            {total >= 0 ? '' : '-'}£{fmtNum(Math.abs(total))}
          </span>
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
          {/* Assets vs Liabilities summary */}
          <div className="flex justify-between items-center bg-navy-950/50 rounded-xl p-4 border border-navy-800 mb-4">
            <div>
              <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3 text-green-400" /> Assets</p>
              <p className="text-lg text-green-400 font-semibold">£{fmtNum(assets)}</p>
            </div>
            <div className="px-4 text-slate-500 text-lg">−</div>
            <div className="text-right">
              <p className="text-xs text-slate-400 mb-1 flex items-center gap-1 justify-end"><TrendingDown className="h-3 w-3 text-red-400" /> Liabilities</p>
              <p className="text-lg text-red-400 font-semibold">£{fmtNum(liabilities)}</p>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* Top assets */}
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Assets</p>
              {assetsList.length === 0 ? (
                <p className="text-xs text-slate-500">Add assets manually to track net worth.</p>
              ) : (
                assetsList.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="flex justify-between text-sm py-1.5 border-b border-navy-800/50 last:border-0">
                    <span className="text-slate-300">{a.asset_name}</span>
                    <span className="text-green-400 font-medium">£{fmtNum(parseFloat(String(a.estimated_value)) || 0)}</span>
                  </div>
                ))
              )}
            </div>

            {/* Top liabilities */}
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2 font-semibold">Liabilities</p>
              {liabilitiesList.length === 0 ? (
                <p className="text-xs text-slate-500">No liabilities tracked.</p>
              ) : (
                liabilitiesList.slice(0, 3).map((l: any) => (
                  <div key={l.id} className="flex justify-between text-sm py-1.5 border-b border-navy-800/50 last:border-0">
                    <span className="text-slate-300">{l.liability_name}</span>
                    <span className="text-red-400 font-medium">£{fmtNum(parseFloat(String(l.outstanding_balance)) || 0)}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <p className="text-[10px] text-slate-500 mt-3 pt-2 border-t border-navy-800/30">
            Auto-sync with bank balances coming soon. Assets must be added manually.
          </p>
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
