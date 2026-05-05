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
import { Sparkles, Info, ChevronDown, Check, Hand, Clock, ShieldCheck } from 'lucide-react';

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
  wait: 'Wait — nothing to do right now',
};

const USER_ACTION_LABELS: Record<string, string> = {
  approved: 'You approved',
  overridden: 'You overrode',
  snoozed: 'You snoozed',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function DisputeAgentBanner({ disputeId }: { disputeId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showWhat, setShowWhat] = useState(false);
  const [autoTriggered, setAutoTriggered] = useState(false);

  const load = useCallback(async (isInitialLoad = false) => {
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

        // Auto-trigger logic: if we are viewing the page and the agent's scheduled 
        // next action time is in the past, the cron hasn't gotten to it yet. 
        // Run it immediately so the user doesn't see stale data.
        if (isInitialLoad && !autoTriggered) {
          const isStale = j.dispute.next_agent_action_at 
            ? new Date(j.dispute.next_agent_action_at) <= new Date()
            : true; // If null, never run before
          
          const hasPendingAction = j.latest && !j.latest.user_action && j.latest.recommended_action !== 'wait';
          
          if (isStale && !hasPendingAction) {
            setAutoTriggered(true);
            setBusy(true);
            try {
              await fetch(`/api/disputes/${disputeId}/trigger-agent`, { method: 'POST' });
              // Fetch fresh data after auto-trigger
              const freshRes = await fetch(`/api/disputes/${disputeId}/agent-decisions/latest`, { cache: 'no-store' });
              const freshJ = (await freshRes.json()) as ApiResponse;
              if (freshRes.ok && 'ok' in freshJ && freshJ.ok) {
                setData(freshJ);
              }
            } finally {
              setBusy(false);
            }
          }
        }
      }
    } catch {
      setErr('Network error');
    } finally {
      setLoading(false);
    }
  }, [disputeId, autoTriggered]);

  useEffect(() => {
    void load(true);
  }, [load]);

  async function act(action: 'approve' | 'override' | 'snooze') {
    if (!data?.latest) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { decision_id: data.latest.id, action };
      if (action === 'snooze') {
        body.snooze_until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
      await fetch(`/api/disputes/${disputeId}/agent-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await load(false);
    } finally {
      setBusy(false);
    }
  }

  async function triggerAgent() {
    setBusy(true);
    try {
      await fetch(`/api/disputes/${disputeId}/trigger-agent`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-700 mb-4">
        Loading Dispute Agent…
      </div>
    );
  }
  if (err) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-4">
        {err}
      </div>
    );
  }
  if (!data) return null;

  const { latest, history, dispute } = data;
  const merchant = dispute.provider_name ?? dispute.merchant_normalised ?? 'this merchant';

  // Wait recommendations that the user has already approved (or that have no
  // pending action) shouldn't shout for attention — they're "all caught up".
  const isWaitingQuiet = latest && latest.recommended_action === 'wait' && !!latest.user_action;
  const showActionable = latest && !isWaitingQuiet;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-5 mb-4 shadow-sm">
      <Header showWhat={showWhat} setShowWhat={setShowWhat} />

      {showWhat && <WhatExplainer />}

      {showActionable && latest && (
        <ActionableCard
          latest={latest}
          merchant={merchant}
          busy={busy}
          onAct={act}
        />
      )}

      {!showActionable && (
        <CaughtUpCard latest={latest} busy={busy} onTrigger={triggerAgent} />
      )}

      {history.length > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3">
          <button
            type="button"
            className="text-xs font-medium text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
            onClick={() => setShowLog((s) => !s)}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showLog ? 'rotate-180' : ''}`} />
            {showLog ? 'Hide' : 'Show'} past decisions ({history.length})
          </button>
          {showLog && <DecisionLog history={history} />}
        </div>
      )}
    </div>
  );
}

function Header({ showWhat, setShowWhat }: { showWhat: boolean; setShowWhat: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Dispute Agent</h3>
          <p className="text-xs text-slate-500">Your AI caseworker for this dispute</p>
        </div>
      </div>
      <button
        type="button"
        className="text-xs text-slate-500 hover:text-emerald-700 inline-flex items-center gap-1"
        onClick={() => setShowWhat(!showWhat)}
      >
        <Info className="h-3 w-3" />
        {showWhat ? 'Hide' : 'What is this?'}
      </button>
    </div>
  );
}

