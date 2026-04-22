'use client';

import { fmtNum } from '@/lib/format';
import { Calendar, AlertTriangle, Lock, ExternalLink } from 'lucide-react';
import Link from 'next/link';

/** Normalise a provider name for dedup (mirrors the cron logic). */
function normaliseProvider(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|inc|corp|co\.uk|uk)\b/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Logarithmic amount band (~10% wide). Amounts within ~5% map to the same
 * band; amounts differing by >10% produce different bands.
 * Prevents two separate bills at the same provider but different amounts
 * (e.g. two council-tax DDs) from being collapsed to one entry.
 */
function amountBand(amount: number): number {
  if (amount <= 0) return 0;
  return Math.round(Math.log(Math.max(amount, 0.01)) / Math.log(1.1));
}

export default function ContractsPanel({ data, isPro }: { data: any, isPro: boolean }) {
  const subscriptions = data.subscriptions || [];

  // Deduplicate active subscriptions by normalised provider name + billing cycle
  // + amount band.  Including the amount band ensures that two genuinely separate
  // subscriptions from the same provider at different amounts (e.g. two council-
  // tax DDs for different properties) are shown as distinct entries.
  const seen = new Map<string, boolean>();
  const activeSubs = subscriptions
    .filter((s: any) => s.status === 'active')
    .filter((s: any) => {
      const band = amountBand(Math.abs(parseFloat(String(s.amount)) || 0));
      const key = `${normaliseProvider(s.provider_name)}|${s.billing_cycle}|${band}`;
      if (seen.has(key)) return false;
      seen.set(key, true);
      return true;
    });
  
  // Calculate totals
  const monthlyTotal = activeSubs.reduce((sum: number, s: any) => {
    const amt = Math.abs(parseFloat(String(s.amount)) || 0);
    if (s.billing_cycle === 'yearly') return sum + amt / 12;
    if (s.billing_cycle === 'quarterly') return sum + amt / 3;
    return sum + amt;
  }, 0);
  
  const switchableCats = new Set(['energy', 'broadband', 'mobile', 'insurance', 'streaming']);
  const switchableCount = activeSubs.filter((s: any) => switchableCats.has(s.category)).length;

  return (
    <div className="card p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-slate-900 font-semibold text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-amber-400" />
          Regular Payments
        </h3>
        <Link href="/dashboard/money-hub/payments" className="text-mint-400 hover:text-mint-300 text-sm font-medium flex items-center gap-1">
          View all <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Summary strip */}
      {activeSubs.length > 0 && (
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div>
            <span className="text-slate-500">Monthly</span>
            <p className="text-slate-900 font-semibold">£{fmtNum(monthlyTotal)}</p>
          </div>
          <div className="text-slate-700">|</div>
          <div>
            <span className="text-slate-500">Annual</span>
            <p className="text-amber-400 font-semibold">£{fmtNum(monthlyTotal * 12)}</p>
          </div>
          {switchableCount > 0 && (
            <>
              <div className="text-slate-700">|</div>
              <Link href="/dashboard/deals" className="text-mint-400 hover:text-mint-300 transition-colors">
                {switchableCount} could be switched →
              </Link>
            </>
          )}
        </div>
      )}
      
      {!isPro ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 relative overflow-hidden flex-1">
          <div className="absolute inset-0 bg-white backdrop-blur-sm z-10 flex flex-col items-center justify-center">
            <Lock className="h-6 w-6 text-slate-500 mb-2" />
            <p className="text-slate-900 font-semibold text-xs mb-1">Upgrade to track subscriptions</p>
            <Link href="/pricing" className="text-mint-400 text-[10px] hover:text-mint-300">View plans</Link>
          </div>
          <div className="space-y-3 opacity-30 pointer-events-none">
            <div className="h-10 bg-slate-100 rounded-lg w-full" />
            <div className="h-10 bg-slate-100 rounded-lg w-full" />
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-2">
          {activeSubs.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No subscriptions tracked yet.</p>
          ) : (
            activeSubs.slice(0, 6).map((sub: any) => {
              let tag = null;
              if (sub.contract_end_date) {
                const days = Math.ceil((new Date(sub.contract_end_date).getTime() - new Date().getTime()) / 86400000);
                if (days > 0 && days <= 60) {
                  tag = <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full"><AlertTriangle className="h-3 w-3" /> Ends in {days}d</span>;
                } else if (days <= 0) {
                  tag = <span className="text-[10px] text-red-400 bg-red-400/10 px-2 py-0.5 rounded-full">Expired</span>;
                }
              }

              const amt = Math.abs(parseFloat(String(sub.amount)) || 0);
              const cycleLabel = sub.billing_cycle === 'yearly' ? '/yr' : sub.billing_cycle === 'quarterly' ? '/qtr' : '/mo';
              
              return (
                <div key={sub.id} className="flex items-center justify-between bg-white rounded-xl p-3 border border-slate-200 hover:border-slate-200 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 capitalize truncate">{sub.provider_name}</p>
                    {tag}
                  </div>
                  <p className="text-sm font-semibold text-amber-400 whitespace-nowrap ml-2">
                    £{fmtNum(amt)}<span className="text-[10px] text-slate-500 font-normal">{cycleLabel}</span>
                  </p>
                </div>
              );
            })
          )}
          {activeSubs.length > 6 && (
            <Link href="/dashboard/money-hub/payments" className="block text-center text-xs text-slate-500 hover:text-mint-400 pt-1 transition-colors">
              + {activeSubs.length - 6} more payments
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
