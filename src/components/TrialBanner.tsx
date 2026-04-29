'use client';

import Link from 'next/link';
import { Clock, AlertTriangle, XCircle } from 'lucide-react';

interface TrialBannerProps {
  daysLeft: number | null;
  trialExpired: boolean;
}

export default function TrialBanner({ daysLeft, trialExpired }: TrialBannerProps) {
  if (!trialExpired && daysLeft === null) return null;

  if (trialExpired || (daysLeft !== null && daysLeft <= 0)) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-white">Your Pro trial has ended. Subscribe to continue using Pro features.</p>
        </div>
        <Link href="/pricing" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap">
          Subscribe Now
        </Link>
      </div>
    );
  }

  if (daysLeft !== null && daysLeft <= 3) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-400 flex-shrink-0" />
          <p className="text-sm text-white">Your Pro trial ends in <strong>{daysLeft}</strong> {daysLeft === 1 ? 'day' : 'days'} — subscribe now to keep your features</p>
        </div>
        <Link href="/pricing" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap">
          Subscribe
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-mint-400/5 border border-mint-400/20 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-mint-400 flex-shrink-0" />
        <p className="text-sm text-slate-300">You&apos;re on a free Pro trial — <strong className="text-white">{daysLeft} days remaining</strong></p>
      </div>
      <Link href="/pricing" className="bg-navy-800 hover:bg-navy-700 text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap">
        Subscribe to keep Pro
      </Link>
    </div>
  );
}
