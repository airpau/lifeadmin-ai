'use client';

import { useState } from 'react';
import { X, Archive, Trash2, Eraser } from 'lucide-react';

export type DisconnectMode = 'keep_history' | 'delete_transactions' | 'erase_all';

export interface DisconnectModalAccount {
  /** Provider account_id (matches bank_transactions.account_id). */
  id: string;
  /** User-facing display name (e.g. "PREMIER REWARD BLACK"). */
  name: string;
}

interface Props {
  open: boolean;
  bankName: string;
  connectionId: string;
  /** Optional: when this consent contains multiple accounts, pass them
   *  here so the user can pick one to disconnect instead of dropping
   *  the whole consent. Empty / single-element arrays render the
   *  classic "all accounts" flow. */
  accounts?: DisconnectModalAccount[];
  onClose: () => void;
  onConfirmed: (mode: DisconnectMode, txAffected: number, accountId: string | null) => void;
}

/**
 * Disconnect modal — three deliberate choices, with optional per-account scoping.
 *
 * Scope picker (top of modal):
 *   When `accounts.length > 1`, the user picks ONE account or
 *   "All accounts" before the mode selection. Selecting a single
 *   account narrows the disconnect: only that account's transactions
 *   are touched, and only that account is removed from the consent.
 *   The connection row stays active for the remaining accounts.
 *
 * Mode picker:
 *   - keep_history: revoke + keep transactions visible.
 *   - delete_transactions: revoke + soft-delete (30-day recovery).
 *   - erase_all: hard-delete, GDPR-style, requires typing the bank name.
 *
 * The default is "All accounts" + keep_history because that's the
 * safest pair. erase_all requires the user to type the bank name to
 * confirm — matches GitHub's "type the repo name" pattern, prevents
 * accidental GDPR right-to-erasure invocations.
 */
export default function DisconnectBankModal({
  open,
  bankName,
  connectionId,
  accounts,
  onClose,
  onConfirmed,
}: Props) {
  const accountList = accounts ?? [];
  const isMultiAccount = accountList.length > 1;

  // accountScope is either a specific provider account_id, or null
  // meaning "apply to all accounts on this consent".
  const [accountScope, setAccountScope] = useState<string | null>(null);
  const [mode, setMode] = useState<DisconnectMode>('keep_history');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const scopedAccount = accountScope ? accountList.find((a) => a.id === accountScope) : null;
  const scopeLabel = scopedAccount ? scopedAccount.name : `${bankName} (all accounts)`;
  const eraseConfirmed = mode !== 'erase_all' || confirmText.trim() === bankName;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/bank/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId,
          mode,
          accountId: accountScope ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Disconnect failed');
        return;
      }
      onConfirmed(mode, data?.transactionsAffected ?? 0, accountScope);
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
            Disconnecting {scopeLabel}
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
          {isMultiAccount && (
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Apply to
              </div>
              <div className="grid gap-1.5">
                <label className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded cursor-pointer ${accountScope === null ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-white border border-transparent'}`}>
                  <input
                    type="radio"
                    name="account-scope"
                    checked={accountScope === null}
                    onChange={() => setAccountScope(null)}
                  />
                  <span className="font-medium text-slate-900">All accounts</span>
                  <span className="text-xs text-slate-500">({accountList.length} on this consent)</span>
                </label>
                {accountList.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded cursor-pointer ${accountScope === a.id ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-white border border-transparent'}`}
                  >
                    <input
                      type="radio"
                      name="account-scope"
                      checked={accountScope === a.id}
                      onChange={() => setAccountScope(a.id)}
                    />
                    <span className="text-slate-800">{a.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Picking one account leaves the others connected and syncing as normal.
              </p>
            </div>
          )}

          <p className="text-sm text-slate-600 dark:text-slate-400">
            What would you like to do with the transaction history we&apos;ve already synced from {scopedAccount ? <strong>{scopedAccount.name}</strong> : <strong>{bankName}</strong>}?
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
