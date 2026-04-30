'use client';

import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';

/**
 * Consistent lock UI for tier-gated features.
 *
 * Money Hub used to gate paid features with ad-hoc copy ("X is a Pro
 * feature. Upgrade for £9.99/mo.") in a different shape every time.
 * This component centralises:
 *   - the visual treatment (lock icon, dim background, gold accents)
 *   - the data-retention reassurance ("your data is kept; the feature
 *     is just locked")
 *   - the upgrade CTA destination
 *
 * Three sizes:
 *   - 'inline' — small badge inside an otherwise-rendered card
 *   - 'panel'  — full-section overlay; replaces locked content
 *   - 'tile'   — fits inside KPI tiles (small box, two-line copy)
 *
 * Pass `requiredTier` ('essential' | 'pro') so the copy matches the
 * actual paywall: "Upgrade to Essential" vs "Upgrade to Pro".
 */

interface Props {
  feature: string; // human name e.g. "Top merchants", "Net worth tracking"
  requiredTier: 'essential' | 'pro';
  size?: 'inline' | 'panel' | 'tile';
  children?: React.ReactNode; // optional preview content shown faded
  hideUpgradeCta?: boolean; // some places already render their own CTA
}

const TIER_LABEL: Record<'essential' | 'pro', string> = {
  essential: 'Essential',
  pro: 'Pro',
};

const TIER_PRICE: Record<'essential' | 'pro', string> = {
  essential: '£4.99/mo',
  pro: '£9.99/mo',
};

export default function UpgradeLock({
  feature,
  requiredTier,
  size = 'inline',
  children,
  hideUpgradeCta,
}: Props) {
  const tierLabel = TIER_LABEL[requiredTier];
  const tierPrice = TIER_PRICE[requiredTier];

  if (size === 'inline') {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 mt-2">
        <Lock className="h-3.5 w-3.5 text-amber-500" />
        <span>
          {feature} is a {tierLabel} feature.{' '}
          {!hideUpgradeCta && (
            <Link href="/pricing" className="text-emerald-600 hover:text-emerald-500 font-semibold">
              Upgrade for {tierPrice} →
            </Link>
          )}
        </span>
      </div>
    );
  }

  if (size === 'tile') {
    return (
      <div className="card p-5 flex flex-col items-center justify-center text-center min-h-[120px] bg-gradient-to-br from-slate-50 to-amber-50/30 border-amber-200">
        <Lock className="h-5 w-5 text-amber-500 mb-2" />
        <p className="text-xs font-semibold text-slate-700 mb-1">{feature}</p>
        <p className="text-[10px] text-slate-500 mb-2">{tierLabel}-only feature</p>
        {!hideUpgradeCta && (
          <Link
            href="/pricing"
            className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold underline-offset-2 hover:underline"
          >
            Upgrade
          </Link>
        )}
      </div>
    );
  }

  // size === 'panel'
  return (
    <div className="relative rounded-xl overflow-hidden">
      {children && (
        <div className="opacity-30 pointer-events-none select-none" aria-hidden>
          {children}
        </div>
      )}
      <div className={children ? 'absolute inset-0 flex items-center justify-center' : ''}>
        <div className="bg-white border border-amber-200 rounded-xl shadow-sm p-6 text-center max-w-md">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 mb-3">
            <Sparkles className="h-5 w-5 text-amber-600" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">
            {feature} — {tierLabel} feature
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Your account data is kept either way. {tierLabel === 'Pro'
              ? 'Pro unlocks unlimited bank/email connections, the Paybacker Assistant, top merchants, exports, and instant Telegram alerts.'
              : 'Essential unlocks unlimited dispute letters, renewal reminders, AI cancellation emails, and Money Hub budgets + savings goals.'}
          </p>
          {!hideUpgradeCta && (
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Upgrade to {tierLabel} · {tierPrice}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
