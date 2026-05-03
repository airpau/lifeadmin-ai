'use client';

/**
 * Compliance Centre — Phase 1 of "actionable queue" UX.
 *
 * Reusable inline panel that shows BEFORE → PROPOSED diff for a pending
 * correction, surfaces the AI's reasoning, the optional founder
 * `action_instructions` (Phase 3 stuck-item flow, written by
 * recover-url-dead when Perplexity gives up), and one-click
 * Approve / Reject / Mark-duplicate buttons that hit
 * `/api/admin/legal-ref-corrections/{id}/decision`.
 *
 * Used in three places:
 *   1. PendingCorrectionsSection rows (replaces the previous inline
 *      JSX so the section keeps its existing layout but shares a
 *      single source of truth for the diff card).
 *   2. Inline expansion under each affected row in the page-level
 *      Review queue (so the founder doesn't have to scroll to the
 *      Pending section to see the AI proposal for a `url_dead` /
 *      `auto_corrected` row).
 *   3. The "What needs your attention" panel previews.
 */

import { useState } from 'react';
import {
  ExternalLink,
  Check,
  X,
  Copy,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';

export interface InlineCorrection {
  id: string;
  ref_id: string;
  proposer: string;
  proposed_at: string;
  before_law_name: string | null;
  before_source_url: string | null;
  before_status: string | null;
  proposed_law_name: string | null;
  proposed_source_url: string | null;
  proposed_status: string | null;
  superseded_by: string | null;
  reasoning: string | null;
  confidence: 'high' | 'medium' | 'low';
  cost_gbp: number | null;
  status: string;
  action_instructions?: string | null;
  enrichment_data?: { risk_score?: 'low' | 'medium' | 'high' | null } | null;
  enriched_at?: string | null;
}

const CONFIDENCE_CLASS: Record<string, string> = {
  high: 'bg-green-100 text-green-700 border-green-300',
  medium: 'bg-amber-100 text-amber-700 border-amber-300',
  low: 'bg-red-100 text-red-700 border-red-300',
};

interface Props {
  correction: InlineCorrection;
  /** Called after a decision succeeds so caller can refresh state. */
  onResolve?: (id: string, action: 'approve' | 'reject' | 'mark_duplicate') => void | Promise<void>;
  /** When true, renders compact (no proposer line, smaller padding). For attention panel previews. */
  compact?: boolean;
  /** Show the Mark-duplicate button. Defaults true. */
  allowDuplicate?: boolean;
}

export default function InlineCorrectionPanel({
  correction: c,
  onResolve,
  compact = false,
  allowDuplicate = true,
}: Props) {
  const [busy, setBusy] = useState<null | 'approve' | 'reject' | 'mark_duplicate'>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  const reasoningShort = (c.reasoning ?? '').slice(0, 250);
  const reasoningHasMore = (c.reasoning ?? '').length > 250;

  const lawNameChanged = c.proposed_law_name && c.proposed_law_name !== c.before_law_name;
  const urlChanged = c.proposed_source_url && c.proposed_source_url !== c.before_source_url;

  const decide = async (action: 'approve' | 'reject' | 'mark_duplicate') => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/legal-ref-corrections/${c.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (onResolve) await onResolve(c.id, action);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={compact ? '' : 'space-y-3'}>
      {!compact && (
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs text-slate-500">
            proposed by {c.proposer} · {new Date(c.proposed_at).toLocaleString('en-GB')}
            {c.cost_gbp != null && ` · £${c.cost_gbp.toFixed(4)}`}
          </div>
          <span
            className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full border ${CONFIDENCE_CLASS[c.confidence]}`}
          >
            {c.confidence}
          </span>
        </div>
      )}

      {c.action_instructions && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-800">
              Action required
            </p>
            <p className="text-sm text-amber-900 mt-0.5">{c.action_instructions}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Before
          </p>
          <p className="text-slate-800 break-words">{c.before_law_name ?? '—'}</p>
          {c.before_source_url ? (
            <a
              href={c.before_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 text-xs mt-1 break-all underline decoration-dotted hover:text-slate-700 inline-block"
            >
              {c.before_source_url}
            </a>
          ) : (
            <p className="text-slate-500 text-xs mt-1 break-all">—</p>
          )}
          {c.before_status && (
            <p className="text-slate-500 text-xs mt-1">status: {c.before_status}</p>
          )}
        </div>
        <div
          className={`border rounded-lg p-3 ${
            lawNameChanged || urlChanged
              ? 'bg-emerald-50 border-emerald-200'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">
            Proposed
          </p>
          <p
            className={`text-slate-900 break-words ${lawNameChanged ? 'font-semibold text-emerald-800' : ''}`}
          >
            {c.proposed_law_name ?? c.before_law_name ?? '—'}
          </p>
          {c.proposed_source_url ? (
            <a
              href={c.proposed_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs mt-1 break-all underline decoration-dotted inline-block ${
                urlChanged ? 'text-emerald-700 font-medium hover:text-emerald-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {c.proposed_source_url}
            </a>
          ) : (
            <p className="text-xs mt-1 break-all text-slate-500">—</p>
          )}
          {c.proposed_status && (
            <p className="text-emerald-700 text-xs mt-1">status: {c.proposed_status}</p>
          )}
          {c.superseded_by && (
            <p className="text-amber-700 text-xs mt-1">superseded by: {c.superseded_by}</p>
          )}
        </div>
      </div>

      {c.reasoning && (
        <div className="text-sm text-slate-700">
          <p className="whitespace-pre-wrap">
            {reasoningOpen ? c.reasoning : reasoningShort}
            {!reasoningOpen && reasoningHasMore && '…'}
          </p>
          {reasoningHasMore && (
            <button
              type="button"
              onClick={() => setReasoningOpen((s) => !s)}
              className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
            >
              {reasoningOpen ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  expand reasoning
                </>
              )}
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {c.proposed_source_url && (
          <a
            href={c.proposed_source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-lg"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open proposed source
          </a>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => decide('approve')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg"
        >
          {busy === 'approve' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve
        </button>
        <button
          type="button"
          onClick={() => decide('reject')}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 px-3 py-1.5 rounded-lg border border-red-200"
        >
          {busy === 'reject' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Reject
        </button>
        {allowDuplicate && (
          <button
            type="button"
            onClick={() => decide('mark_duplicate')}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200"
          >
            {busy === 'mark_duplicate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Mark duplicate
          </button>
        )}
      </div>
    </div>
  );
}
