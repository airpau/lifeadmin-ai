'use client';

import Link from 'next/link';
import { TrendingDown, ArrowRight, ExternalLink } from 'lucide-react';
import { formatGBP } from '@/lib/format';

interface DealComparison {
  subscriptionName: string;
  currentPrice: number;
  dealProvider: string;
  dealPrice: number;
  annualSaving: number;
  dealUrl: string;
  category: string;
}

interface SavingsOpportunityWidgetProps {
  totalSaving: number;
  count: number;
  deals?: DealComparison[];
}

export default function SavingsOpportunityWidget({ totalSaving, count, deals }: SavingsOpportunityWidgetProps) {
  if (totalSaving <= 0 || count <= 0) return null;

  const topDeals = (deals || []).sort((a, b) => b.annualSaving - a.annualSaving).slice(0, 3);

  return (
    <div className="bg-gradient-to-r from-green-500/10 to-green-600/5 border border-green-500/20 rounded-2xl p-6 mb-8">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <TrendingDown className="h-6 w-6 text-green-400" />
        </div>
        <div>
          <p className="text-sm text-green-400 font-semibold uppercase tracking-wider mb-0.5">
            Better deals found
          </p>
          <p className="text-2xl md:text-3xl font-bold text-white font-[family-name:var(--font-heading)]">
            Save {formatGBP(totalSaving)}<span className="text-lg font-normal text-slate-400">/year</span>
          </p>
          <p className="text-sm text-slate-400 mt-0.5">
            {count} subscription{count !== 1 ? 's' : ''} with cheaper alternatives
          </p>
        </div>
      </div>

      {topDeals.length > 0 && (
        <div className="space-y-2 mb-4">
          {topDeals.map((deal, i) => (
            <div key={i} className="flex items-center justify-between bg-navy-950/50 rounded-lg px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{deal.subscriptionName}</p>
                <p className="text-slate-500 text-xs">
                  {formatGBP(deal.currentPrice)}/mo → <span className="text-green-400 font-medium">{formatGBP(deal.dealPrice)}/mo</span> with {deal.dealProvider}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                <span className="text-green-400 text-sm font-semibold whitespace-nowrap">
                  Save {formatGBP(deal.annualSaving)}/yr
                </span>
                <a
                  href={deal.dealUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500/20 hover:bg-green-500/30 text-green-400 p-2 rounded-lg transition-all"
                  title={`Switch to ${deal.dealProvider}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/dashboard/subscriptions"
        className="inline-flex items-center gap-1.5 text-green-400 hover:text-green-300 text-sm font-medium transition-all"
      >
        View all comparisons <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
