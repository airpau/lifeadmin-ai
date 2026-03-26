'use client';

import Link from 'next/link';
import { TrendingDown, ArrowRight } from 'lucide-react';
import { formatGBP } from '@/lib/format';

interface SavingsOpportunityWidgetProps {
  totalSaving: number;
  count: number;
}

export default function SavingsOpportunityWidget({ totalSaving, count }: SavingsOpportunityWidgetProps) {
  if (totalSaving <= 0 || count <= 0) return null;

  return (
    <div className="bg-gradient-to-r from-green-500/10 to-green-600/5 border border-green-500/20 rounded-2xl p-6 mb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
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
              {count} subscription{count !== 1 ? 's' : ''} with cheaper alternatives available
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/subscriptions"
          className="inline-flex items-center gap-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border border-green-500/20"
        >
          View Deals <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
