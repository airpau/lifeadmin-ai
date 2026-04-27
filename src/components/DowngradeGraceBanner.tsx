'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Renders during an active plan_downgrade_events grace period.
 *
 * The downgrade flow is webhook-driven: when Stripe fires
 * customer.subscription.deleted, plan-downgrade.openDowngradeEvent()
 * snapshots how far over the new tier's caps the user is and starts a
 * 14-day clock. After the clock runs out the cron auto-archives the
 * over-cap connections (transactions retained — sync just stops).
 *
 * This banner makes the clock visible so the user can either:
 *   - upgrade back to the previous tier and avoid auto-archive, or
 *   - prune their own connections to fall back within the new caps.
 *
 * Hidden when no active event exists (every other user-state).
 */

interface GracePeriod {
  fromTier: 'essential' | 'pro';
  toTier: 'free' | 'essential';
  graceEndsAt: string;
  daysRemaining: number;
}

export default function DowngradeGraceBanner() {
  const [grace, setGrace] = useState<GracePeriod | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/plan-status', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setGrace(data?.gracePeriod ?? null);
      } catch {
        // Non-critical — banner just stays hidden if the call fails.
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!grace || dismissed) return null;

  const urgent = grace.daysRemaining <= 3;
  const dateLabel = new Date(grace.graceEndsAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
  });

  return (
    <div
      className={`rounded-xl px-4 py-3 mb-3 flex items-start gap-3 ${urgent
        ? 'bg-rose-50 border border-rose-200 text-rose-900'
        : 'bg-amber-50 border border-amber-200 text-amber-900'
      }`}
    >
      <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${urgent ? 'text-rose-600' : 'text-amber-600'}`} />
      <div className="flex-1 text-sm">
        <p className="font-semibold mb-0.5">
          Your plan changed to <span className="capitalize">{grace.toTier}</span>{' '}
          — {grace.daysRemaining > 0 ? `${grace.daysRemaining} day${grace.daysRemaining === 1 ? '' : 's'} left` : 'grace period ending today'} to act
        </p>
        <p className="text-xs opacity-90">
          We&apos;ll keep your <strong>oldest-connected</strong> banks/emails active and pause sync on the rest after <strong>{dateLabel}</strong>. Transaction history is preserved either way — only sync pauses. Upgrade back to {grace.fromTier} to keep everything live, or pick which connections to keep manually.
        </p>
        <div className="flex items-center gap-3 mt-2">
          <Link
            href="/pricing"
            className={`text-xs font-bold px-3 py-1.5 rounded-lg ${urgent ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'} text-white`}
          >
            Upgrade to {grace.fromTier}
          </Link>
          <Link
            href="/dashboard/profile"
            className="text-xs font-semibold underline-offset-2 hover:underline"
          >
            Manage connections
          </Link>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className={`text-xs flex-shrink-0 ${urgent ? 'text-rose-700 hover:text-rose-900' : 'text-amber-700 hover:text-amber-900'}`}
        aria-label="Hide banner"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
