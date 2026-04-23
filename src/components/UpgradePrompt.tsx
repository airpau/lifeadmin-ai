'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, Sparkles, ArrowRight } from 'lucide-react';

interface UpgradePromptProps {
  variant: 'banner' | 'modal' | 'inline';
  onClose?: () => void;
}

export default function UpgradePrompt({ variant, onClose }: UpgradePromptProps) {
  const [dismissed, setDismissed] = useState(false);

  const handleClose = () => {
    setDismissed(true);
    onClose?.();
  };

  if (dismissed) return null;

  if (variant === 'banner') {
    return (
      <div className="bg-gradient-to-r from-mint-400/10 to-purple-500/10 border border-mint-400/20 rounded-xl px-4 py-3 mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Sparkles className="h-5 w-5 text-mint-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-slate-900 font-medium">Unlock unlimited letters, daily bank sync, and full spending intelligence</p>
            <p className="text-xs text-slate-500">Essential from £4.99/month</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/pricing" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap">
            Upgrade
          </Link>
          <button onClick={handleClose} className="text-slate-500 hover:text-slate-900 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  if (variant === 'modal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
        <div className="relative card p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-mint-400/10 border border-mint-400/30 mb-4">
              <Sparkles className="h-8 w-8 text-mint-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Upgrade to unlock more</h2>
            <p className="text-slate-500">You&apos;re on the Free plan. Upgrade to Essential to unlock unlimited letters, 3 bank accounts, 3 email inboxes, and the full Money Hub.</p>
          </div>
          <div className="bg-white rounded-xl p-4 mb-6 border border-slate-200">
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Unlimited AI dispute letters</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> 3 bank accounts &middot; daily auto-sync</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> 3 email inboxes &middot; Watchdog reply monitoring</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> AI cancellation emails with legal context</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Full spending intelligence (20+ categories)</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Budgets + savings goals</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Renewal reminders (30/14/7 days)</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Price-increase alerts by email</li>
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <Link href="/pricing" className="w-full py-3 bg-mint-400 hover:bg-mint-500 text-navy-950 font-bold rounded-xl transition-all text-center">
              Upgrade — from £4.99/mo
            </Link>
            <button onClick={handleClose} className="text-slate-500 hover:text-slate-900 text-sm transition-colors">Maybe later</button>
          </div>
        </div>
      </div>
    );
  }

  // inline
  return (
    <div className="bg-white border border-mint-400/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-mint-400" />
        <p className="text-sm text-slate-900 font-medium">Upgrade your plan</p>
      </div>
      <p className="text-xs text-slate-500 mb-3">Get unlimited letters, bank sync, and full financial insights.</p>
      <Link href="/pricing" className="inline-flex items-center gap-1 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all">
        View plans <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
