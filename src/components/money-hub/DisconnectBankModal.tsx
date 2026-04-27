'use client';

import { useState } from 'react';
import { X, AlertTriangle, Archive, Trash2, Eraser } from 'lucide-react';

export type DisconnectMode = 'keep_history' | 'delete_transactions' | 'erase_all';

interface Props {
  open: boolean;
  bankName: string;
  connectionId: string;
  multiAccount?: boolean;
  onClose: () => void;
  onConfirmed: (mode: DisconnectMode, txAffected: number) => void;
}

/**
 * Disconnect modal — three deliberate choices.
 *
 * Defaults to `keep_history` because it's the safest option and matches
 * the most common user intent ("I closed the card, but I want to keep
 * the spending data"). Destructive options require an extra click.
 *
 * `erase_all` requires the user to type the bank name to confirm —
 * matches GitHub's "type the repo name" pattern, prevents accidental
 * GDPR right-to-erasure invocations.
 */
export default function DisconnectBankModal({
  open,
  bankName,
  connectionId,
  multiAccount,
  onClose,
  onConfirmed,
}: Props) {
  const [mode, setMode] = useState<DisconnectMode>('keep_history');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const eraseConfirmed = mode !== 'erase_all' || confirmText.trim() === bankName;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/bank/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Disconnect failed');
        return;
      }
      onConfirmed(mode, data?.transactionsAffected ?? 0);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disconnect-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
    >
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 id="disconnect-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Disconnecting {bankName}
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {multiAccount && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                This consent covers <strong>multiple accounts</strong> on the same bank — they revoke as a pair. To keep one and remove the other, reconnect the bank afterwards and grant access to only the account you want.
              </div>
            </div>
          )}

          <p className="text-sm text-slate-600 dark:text-slate-400">
            What would you like to do with the transaction history we&apos;ve already synced from this bank?
          </p>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${mode === 'keep_history' ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <input
              type="radio"
              name="disconnect-mode"
              checked={mode === 'keep_history'}
              onChange={() => setMode('keep_history')}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Archive className="h-4 w-4 text-emerald-600" />
                Stop syncing, keep my history
                <span className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Recommended</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                We won&apos;t pull new transactions from this bank, but everything already synced stays in your spending analysis. Best if you closed the card but want to keep the data.
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${mode === 'delete_transactions' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <input
              type="radio"
              name="disconnect-mode"
              checked={mode === 'delete_transactions'}
              onChange={() => setMode('delete_transactions')}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Trash2 className="h-4 w-4 text-amber-600" />
                Stop syncing and delete the transactions
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Removes all transactions from this bank from your dashboard. We keep them in a recoverable bin for <strong>30 days</strong> in case you change your mind, then they&apos;re purged permanently.
              </p>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${mode === 'erase_all' ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <input
              type="radio"
              name="disconnect-mode"
              checked={mode === 'erase_all'}
              onChange={() => setMode('erase_all')}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <Eraser className="h-4 w-4 text-rose-600" />
                Erase everything
                <span className="text-[10px] uppercase tracking-wider bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">Permanent</span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Removes the connection, all transactions, and any alerts derived from them. Used for GDPR data-deletion requests. <strong>Cannot be undone.</strong>
              </p>
              {mode === 'erase_all' && (
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-rose-700 mb-1">
                    Type <code className="bg-white px-1 rounded border border-rose-200">{bankName}</code> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-rose-300 bg-white text-sm focus:outline-none focus:border-rose-500"
                    placeholder={bankName}
                    autoComplete="off"
                  />
                </div>
              )}
            </div>
          </label>

          {error && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !eraseConfirmed}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 ${mode === 'erase_all'
              ? 'bg-rose-600 hover:bg-rose-700'
              : mode === 'delete_transactions'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {submitting ? 'Working…' : mode === 'erase_all' ? 'Erase everything' : mode === 'delete_transactions' ? 'Disconnect & delete' : 'Disconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}
