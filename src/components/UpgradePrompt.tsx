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
            <p className="text-sm text-white font-medium">Unlock unlimited letters, daily bank sync, and full spending intelligence</p>
            <p className="text-xs text-slate-400">Essential from £4.99/month</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link href="/pricing" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap">
            Upgrade
          </Link>
          <button onClick={handleClose} className="text-slate-500 hover:text-white p-1">
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
        <div className="relative bg-navy-900 border border-navy-700/50 rounded-2xl p-8 max-w-md w-full shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-mint-400/10 border border-mint-400/30 mb-4">
              <Sparkles className="h-8 w-8 text-mint-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Upgrade to Keep Scanning</h2>
            <p className="text-slate-400">Free users get one email scan. Upgrade to Essential for unlimited scans and daily bank sync.</p>
          </div>
          <div className="bg-navy-950 rounded-xl p-4 mb-6 border border-navy-700/50">
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Unlimited email scans</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Unlimited complaint letters</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Daily bank sync</li>
              <li className="flex items-center gap-2"><span className="text-mint-400">✓</span> Full spending intelligence</li>
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <Link href="/pricing" className="w-full py-3 bg-mint-400 hover:bg-mint-500 text-navy-950 font-bold rounded-xl transition-all text-center">
              Upgrade — from £4.99/mo
            </Link>
            <button onClick={handleClose} className="text-slate-500 hover:text-white text-sm transition-colors">Maybe later</button>
          </div>
        </div>
      </div>
    );
  }

  // inline
  return (
    <div className="bg-navy-900 border border-mint-400/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-mint-400" />
        <p className="text-sm text-white font-medium">Upgrade your plan</p>
      </div>
      <p className="text-xs text-slate-400 mb-3">Get unlimited letters, bank sync, and full financial insights.</p>
      <Link href="/pricing" className="inline-flex items-center gap-1 bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all">
        View plans <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
