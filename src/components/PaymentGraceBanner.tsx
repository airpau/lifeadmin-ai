'use client';

/**
 * Top-of-dashboard banner shown when a user's last payment failed and
 * the 7-day grace timer is running. Links to the billing portal so
 * they can update the card before auto-demotion.
 *
 * The banner reads /api/plan-status which already exposes
 * past_due_grace_ends_at — no extra endpoint needed.
 *
 * Dismissal is intentionally absent. Demotion to Free is happening
 * unless they act, and a session-scoped X would let users hide the
 * single most consequential UX event in the app.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

interface PlanStatus {
  past_due_grace_ends_at: string | null;
  subscription_tier: string | null;
  subscription_status: string | null;
}

function formatDeadline(iso: string): { label: string; daysLeft: number } {
  const target = new Date(iso).getTime();
  const days = Math.max(0, Math.ceil((target - Date.now()) / 86_400_000));
  const label = new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  return { label, daysLeft: days };
}

export default function PaymentGraceBanner() {
  const [status, setStatus] = useState<PlanStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/plan-status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setStatus(d); })
      .catch(() => { /* silent — banner just won't render */ });
    return () => { cancelled = true; };
  }, []);

  if (!status?.past_due_grace_ends_at) return null;
  const tier = status.subscription_tier ?? '';
  if (tier === 'free') return null;

  const { label, daysLeft } = formatDeadline(status.past_due_grace_ends_at);
  const tierLabel = tier === 'pro' ? 'Pro' : tier === 'essential' ? 'Essential' : tier;
  const urgent = daysLeft <= 3;

  const headline = daysLeft === 0
    ? `Your card hasn't gone through — ${tierLabel} access ends today`
    : daysLeft === 1
    ? `Card declined — ${tierLabel} access ends tomorrow`
    : `Card declined — ${tierLabel} access ends in ${daysLeft} days (${label})`;

  return (
    <div className={urgent ? 'bg-red-50 border-b border-red-200' : 'bg-amber-50 border-b border-amber-200'}>
      <div className="max-w-7xl mx-auto flex items-start gap-3 px-4 py-3">
        <AlertTriangle className={urgent ? 'h-5 w-5 text-red-600 flex-shrink-0 mt-0.5' : 'h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5'} />
        <div className="flex-1 min-w-0">
          <p className={urgent ? 'text-sm font-semibold text-red-900' : 'text-sm font-semibold text-amber-900'}>
            {headline}
          </p>
          <p className={urgent ? 'text-xs text-red-700 mt-0.5' : 'text-xs text-amber-700 mt-0.5'}>
            We'll keep retrying your card automatically. If it still hasn't gone through by then, your account will switch to Free. Your data stays — extra connections are archived, not deleted.
          </p>
          <div className="mt-2">
            <Link
              href="/dashboard/profile?section=subscription"
              className={urgent
                ? 'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors'
                : 'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white transition-colors'
              }
            >
              Update card now
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
