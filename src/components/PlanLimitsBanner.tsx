'use client';

/**
 * Over-limit warning banner.
 *
 * Polls /api/plan-status on mount. If any dimension (banks, emails,
 * spaces) is over the current tier's cap — typically because the
 * user downgraded — we show an amber banner listing exactly what's
 * over and a deep link to /pricing.
 *
 * This is advisory only. Existing bank/email/Space records keep
 * working. Enforcement happens at the connect / create endpoints,
 * not via data removal. A future "soft-archive after grace period"
 * flow can hang off the same data.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X, Sparkles } from 'lucide-react';

interface PlanStatus {
  tier: 'free' | 'essential' | 'pro';
  limits: { maxBanks: number | null; maxEmails: number | null; maxSpaces: number | null };
  usage: { banks: number; emails: number; spaces: number };
  overLimit: { banks: boolean; emails: boolean; spaces: boolean };
  gracePeriod: {
    fromTier: string;
    toTier: string;
    graceEndsAt: string;
    daysRemaining: number;
  } | null;
}

export default function PlanLimitsBanner() {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/plan-status', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (alive && !d.error) setStatus(d); })
      .catch(() => { /* silent */ });
    return () => { alive = false; };
  }, []);

  if (!status || dismissed) return null;
  const { banks, emails, spaces } = status.overLimit;
  if (!banks && !emails && !spaces) return null;

  const reasons: string[] = [];
  if (banks)  reasons.push(`${status.usage.banks} bank connections (${status.tier} tier allows ${status.limits.maxBanks})`);
  if (emails) reasons.push(`${status.usage.emails} email connections (${status.tier} tier allows ${status.limits.maxEmails})`);
  if (spaces) reasons.push(`${status.usage.spaces} Spaces (${status.tier} tier allows ${status.limits.maxSpaces})`);

  const grace = status.gracePeriod;
  const urgent = grace !== null && grace.daysRemaining <= 3;
  const toneCls = urgent
    ? 'bg-red-50 border-red-300'
    : 'bg-amber-50 border-amber-300';
  const iconCls = urgent ? 'text-red-600' : 'text-amber-600';
  const headerCls = urgent ? 'text-red-900' : 'text-amber-900';
  const bodyCls = urgent ? 'text-red-800' : 'text-amber-800';
  const buttonCls = urgent ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700';

  const headline = grace
    ? (grace.daysRemaining > 0
        ? `${grace.daysRemaining} day${grace.daysRemaining === 1 ? '' : 's'} until extras auto-archive`
        : `Your grace period ended — extras will be archived on the next daily pass`)
    : 'You\'re over your plan limits';

  const deadlineLine = grace
    ? `After ${new Date(grace.graceEndsAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, the oldest accounts stay active and the rest are archived (transactions preserved — sync paused). Upgrade to keep them all, or pick which to keep yourself.`
    : 'Everything still works — nothing has been removed. Upgrade to keep it all, or disconnect the ones you no longer need.';

  return (
    <div className={`${toneCls} border rounded-xl p-4 mb-6 flex items-start gap-3`}>
      <AlertTriangle className={`h-5 w-5 ${iconCls} flex-shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${headerCls} mb-1`}>{headline}</p>
        <p className={`text-sm ${bodyCls}`}>
          {reasons.join(' · ')}. {deadlineLine}
        </p>
        <div className="flex items-center gap-3 mt-3">
          <Link
            href="/pricing"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${buttonCls} text-white text-xs font-semibold`}
          >
            <Sparkles className="h-3.5 w-3.5" /> View plans
          </Link>
          <Link href="/dashboard/profile" className={`text-xs font-medium ${bodyCls} hover:opacity-80 underline`}>
            Manage connections
          </Link>
        </div>
      </div>
      <button onClick={() => setDismissed(true)} className={iconCls} title="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
