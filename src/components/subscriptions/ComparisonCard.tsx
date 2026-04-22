'use client';

import { useState } from 'react';
import { TrendingDown, ArrowRight, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { formatGBP } from '@/lib/format';

interface Comparison {
  dealProvider: string;
  dealName: string;
  dealUrl: string;
  currentPrice: number;
  dealPrice: number;
  annualSaving: number;
}

interface ComparisonCardProps {
  subscription: {
    id: string;
    provider_name: string;
    amount: number;
    billing_cycle: string;
  };
  comparisons: Comparison[];
  category?: string;
}

export default function ComparisonCard({ subscription, comparisons, category }: ComparisonCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!comparisons || comparisons.length === 0) return null;

  const best = comparisons[0];
  const others = comparisons.slice(1);
  const isComparisonOnly = best.annualSaving === 0 && best.dealPrice === 0;

  const dealsPageCategory = category || 'energy';

  return (
    <div className="mt-3 pt-3 border-t border-green-500/10">
      {/* Badge + toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="flex items-center gap-2 w-full text-left group"
      >
        <span className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-400 px-2.5 py-1 rounded-lg text-xs font-medium border border-green-500/20">
          <TrendingDown className="h-3 w-3" />
          {isComparisonOnly ? 'Compare deals' : `Save ${formatGBP(best.annualSaving)}/year`}
        </span>
        <span className="text-xs text-slate-500 group-hover:text-slate-500 transition-colors">
          {expanded ? 'Hide' : 'Show'} alternatives
        </span>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-slate-500" />
          : <ChevronDown className="h-3 w-3 text-slate-500" />
        }
      </button>

      {expanded && (
        <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Best deal - prominent card */}
          <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              {/* Your plan vs Best deal */}
              <div className="flex-1 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Your plan</p>
                  <p className="text-sm font-medium text-slate-900">{subscription.provider_name}</p>
                  <p className="text-sm text-slate-500">
                    {formatGBP(subscription.amount)}/{subscription.billing_cycle === 'one-time' ? 'once' : 'mo'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Best deal</p>
                  <p className="text-sm font-medium text-green-400">{best.dealProvider}</p>
                  {!isComparisonOnly && (
                    <p className="text-sm text-green-400/80">{formatGBP(best.dealPrice)}/mo</p>
                  )}
                  <p className="text-xs text-slate-500 mt-0.5">{best.dealName}</p>
                </div>
              </div>

              {/* Saving amount */}
              {!isComparisonOnly && best.annualSaving > 0 && (
                <div className="text-right flex-shrink-0">
                  <p className="text-2xl font-bold text-green-400">{formatGBP(best.annualSaving)}</p>
                  <p className="text-xs text-slate-500">/year saving</p>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mt-3">
              <a
                href={`/deals/${dealsPageCategory}`}
                className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-100 text-slate-900 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              >
                Compare Deals <ArrowRight className="h-3 w-3" />
              </a>
              <a
                href={best.dealUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-green-500/20"
              >
                Switch Now <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Other alternatives - compact */}
          {others.length > 0 && (
            <div className="space-y-1.5">
              {others.map((alt, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-100 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 truncate">{alt.dealProvider}</p>
                    <p className="text-xs text-slate-500 truncate">{alt.dealName}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                    {!isComparisonOnly && alt.annualSaving > 0 && (
                      <span className="text-xs text-green-400 font-medium">Save {formatGBP(alt.annualSaving)}/yr</span>
                    )}
                    {!isComparisonOnly && alt.dealPrice > 0 && (
                      <span className="text-xs text-slate-500">{formatGBP(alt.dealPrice)}/mo</span>
                    )}
                    <a
                      href={alt.dealUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-mint-400 hover:text-mint-300 transition-colors"
                      title="View deal"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
