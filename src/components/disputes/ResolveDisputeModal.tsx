'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { capture } from '@/lib/posthog';

interface Props {
  disputeId: string;
  disputedAmount: number | null;
  /** Provider name of the dispute being resolved — used for the
   *  duplicate-win check. Falls back to the fetched dispute list. */
  providerName?: string | null;
  onClose: () => void;
  onResolved: () => void;
}

interface DisputeListRow {
  id: string;
  provider_name: string | null;
  status: string | null;
  outcome: string | null;
  money_recovered: number | string | null;
}

export default function ResolveDisputeModal({ disputeId, disputedAmount, providerName, onClose, onResolved }: Props) {
  const hasDisputedAmount = typeof disputedAmount === 'number' && disputedAmount > 0;
  const [outcome, setOutcome] = useState<string>('won');
  // Prefill with the disputed amount for the default 'won' outcome so a
  // blank submit records the full amount, not a silent £0. The user can
  // still edit it, including down to 0 (that path asks for confirmation).
  const [moneyRecovered, setMoneyRecovered] = useState(
    hasDisputedAmount ? disputedAmount.toFixed(2) : '',
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmZero, setConfirmZero] = useState(false);
  const [otherDisputes, setOtherDisputes] = useState<DisputeListRow[]>([]);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const showMoneyField = outcome === 'won' || outcome === 'partial';

  // Duplicate-win guard (2026-08-20): the same £4,990.21 E.ON win was once
  // recorded on two dispute records and silently double-counted. Load the
  // user's disputes once when the modal opens so we can warn (without
  // blocking) when a matching win already exists. Best-effort — any fetch
  // failure just means no warning.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/disputes')
      .then((res) => (res.ok ? res.json() : []))
      .then((rows) => {
        if (!cancelled && Array.isArray(rows)) setOtherDisputes(rows as DisputeListRow[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const duplicateWin = useMemo(() => {
    if (!showMoneyField) return null;
    const currentProvider = (
      providerName ??
      otherDisputes.find((d) => d.id === disputeId)?.provider_name ??
      ''
    ).trim();
    if (!currentProvider) return null;

    const entered = Number(moneyRecovered);
    const candidateAmounts = [
      Number.isFinite(entered) && entered > 0 ? entered : null,
      hasDisputedAmount ? disputedAmount : null,
    ].filter((n): n is number => typeof n === 'number');
    if (candidateAmounts.length === 0) return null;

    const isResolvedWin = (d: DisputeListRow) =>
      d.status === 'resolved_won' ||
      d.status === 'resolved_partial' ||
      d.outcome === 'won' ||
      d.outcome === 'partial';

    for (const d of otherDisputes) {
      if (d.id === disputeId) continue;
      if ((d.provider_name ?? '').trim().toLowerCase() !== currentProvider.toLowerCase()) continue;
      if (!isResolvedWin(d)) continue;
      const recovered = Number(d.money_recovered);
      if (!Number.isFinite(recovered) || recovered <= 0) continue;
      if (candidateAmounts.some((a) => Math.abs(a - recovered) < 0.005)) {
        return { provider: (d.provider_name ?? currentProvider).trim(), amount: recovered };
      }
    }
    return null;
  }, [showMoneyField, providerName, otherDisputes, disputeId, moneyRecovered, hasDisputedAmount, disputedAmount]);

  const handleOutcomeChange = (value: string) => {
    setOutcome(value);
    setConfirmZero(false);
    // When switching to a winning outcome with an empty amount field,
    // prefill it with the disputed amount so £0 is never saved by accident.
    if ((value === 'won' || value === 'partial') && hasDisputedAmount && moneyRecovered.trim() === '') {
      setMoneyRecovered(disputedAmount.toFixed(2));
    }
  };

  const outcomeOptions = [
    { value: 'won', label: 'Won', desc: 'Full resolution in your favour', icon: '🏆', className: 'border-green-500/30 bg-green-500/5 text-green-400' },
    { value: 'partial', label: 'Partially Won', desc: 'Some money or partial resolution', icon: '🤝', className: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' },
    { value: 'lost', label: 'Lost', desc: 'Company rejected your complaint', icon: '😔', className: 'border-slate-500/30 bg-slate-50 text-slate-600' },
    { value: 'withdrawn', label: 'Withdrawn', desc: 'You decided not to pursue this', icon: '🚫', className: 'border-slate-500/30 bg-slate-50 text-slate-600' },
  ];

  const submitOutcome = async (recoveredAmount: number) => {
    setSaving(true);
    try {
      // PATCH and POST /outcome must send the same number so the two
      // write paths never disagree about what was recovered.
      const res = await fetch(`/api/disputes/${disputeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          money_recovered: recoveredAmount.toFixed(2),
          outcome_notes: notes || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to resolve');
      capture('dispute_resolved', { outcome, money_recovered: recoveredAmount });
      fetch(`/api/disputes/${disputeId}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          source: 'user',
          recovered_amount_gbp: showMoneyField ? recoveredAmount : null,
          notes: notes || null,
        }),
      }).catch(() => {});
      onResolved();
      onClose();
    } catch {
      alert('Failed to resolve dispute. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const parsed = Number(moneyRecovered);
    const recoveredAmount = showMoneyField && Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

    // Winning outcome with an empty or zero amount: ask before recording
    // £0 instead of silently saving it.
    if (showMoneyField && recoveredAmount === 0 && !confirmZero) {
      setConfirmZero(true);
      return;
    }

    await submitOutcome(recoveredAmount);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-200/50">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Resolve Dispute</h2>
            <p className="text-slate-500 text-sm mt-0.5">Record the outcome of your dispute</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-600 hover:text-slate-900 inline-flex items-center justify-center h-11 w-11 shrink-0 rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">What was the outcome?</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {outcomeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleOutcomeChange(opt.value)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-left transition-all border ${
                    outcome === opt.value
                      ? opt.className
                      : 'bg-white border-slate-200/50 text-slate-600 hover:border-slate-200'
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  <div>
                    <p className={`font-medium ${outcome === opt.value ? '' : 'text-slate-600'}`}>{opt.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {showMoneyField && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                How much did you recover?
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-600 font-semibold">£</span>
                <input
                  ref={amountInputRef}
                  type="number"
                  step="0.01"
                  min="0"
                  value={moneyRecovered}
                  onChange={(e) => {
                    setMoneyRecovered(e.target.value);
                    setConfirmZero(false);
                  }}
                  className="w-full pl-8 pr-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-amber-300 focus:ring-1 focus:ring-amber-400"
                  placeholder={hasDisputedAmount ? disputedAmount.toFixed(2) : '0.00'}
                />
              </div>
              {hasDisputedAmount && (
                <button
                  type="button"
                  onClick={() => {
                    setMoneyRecovered(disputedAmount.toFixed(2));
                    setConfirmZero(false);
                  }}
                  className="text-xs text-amber-600/70 hover:text-amber-600 mt-1 transition-colors"
                >
                  Use full disputed amount (£{disputedAmount.toFixed(2)})
                </button>
              )}
              {duplicateWin && (
                <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                  <p className="text-sm text-amber-700">
                    You already recorded a £{duplicateWin.amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} win
                    against {duplicateWin.provider}. If this is the same money, set this one to £0 so your totals stay honest.
                  </p>
                </div>
              )}
              {confirmZero && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                  <p className="text-sm text-amber-700 flex-1 min-w-[12rem]">
                    You are recording £0 recovered for a win. Is that right?
                  </p>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-slate-900 transition-colors disabled:opacity-50"
                  >
                    Yes, £0
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmZero(false);
                      amountInputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Go back
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">
              Notes <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              placeholder="Any notes about the resolution..."
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-amber-500 hover:bg-orange-600 text-slate-900 font-semibold py-3 rounded-lg transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Resolve Dispute'}
          </button>
        </form>
      </div>
    </div>
  );
}
