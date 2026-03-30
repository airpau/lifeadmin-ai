'use client';

import Link from 'next/link';
import { TrendingUp, FileText, ArrowRight, X } from 'lucide-react';
import { cleanMerchantName } from '@/lib/merchant-utils';

interface PriceAlert {
  id: string;
  merchant_name: string;
  merchant_normalized: string;
  old_amount: number;
  new_amount: number;
  increase_pct: number;
  annual_impact: number;
  old_date: string;
  new_date: string;
  status: string;
}

interface PriceIncreaseCardProps {
  alert: PriceAlert;
  onDismiss: (id: string) => void;
  onAction: (id: string) => void;
}

const ENERGY_KEYWORDS = ['energy', 'gas', 'electric', 'eon', 'edf', 'octopus', 'ovo', 'british gas', 'scottish power', 'bulb', 'shell energy', 'utilita'];
const BROADBAND_MOBILE_KEYWORDS = ['broadband', 'virgin media', 'bt', 'sky', 'talktalk', 'plusnet', 'hyperoptic', 'vodafone', 'ee', 'three', 'o2', 'giffgaff', 'mobile'];

function getRegulationHint(merchantNormalized: string): string | null {
  const lower = merchantNormalized.toLowerCase();

  if (ENERGY_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'Under Ofgem rules, suppliers must give 30 days notice of price changes';
  }

  if (BROADBAND_MOBILE_KEYWORDS.some(kw => lower.includes(kw))) {
    return 'Under Ofcom rules, mid-contract price rises may give you the right to exit penalty-free';
  }

  return null;
}

export default function PriceIncreaseCard({ alert, onDismiss, onAction }: PriceIncreaseCardProps) {
  const cleanName = cleanMerchantName(alert.merchant_name || alert.merchant_normalized);
  const regulationHint = getRegulationHint(cleanName);

  const complaintUrl = `/dashboard/complaints?company=${encodeURIComponent(cleanName)}&issue=${encodeURIComponent(`price increase from £${alert.old_amount.toFixed(2)} to £${alert.new_amount.toFixed(2)}`)}`;

  return (
    <div className="bg-navy-900 border border-red-500/20 rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">{cleanName}</h3>
            <p className="text-slate-500 text-xs">
              {new Date(alert.old_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
              {' '}&rarr;{' '}
              {new Date(alert.new_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <span className="bg-red-500/10 text-red-400 text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
          +{alert.increase_pct}%
        </span>
      </div>

      {/* Price comparison */}
      <div className="flex items-center gap-3 mb-3">
        <div className="bg-navy-800 rounded-lg px-4 py-2 text-center flex-1">
          <p className="text-slate-500 text-xs mb-0.5">Was</p>
          <p className="text-white font-semibold">&pound;{alert.old_amount.toFixed(2)}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-red-400 flex-shrink-0" />
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-2 text-center flex-1">
          <p className="text-slate-500 text-xs mb-0.5">Now</p>
          <p className="text-red-400 font-bold">&pound;{alert.new_amount.toFixed(2)}</p>
        </div>
      </div>

      {/* Annual impact */}
      <p className="text-sm text-slate-300 mb-3">
        This costs you <span className="text-amber-400 font-semibold">&pound;{alert.annual_impact.toFixed(2)} more per year</span>
      </p>

      {/* Regulation hint */}
      {regulationHint && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg px-3 py-2 mb-4">
          <p className="text-blue-400 text-xs">{regulationHint}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-navy-700/50 flex-wrap">
        <Link
          href={complaintUrl}
          onClick={() => onAction(alert.id)}
          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
        >
          <FileText className="h-3 w-3" /> Write Complaint
        </Link>
        <Link
          href="/dashboard/deals"
          className="bg-mint-400/10 hover:bg-mint-400/20 text-mint-400 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1"
        >
          <ArrowRight className="h-3 w-3" /> Find Better Deal
        </Link>
        <div className="flex-1" />
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-slate-500 hover:text-slate-400 text-xs transition-all px-2 py-1.5 flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Dismiss
        </button>
      </div>
    </div>
  );
}
