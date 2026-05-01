'use client';

/**
 * Dispute Agent recommendation banner.
 *
 * Embeds inside the dispute detail / drawer view. Fetches the latest
 * pending agent decision via /api/disputes/[id]/agent-decisions/latest,
 * lets the user Approve / Override / Snooze, and shows a decision log
 * expander with past actions.
 *
 * Designed as a self-contained client component so it can be dropped
 * into the existing disputes-page monolith without refactoring it.
 */

import { useCallback, useEffect, useState } from 'react';

interface HistoricalSignal {
  merchant_win_rate: number;
  top_legal_basis: string;
  sample_size: number;
}

interface Decision {
  id: number;
  decided_at: string;
  from_state: string | null;
  to_state: string | null;
  recommended_action: string;
  rationale: string;
  data_grounded: boolean;
  historical_signal: HistoricalSignal | null;
  user_action: string | null;
  surfaced_via: string[] | null;
}

interface ApiResponse {
  ok: boolean;
  dispute: {
    id: string;
    provider_name: string | null;
    merchant_normalised: string | null;
    agent_state: string | null;
    agent_paused_until: string | null;
  };
  latest: Decision | null;
  history: Decision[];
}

const ACTION_LABELS: Record<string, string> = {
  send_initial_letter: 'Review and send your letter',
  send_followup: 'Send a followup',
  escalate_ombudsman: 'Escalate to the ombudsman',
  accept_partial: 'Review the partial offer',
  mark_won: 'Confirm the win',
  manual_review: 'Manual review needed',
  send_letter_before_action: 'Send a Letter Before Action',
  small_claims: 'Open a small-claims case',
  wait: 'Wait for the next update',
};

// Order matches the natural escalation ladder so the picker reads top-
// to-bottom in increasing severity. Keep `wait` last as the no-op.
const OVERRIDE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'send_initial_letter', label: 'Review and send your letter' },
  { value: 'send_followup', label: 'Send a followup' },
  { value: 'accept_partial', label: 'Accept the partial offer' },
  { value: 'mark_won', label: 'Mark this dispute as won' },
  { value: 'escalate_ombudsman', label: 'Escalate to the ombudsman' },
  { value: 'send_letter_before_action', label: 'Send a Letter Before Action' },
  { value: 'small_claims', label: 'Open a small-claims case' },
  { value: 'manual_review', label: 'Flag for manual review' },
  { value: 'wait', label: 'Wait for the next update' },
];

export function DisputeAgentBanner({ disputeId }: { disputeId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [overridePickerOpen, setOverridePickerOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/disputes/${disputeId}/agent-decisions/latest`, {
        cache: 'no-store',
      });
      const j = (await res.json()) as ApiResponse | { error: string };
      if (!res.ok || !('ok' in j) || !j.ok) {
        setErr('error' in j ? j.error : 'Could not load agent recommendation');
      } else {
        setData(j);
        setErr(null);
      }
    } catch {
      setErr('Network error');
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: 'approve' | 'override' | 'snooze', overrideAction?: string) {
    if (!data?.latest) return;
    // Override needs an explicit target — without it the engine learns
    // "user disagreed" but not what they wanted, which is most of the
    // signal we care about.
    if (action === 'override' && !overrideAction) {
      setOverridePickerOpen(true);
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { decision_id: data.latest.id, action };
      if (action === 'snooze') {
        body.snooze_until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
      if (action === 'override' && overrideAction) {
        body.override_target_action = overrideAction;
      }
      await fetch(`/api/disputes/${disputeId}/agent-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setOverridePickerOpen(false);
      setOverrideTarget('');
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-400">
        Loading agent recommendation…
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded-lg border border-amber-700 bg-amber-900/20 p-4 text-sm text-amber-300">
        {err}
      </div>
    );
  }
  if (!data) return null;

  const { latest, history, dispute } = data;
  const merchant = dispute.provider_name ?? dispute.merchant_normalised ?? 'this merchant';

  if (!latest) {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
        <div className="font-semibold text-slate-100">Dispute Agent</div>
        <div className="mt-1 text-slate-400">
          No pending recommendation. The agent will check again on its next tick (every 6 hours).
        </div>
        {history.length > 0 && (
          <button
            type="button"
            className="mt-2 text-xs text-amber-300 underline"
            onClick={() => setShowLog((s) => !s)}
          >
            {showLog ? 'Hide' : 'Show'} past decisions ({history.length})
          </button>
        )}
        {showLog && <DecisionLog history={history} />}
      </div>
    );
  }

  const label = ACTION_LABELS[latest.recommended_action] ?? latest.recommended_action;
  const sig = latest.historical_signal;

  return (
    <div className="rounded-lg border border-amber-600/60 bg-amber-900/10 p-4 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-amber-400">Agent recommendation</div>
          <div className="mt-1 text-base font-semibold text-amber-100">{label}</div>
        </div>
        {latest.data_grounded && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
            Data-grounded
          </span>
        )}
      </div>
      <p className="mt-2 text-slate-200">{latest.rationale}</p>
      {sig && (
        <div className="mt-3 rounded-md border border-amber-600/40 bg-slate-900/40 p-3 text-slate-200">
          <div className="text-xs uppercase tracking-wide text-amber-400">Historical signal</div>
          <div className="mt-1">
            <strong>{(sig.merchant_win_rate * 100).toFixed(0)}%</strong> of similar disputes against{' '}
            <strong>{merchant}</strong> were won using <em>{sig.top_legal_basis}</em>{' '}
            <span className="text-slate-400">({sig.sample_size} cases, Paybacker dataset)</span>
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => act('approve')}
          className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOverridePickerOpen((v) => !v)}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          {overridePickerOpen ? 'Cancel override' : 'Override'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act('snooze')}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
        >
          Snooze 7d
        </button>
      </div>
      {overridePickerOpen && (
        <div className="mt-3 rounded-md border border-slate-600 bg-slate-900/60 p-3">
          <div className="text-xs uppercase tracking-wide text-amber-400">
            What would you do instead?
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Tells the agent which action you actually wanted — not just that you disagreed —
            so future recommendations against {merchant} learn from it.
          </p>
          <select
            value={overrideTarget}
            onChange={(e) => setOverrideTarget(e.target.value)}
            disabled={busy}
            className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 disabled:opacity-50"
          >
            <option value="">Pick an action…</option>
            {OVERRIDE_OPTIONS
              .filter((o) => o.value !== latest.recommended_action)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy || !overrideTarget}
              onClick={() => act('override', overrideTarget)}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
            >
              Confirm override
            </button>
          </div>
        </div>
      )}
      {history.length > 1 && (
        <button
          type="button"
          className="mt-3 text-xs text-amber-300 underline"
          onClick={() => setShowLog((s) => !s)}
        >
          {showLog ? 'Hide' : 'Show'} past decisions ({history.length - 1})
        </button>
      )}
      {showLog && <DecisionLog history={history.filter((h) => h.id !== latest.id)} />}
    </div>
  );
}

function DecisionLog({ history }: { history: Decision[] }) {
  if (history.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2 border-t border-slate-700 pt-3 text-xs text-slate-400">
      {history.map((h) => (
        <li key={h.id}>
          <span className="text-slate-500">{new Date(h.decided_at).toLocaleString('en-GB')}</span>{' '}
          <span className="text-slate-300">{h.recommended_action}</span>
          {h.user_action && <span className="ml-1 text-amber-400">({h.user_action})</span>}
          <div className="text-slate-500">{h.rationale}</div>
        </li>
      ))}
    </ul>
  );
}
