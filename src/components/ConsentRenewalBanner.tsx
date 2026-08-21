'use client';

import { useState } from 'react';
import { AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

interface ConsentRenewalBannerProps {
  connectionId: string;
  bankName: string;
  daysLeft: number;
  onRenew?: () => void;
}

export default function ConsentRenewalBanner({
  connectionId,
  bankName,
  daysLeft,
  onRenew,
}: ConsentRenewalBannerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // Explicit reconfirmation (FCA PS21/19). The server rejects the call
  // unless confirmed:true, so this checkbox is the compliance control,
  // not decoration — don't default it to true or auto-tick it.
  const [confirmed, setConfirmed] = useState(false);

  async function handleRenew() {
    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('/api/bank/renew-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, confirmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        setErrorMessage(data.error || 'Failed to renew consent');
        return;
      }

      setStatus('success');
      onRenew?.();
    } catch {
      setStatus('error');
      setErrorMessage('Network error. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
        <p className="text-sm text-emerald-200">
          Your {bankName} connection has been renewed successfully.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-[#0f172a] px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3">
      <div className="flex items-start gap-3 flex-1">
        <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-slate-700">
            Your <span className="font-medium text-slate-900">{bankName}</span> connection
            {daysLeft > 0
              ? ` expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
              : ' has expired'}
            . UK rules mean we have to ask you to confirm every 90 days.
          </p>

          {/* The explicit consent control. Deliberately a real
              checkbox with its own label rather than fine print under
              the button: the user has to affirmatively agree, and we
              have to be able to show that they did. */}
          <label className="mt-2 flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                setConfirmed(e.target.checked);
                if (status === 'error') setStatus('idle');
              }}
              disabled={status === 'loading'}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-400 accent-amber-500"
            />
            <span className="text-xs text-slate-600">
              I confirm I still want Paybacker to access my{' '}
              <span className="font-medium text-slate-800">{bankName}</span> account
              information. No bank login needed.
            </span>
          </label>

          {status === 'error' && errorMessage && (
            <p className="text-xs text-red-400 mt-1">{errorMessage}</p>
          )}
        </div>
      </div>

      <button
        onClick={handleRenew}
        disabled={status === 'loading' || !confirmed}
        title={!confirmed ? 'Tick the confirmation box first' : undefined}
        className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 transition-colors hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
      >
        <RefreshCw
          className={`h-4 w-4 ${status === 'loading' ? 'animate-spin' : ''}`}
        />
        {status === 'loading' ? 'Confirming...' : 'Confirm access'}
      </button>
    </div>
  );
}
