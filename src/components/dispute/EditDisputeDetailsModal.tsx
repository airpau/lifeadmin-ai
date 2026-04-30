'use client';

/**
 * Modal for editing the core fields on a dispute — provider name,
 * issue type, summary, desired outcome, account / reference number,
 * and disputed amount. Hits PATCH /api/disputes/[id].
 *
 * Used from the dispute detail header so the user can correct an
 * AI guess (e.g. wrong company name, missed amount) or update the
 * facts as the dispute evolves.
 */

import { useState } from 'react';
import { X, Loader2, Save, AlertCircle } from 'lucide-react';

const ISSUE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'complaint', label: 'General complaint' },
  { value: 'energy_dispute', label: 'Energy bill dispute' },
  { value: 'broadband_complaint', label: 'Broadband / mobile complaint' },
  { value: 'flight_compensation', label: 'Flight delay / cancellation' },
  { value: 'parking_appeal', label: 'Parking ticket appeal' },
  { value: 'debt_dispute', label: 'Debt dispute' },
  { value: 'refund_request', label: 'Refund request' },
  { value: 'hmrc_tax_rebate', label: 'HMRC tax issue' },
  { value: 'council_tax_band', label: 'Council tax / business rates' },
  { value: 'dvla_vehicle', label: 'DVLA / vehicle' },
  { value: 'nhs_complaint', label: 'NHS complaint' },
];

interface DisputeFields {
  provider_name?: string;
  issue_type?: string;
  issue_summary?: string;
  desired_outcome?: string | null;
  account_number?: string | null;
  disputed_amount?: number | null;
}

interface Props {
  disputeId: string;
  initial: DisputeFields;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditDisputeDetailsModal({ disputeId, initial, onClose, onSaved }: Props) {
  const [providerName, setProviderName] = useState(initial.provider_name ?? '');
  const [issueType, setIssueType] = useState(initial.issue_type ?? 'complaint');
  const [issueSummary, setIssueSummary] = useState(initial.issue_summary ?? '');
  const [desiredOutcome, setDesiredOutcome] = useState(initial.desired_outcome ?? '');
  const [accountNumber, setAccountNumber] = useState(initial.account_number ?? '');
  const [disputedAmount, setDisputedAmount] = useState(
    initial.disputed_amount != null ? String(initial.disputed_amount) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!providerName.trim()) {
      setError('Provider name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        provider_name: providerName.trim(),
        issue_type: issueType,
        issue_summary: issueSummary.trim(),
        desired_outcome: desiredOutcome.trim() || null,
        account_number: accountNumber.trim() || null,
      };
      // Empty amount = clear it; otherwise parse — guard against
      // letters / whitespace by re-validating before send.
      const amt = disputedAmount.trim();
      if (amt === '') {
        body.disputed_amount = null;
      } else {
        const n = Number(amt);
        if (!Number.isFinite(n) || n < 0) {
          setError('Disputed amount must be a positive number');
          setSaving(false);
          return;
        }
        body.disputed_amount = n;
      }
      const res = await fetch(`/api/disputes/${disputeId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `Save failed (${res.status})`);
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Edit dispute details</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Provider</label>
            <input
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              maxLength={120}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
            >
              {ISSUE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">What's the dispute about?</label>
            <textarea
              value={issueSummary}
              onChange={(e) => setIssueSummary(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Desired outcome</label>
            <textarea
              value={desiredOutcome}
              onChange={(e) => setDesiredOutcome(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Account / reference</label>
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="optional"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Amount in dispute (£)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={disputedAmount}
                onChange={(e) => setDisputedAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-slate-600 hover:text-slate-900 px-3 py-2">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
