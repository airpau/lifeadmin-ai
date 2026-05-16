'use client';

import { useRouter } from 'next/navigation';

interface UpgradeModalProps {
  open: boolean;
  onClose: () => void;
  used: number;
  limit: number;
  tier: string;
}

export default function UpgradeModal({ open, onClose, used, limit }: UpgradeModalProps) {
  const router = useRouter();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0f1629] border border-[#1e3a5f] rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 mb-4">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            You&apos;ve used your {limit || 3} free dispute letters
          </h2>
          <p className="text-gray-400">
            Upgrade to Pro to get unlimited dispute letters, automated follow-ups, and the full Pocket Agent.
          </p>
        </div>

        <div className="bg-[#1a2740] rounded-xl p-4 mb-6 border border-[#1e3a5f]">
          <p className="text-sm text-gray-300 mb-3 font-medium">Upgrade to get:</p>
          <ul className="space-y-2 text-sm text-gray-400">
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span> Unlimited dispute letters
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span> Automated dispute follow-ups
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span> Full Pocket Agent (Telegram + WhatsApp)
            </li>
            <li className="flex items-center gap-2">
              <span className="text-emerald-400">✓</span> Email + bank scan with monthly auto-refresh
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => router.push('/pricing')}
            className="w-full py-3 px-6 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-bold rounded-xl transition-all"
          >
            Upgrade to Pro
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 px-6 text-gray-400 hover:text-white transition-colors text-sm"
          >
            Maybe later
          </button>
        </div>

        {used > 0 && limit > 0 && (
          <p className="text-center text-xs text-gray-500 mt-4">
            {used} / {limit} free letters used
          </p>
        )}
      </div>
    </div>
  );
}
