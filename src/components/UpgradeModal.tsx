'use client';

import { useRouter } from 'next/navigation';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  used: number;
  limit: number;
  tier: string;
}

export default function UpgradeModal({ open, onClose, used, limit, tier }: UpgradeModalProps) {
  const router = useRouter();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0f1629] border border-[#1e3a5f] rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/30 mb-4">
            <svg className="w-8 h-8 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Monthly Limit Reached</h2>
          <p className="text-gray-400">
            You&apos;ve used <span className="text-slate-900 font-semibold">{used} of {limit}</span> complaint{limit !== 1 ? 's' : ''} this month on the{' '}
            <span className="text-yellow-400 capitalize">{tier}</span> plan.
          </p>
        </div>

        <div className="bg-[#1a2740] rounded-xl p-4 mb-6 border border-[#1e3a5f]">
          <p className="text-sm text-gray-300 mb-3 font-medium">Upgrade to get:</p>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Unlimited complaint letters
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Unlimited scanner runs
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Email scanner integration
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Subscription management
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/pricing')}
            className="w-full py-3 px-6 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-bold rounded-xl transition-all"
          >
            Upgrade Now — from £4.99/mo
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 px-6 text-gray-400 hover:text-slate-900 transition-colors text-sm"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
