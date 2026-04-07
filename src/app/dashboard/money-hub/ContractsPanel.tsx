import { formatGBP } from '@/lib/format';
import { Calendar, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { Lock } from 'lucide-react';

export default function ContractsPanel({ data, isPro }: { data: any, isPro: boolean }) {
  const subscriptions = data.subscriptions || [];
  
  return (
    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-amber-400" />
          Tracked Contracts & Subs
        </h3>
        <Link href="/dashboard/subscriptions" className="text-mint-400 hover:text-mint-300 text-sm font-medium">Manage</Link>
      </div>
      
      {!isPro ? (
        <div className="bg-navy-950/50 border border-navy-700/50 rounded-xl p-4 relative overflow-hidden flex-1">
          <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Lock className="h-6 w-6 text-slate-500 mb-2" />
            <p className="text-white font-semibold text-xs mb-1">Upgrade to track subscriptions</p>
            <Link href="/pricing" className="text-mint-400 text-[10px] hover:text-mint-300">View plans</Link>
          </div>
          <div className="space-y-3 opacity-30 pointer-events-none">
            <div className="h-10 bg-navy-800 rounded-lg w-full" />
            <div className="h-10 bg-navy-800 rounded-lg w-full" />
            <div className="h-10 bg-navy-800 rounded-lg w-full" />
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          {subscriptions.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No subscriptions tracked yet.</p>
          ) : (
            subscriptions.slice(0, 5).map((sub: any) => {
              let tag = null;
              if (sub.contract_end_date) {
                const days = Math.ceil((new Date(sub.contract_end_date).getTime() - new Date().getTime()) / 86400000);
                if (days > 0 && days <= 60) {
                  tag = <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full"><AlertTriangle className="h-3 w-3" /> Ends in {days}d</span>;
                }
              }
              
              return (
                <div key={sub.id} className="flex items-center justify-between bg-navy-950/50 rounded-xl p-3 border border-navy-800">
                  <div>
                    <p className="text-sm font-medium text-white capitalize">{sub.provider_name}</p>
                    {tag}
                  </div>
                  <p className="text-sm font-semibold text-amber-400">£{formatGBP(sub.amount)}<span className="text-[10px] text-slate-500 font-normal">/{sub.billing_cycle === 'yearly' ? 'yr' : 'mo'}</span></p>
                </div>
              );
            })
          )}
          {subscriptions.length > 5 && (
            <p className="text-center text-xs text-slate-500 pt-2">+ {subscriptions.length - 5} more</p>
          )}
        </div>
      )}
    </div>
  );
}
