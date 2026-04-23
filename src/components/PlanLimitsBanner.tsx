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

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-900 mb-1">You\'re over your plan limits</p>
        <p className="text-sm text-amber-800">
          {reasons.join(' · ')}. Everything still works — nothing has been removed. Upgrade to keep it all, or disconnect the ones you no longer need.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
          >
            <Sparkles className="h-3.5 w-3.5" /> View plans
          </Link>
          <Link href="/dashboard/profile" className="text-xs font-medium text-amber-800 hover:text-amber-900 underline">
            Manage connections
          </Link>
        </div>
      </div>
      <button onClick={() => setDismissed(true)} className="text-amber-600 hover:text-amber-900" title="Dismiss">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
