'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { capture } from '@/lib/posthog';

interface Props {
  disputeId: string;
  disputedAmount: number | null;
  onClose: () => void;
  onResolved: () => void;
}

export default function ResolveDisputeModal({ disputeId, disputedAmount, onClose, onResolved }: Props) {
  const [outcome, setOutcome] = useState<string>('won');
  const [moneyRecovered, setMoneyRecovered] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const showMoneyField = outcome === 'won' || outcome === 'partial';

  const outcomeOptions = [
    { value: 'won', label: 'Won', desc: 'Full resolution in your favour', icon: '🏆', className: 'border-green-500/30 bg-green-500/5 text-green-400' },
    { value: 'partial', label: 'Partially Won', desc: 'Some money or partial resolution', icon: '🤝', className: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400' },
    { value: 'lost', label: 'Lost', desc: 'Company rejected your complaint', icon: '😔', className: 'border-slate-500/30 bg-slate-50 text-slate-600' },
    { value: 'withdrawn', label: 'Withdrawn', desc: 'You decided not to pursue this', icon: '🚫', className: 'border-slate-500/30 bg-slate-50 text-slate-600' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          money_recovered: showMoneyField && moneyRecovered ? moneyRecovered : '0',
          outcome_notes: notes || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to resolve');
      capture('dispute_resolved', { outcome, money_recovered: moneyRecovered });
      fetch(`/api/disputes/${disputeId}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outcome,
          source: 'user',
          recovered_amount_gbp: showMoneyField && moneyRecovered ? Number(moneyRecovered) : null,
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
                  onClick={() => setOutcome(opt.value)}
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
                  type="number"
                  step="0.01"
                  min="0"
                  value={moneyRecovered}
                  onChange={(e) => setMoneyRecovered(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 bg-white border border-slate-200/50 rounded-lg text-slate-900 placeholder-slate-500 focus:outline-none focus:border-amber-300 focus:ring-1 focus:ring-amber-400"
                  placeholder={disputedAmount ? disputedAmount.toFixed(2) : '0.00'}
                />
              </div>
              {disputedAmount && disputedAmount > 0 && (
                <button
                  type="button"
                  onClick={() => setMoneyRecovered(disputedAmount.toFixed(2))}
                  className="text-xs text-amber-600/70 hover:text-amber-600 mt-1 transition-colors"
                >
                  Use full disputed amount (£{disputedAmount.toFixed(2)})
                </button>
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