function WhatExplainer() {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 mb-3 text-xs text-slate-700 leading-relaxed">
      <p className="font-semibold text-slate-900 mb-1">What does the Dispute Agent do?</p>
      <p className="mb-2">
        Every 6 hours it reviews this dispute — your letters, any replies, deadlines,
        and how similar disputes have been won by other Paybacker users — and decides
        what to do next.
      </p>
      <ul className="space-y-1 list-disc pl-4">
        <li>If it&apos;s time to act, it surfaces a recommendation here for you to approve, override or snooze.</li>
        <li>If the supplier is still inside their reply window, it waits and checks again later.</li>
        <li>It never auto-sends letters or contacts the supplier. You stay in control.</li>
      </ul>
    </div>
  );
}

function ActionableCard({
  latest,
  merchant,
  busy,
  onAct,
}: {
  latest: Decision;
  merchant: string;
  busy: boolean;
  onAct: (a: 'approve' | 'override' | 'snooze') => void;
}) {
  const label = ACTION_LABELS[latest.recommended_action] ?? latest.recommended_action;
  const sig = latest.historical_signal;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">
            Recommended next step
          </div>
          <div className="mt-0.5 text-base font-semibold text-slate-900">{label}</div>
        </div>
        {latest.data_grounded && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold"
            title="Backed by Paybacker's dispute outcome dataset"
          >
            <ShieldCheck className="h-3 w-3" /> Data-grounded
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-800 leading-relaxed">{latest.rationale}</p>

      {sig && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3 text-xs text-slate-700">
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1">
            What works against {merchant}
          </div>
          <div>
            <strong>{(sig.merchant_win_rate * 100).toFixed(0)}%</strong> of Paybacker users won their{' '}
            {merchant} dispute by citing <em>{sig.top_legal_basis}</em>{' '}
            <span className="text-slate-500">({sig.sample_size} similar cases)</span>.
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAct('approve')}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAct('override')}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-sm text-slate-800 disabled:opacity-50"
        >
          <Hand className="h-3.5 w-3.5" />
          I&apos;ll do something else
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAct('snooze')}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 px-3 py-1.5 text-sm text-slate-800 disabled:opacity-50"
        >
          <Clock className="h-3.5 w-3.5" />
          Snooze 7 days
        </button>
      </div>
    </div>
  );
}

function CaughtUpCard({ latest, busy, onTrigger }: { latest: Decision | null, busy: boolean, onTrigger: () => void }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
      <div className="flex items-start gap-2 justify-between">
        <div className="flex items-start gap-2">
          <Check className="h-4 w-4 text-emerald-700 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-emerald-900">All caught up — no action needed</div>
            <p className="mt-1 text-slate-700 text-xs leading-relaxed">
              {latest
                ? `The agent reviewed this dispute on ${formatDate(latest.decided_at)} and decided to wait. ${latest.rationale}`
                : 'The agent will review this dispute again at the next 6-hour check. We’ll surface a recommendation if anything changes.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onTrigger}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white hover:bg-emerald-100 px-3 py-1.5 text-xs text-emerald-800 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {busy ? 'Reviewing...' : 'Review Now'}
        </button>
      </div>
    </div>
  );
}

function DecisionLog({ history }: { history: Decision[] }) {
  if (history.length === 0) return null;
  return (
    <ul className="mt-3 space-y-3">
      {history.map((h) => {
        const label = ACTION_LABELS[h.recommended_action] ?? h.recommended_action;
        const userActionLabel = h.user_action ? USER_ACTION_LABELS[h.user_action] ?? h.user_action : null;
        return (
          <li key={h.id} className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <div className="text-slate-500">{formatDate(h.decided_at)}</div>
                <div className="font-semibold text-slate-900 mt-0.5">{label}</div>
              </div>
              {userActionLabel && (
                <span className="inline-block rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                  {userActionLabel}
                </span>
              )}
            </div>
            <p className="text-slate-600 leading-relaxed">{h.rationale}</p>
          </li>
        );
      })}
    </ul>
  );
}
