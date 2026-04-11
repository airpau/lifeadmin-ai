'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FileText, Building2, X, ArrowRight, Sparkles, CheckCircle2,
} from 'lucide-react';
import { capture } from '@/lib/posthog';
import BankPickerModal, { connectBankDirect } from '@/components/BankPickerModal';

interface OnboardingFlowProps {
  hasLetter: boolean;
  bankConnected: boolean;
  subscriptionCount: number;
  tier: string;
}

const QUICK_ISSUES = [
  { label: 'Energy bill too high', category: 'energy', icon: '⚡' },
  { label: 'Flight delayed', category: 'flight_delay', icon: '✈️' },
  { label: "Subscription won't cancel", category: 'subscription', icon: '🔄' },
  { label: 'Broadband issues', category: 'broadband', icon: '📡' },
  { label: 'Refund request', category: 'refund', icon: '💰' },
  { label: 'Council tax challenge', category: 'council_tax', icon: '🏛️' },
];

export default function OnboardingFlow({
  hasLetter,
  bankConnected,
  subscriptionCount,
  tier,
}: OnboardingFlowProps) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showBankPicker, setShowBankPicker] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isDismissed = localStorage.getItem('pb_onboarding_dismissed') === '1';
    setDismissed(isDismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('pb_onboarding_dismissed', '1');
    setDismissed(true);
    capture('onboarding_dismissed', { step: !hasLetter ? 'letter' : 'bank' });
  };

  if (!mounted || dismissed) return null;

  // All core steps done
  if (hasLetter && bankConnected) {
    return (
      <div className="bg-gradient-to-r from-emerald-500/10 to-mint-400/10 border border-emerald-500/20 rounded-2xl p-5 mb-8 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">You&apos;re all set!</p>
            <p className="text-slate-400 text-sm">
              Tracking {subscriptionCount} subscription{subscriptionCount !== 1 ? 's' : ''} and ready to fight unfair bills.
            </p>
          </div>
        </div>
        <button onClick={handleDismiss} className="text-slate-500 hover:text-white p-1 flex-shrink-0">
          <X className="h-5 w-5" />
        </button>
      </div>
    );
  }

  // Step 1 — No letters yet: deliver immediate value
  if (!hasLetter) {
    return (
      <div className="bg-gradient-to-br from-amber-500/10 via-amber-600/5 to-transparent border border-amber-500/20 rounded-2xl p-6 mb-8 relative">
        <button onClick={handleDismiss} className="absolute top-4 right-4 text-slate-500 hover:text-white p-1">
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 mb-4 pr-6">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">Quick win — 30 seconds</p>
            <h3 className="text-white font-bold text-lg leading-snug">Generate your first complaint letter</h3>
            <p className="text-slate-400 text-sm mt-1">
              AI-powered letters citing exact UK law. Free, no card needed.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {QUICK_ISSUES.map(issue => (
            <Link
              key={issue.category}
              href={`/dashboard/complaints?category=${issue.category}`}
              onClick={() => capture('onboarding_issue_click', { category: issue.category })}
              className="flex items-center gap-2 bg-navy-800/60 hover:bg-amber-500/10 border border-navy-700/50 hover:border-amber-500/30 rounded-xl px-3 py-2.5 transition-all"
            >
              <span className="text-base leading-none">{issue.icon}</span>
              <span className="text-sm text-slate-300 leading-tight">{issue.label}</span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/complaints"
            onClick={() => capture('onboarding_cta_click', { step: 'letter' })}
            className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-5 py-2.5 rounded-xl transition-all text-sm"
          >
            <Sparkles className="h-4 w-4" />
            Open letter generator
            <ArrowRight className="h-4 w-4" />
          </Link>
          <span className="text-slate-500 text-xs">Free — no credit card</span>
        </div>
      </div>
    );
  }

  // Step 2 — Has letter but no bank: connect bank
  return (
    <div className="bg-gradient-to-br from-blue-500/10 via-blue-600/5 to-transparent border border-blue-500/20 rounded-2xl p-6 mb-8 relative">
      <button onClick={handleDismiss} className="absolute top-4 right-4 text-slate-500 hover:text-white p-1">
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 mb-4 pr-6">
        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Building2 className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">Next step</p>
          <h3 className="text-white font-bold text-lg leading-snug">Connect your bank — find hidden costs</h3>
          <p className="text-slate-400 text-sm mt-1">
            We typically find <span className="text-white font-semibold">£47/month</span> in forgotten subscriptions. Takes 2 minutes.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {[
          { icon: '🔍', title: 'Subscription detection', desc: 'Every recurring payment found automatically' },
          { icon: '📊', title: 'Spending breakdown', desc: '20+ categories analysed in seconds' },
          { icon: '🔔', title: 'Price increase alerts', desc: 'Get notified when your bills go up' },
        ].map(item => (
          <div key={item.title} className="bg-navy-800/40 rounded-xl p-3 border border-navy-700/30">
            <span className="text-xl">{item.icon}</span>
            <p className="text-white text-sm font-semibold mt-1">{item.title}</p>
            <p className="text-slate-400 text-xs mt-0.5">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => { capture('onboarding_cta_click', { step: 'bank' }); if (!connectBankDirect()) setShowBankPicker(true); }}
          className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-all text-sm"
        >
          <Building2 className="h-4 w-4" />
          Connect bank (2 minutes)
          <ArrowRight className="h-4 w-4" />
        </button>
        <span className="text-slate-500 text-xs">FCA regulated · Read-only</span>
      </div>
      <BankPickerModal isOpen={showBankPicker} onClose={() => setShowBankPicker(false)} />
    </div>
  );
}
