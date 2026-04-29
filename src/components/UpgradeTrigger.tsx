'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, Sparkles, TrendingUp, Mail, CreditCard, ArrowRight } from 'lucide-react';
import { capture } from '@/lib/posthog';

type TriggerType = 'bank_scan' | 'letter_limit' | 'email_scan' | 'price_increase';

interface UpgradeTriggerProps {
  type: TriggerType;
  // bank_scan
  subscriptionCount?: number;
  monthlyCost?: number;
  // letter_limit
  lettersUsed?: number;
  lettersLimit?: number | null;
  // email_scan
  opportunitiesFound?: number;
  // price_increase
  priceIncreaseCount?: number;
  priceIncreaseAnnual?: number;
  // shared
  userTier?: string;
  className?: string;
}

const STORAGE_KEY = 'pb_dismissed_triggers';

function getDismissed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function markDismissed(type: string) {
  const current = getDismissed();
  current[type] = true;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

export default function UpgradeTrigger({
  type,
  subscriptionCount = 0,
  monthlyCost = 0,
  lettersUsed = 0,
  lettersLimit = null,
  opportunitiesFound = 0,
  priceIncreaseCount = 0,
  priceIncreaseAnnual = 0,
  userTier = 'free',
  className = '',
}: UpgradeTriggerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(!!getDismissed()[type]);
  }, [type]);

  if (!mounted || dismissed) return null;

  // Never show to paid users (or while tier is still loading)
  if (!userTier || userTier === 'essential' || userTier === 'pro') return null;

  // Guard: only show when there's something meaningful to say
  if (type === 'bank_scan' && subscriptionCount === 0) return null;
  if (type === 'letter_limit' && lettersLimit !== null && (lettersLimit - lettersUsed) > 1) return null;
  if (type === 'email_scan' && opportunitiesFound === 0) return null;
  if (type === 'price_increase' && priceIncreaseCount === 0) return null;

  const handleDismiss = () => {
    markDismissed(type);
    setDismissed(true);
    capture('upgrade_trigger_dismissed', { trigger_type: type });
  };

  const handleCtaClick = () => {
    capture('upgrade_trigger_cta_click', { trigger_type: type });
  };

  type ConfigEntry = {
    icon: React.ReactNode;
    gradient: string;
    border: string;
    iconBg: string;
    title: string;
    body: string;
    cta: string;
    ctaClass: string;
  };

  const configs: Record<TriggerType, ConfigEntry> = {
    bank_scan: {
      icon: <CreditCard className="h-5 w-5 text-emerald-400" />,
      gradient: 'from-emerald-500/10 to-emerald-600/5',
      border: 'border-emerald-500/20',
      iconBg: 'bg-emerald-500/10',
      title: `We found ${subscriptionCount} subscription${subscriptionCount !== 1 ? 's' : ''} totalling £${monthlyCost.toFixed(0)}/month`,
      body: 'Upgrade to Essential to track these daily, get renewal reminders, and get alerted to price increases.',
      cta: 'Track daily — from £4.99/mo',
      ctaClass: 'bg-emerald-500 hover:bg-emerald-600 text-white',
    },
    letter_limit: {
      icon: <Sparkles className="h-5 w-5 text-amber-400" />,
      gradient: 'from-amber-500/10 to-amber-600/5',
      border: 'border-amber-500/20',
      iconBg: 'bg-amber-500/10',
      title: lettersLimit !== null && lettersUsed >= lettersLimit
        ? "You've used all your free letters this month"
        : `${lettersLimit !== null ? lettersLimit - lettersUsed : ''} free letter${lettersLimit !== null && lettersLimit - lettersUsed !== 1 ? 's' : ''} remaining this month`,
      body: 'Upgrade to Essential for unlimited complaint letters every month.',
      cta: 'Get unlimited letters — £4.99/mo',
      ctaClass: 'bg-amber-500 hover:bg-amber-600 text-slate-950',
    },
    email_scan: {
      icon: <Mail className="h-5 w-5 text-purple-400" />,
      gradient: 'from-purple-500/10 to-purple-600/5',
      border: 'border-purple-500/20',
      iconBg: 'bg-purple-500/10',
      title: `Your email scan found ${opportunitiesFound} potential saving${opportunitiesFound !== 1 ? 's' : ''}`,
      body: 'Upgrade to Essential to scan your inbox every month automatically.',
      cta: 'Scan monthly — £4.99/mo',
      ctaClass: 'bg-purple-500 hover:bg-purple-600 text-white',
    },
    price_increase: {
      icon: <TrendingUp className="h-5 w-5 text-red-400" />,
      gradient: 'from-red-500/10 to-red-600/5',
      border: 'border-red-500/20',
      iconBg: 'bg-red-500/10',
      title: `${priceIncreaseCount} price increase${priceIncreaseCount !== 1 ? 's' : ''} detected — costing you £${priceIncreaseAnnual.toFixed(0)}/year extra`,
      body: 'Upgrade to get automatic alerts whenever your bills go up so you can act immediately.',
      cta: 'Get price alerts — £4.99/mo',
      ctaClass: 'bg-red-500 hover:bg-red-600 text-white',
    },
  };

  const c = configs[type];

  return (
    <div className={`bg-gradient-to-r ${c.gradient} border ${c.border} rounded-2xl p-5 relative ${className}`}>
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-slate-500 hover:text-white p-1 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 mb-3 pr-8">
        <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${c.iconBg} flex items-center justify-center mt-0.5`}>
          {c.icon}
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-snug">{c.title}</p>
          <p className="text-slate-400 text-xs mt-0.5">{c.body}</p>
        </div>
      </div>

      <Link
        href="/pricing"
        onClick={handleCtaClick}
        className={`inline-flex items-center gap-1.5 ${c.ctaClass} font-semibold text-xs px-4 py-2 rounded-lg transition-all`}
      >
        {c.cta} <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
