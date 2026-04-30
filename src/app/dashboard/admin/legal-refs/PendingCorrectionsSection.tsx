'use client';

/**
 * Pending corrections section — PR ε.
 *
 * Renders the queue of proposed citation corrections from automated
 * verifiers (Perplexity reverify cron, Haiku verifier). Each row is a
 * BEFORE → PROPOSED diff and three buttons: Approve / Reject / Mark duplicate.
 *
 * This is the human-in-loop gate. No citation field changes without a
 * founder click here (or a direct admin edit elsewhere).
 */

import { useEffect, useState, useCallback } from 'react';
import { ExternalLink, Check, X, Copy, Loader2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

interface Correction {
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
  legal_references?: {
    id: string;
    law_name: string;
    source_url: string;
    category: string;
    subcategory: string | null;
    verification_status: string;
  } | null;
}

const CONFIDENCE_CLASS: Record<string, string> = {
  high: 'bg-green-100 text-green-700 border-green-300',
  medium: 'bg-amber-100 text-amber-700 border-amber-300',
  low: 'bg-red-100 text-red-700 border-red-300',
};

export default function PendingCorrectionsSection() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/legal-ref-corrections?status=pending', {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCorrections(data.corrections || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, action: 'approve' | 'reject' | 'mark_duplicate') => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/legal-ref-corrections/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const bulkApproveHigh = async () => {
    const highCount = corrections.filter((c) => c.confidence === 'high').length;
    if (highCount === 0) return;
    if (
      !confirm(
        `Approve all ${highCount} pending corrections with confidence='high'? This will overwrite ${highCount} citation rows. Cost £0 (just DB writes).`,
      )
    ) {
      return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch('/api/admin/legal-ref-corrections/approve-high-confidence', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const highCount = corrections.filter((c) => c.confidence === 'high').length;

  return (
    <section className="mt-10 mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          Pending corrections{' '}
          <span className="text-slate-500 text-base font-normal">({corrections.length})</span>
        </h2>
        {highCount > 0 && (
          <button
            onClick={bulkApproveHigh}
            disabled={bulkBusy}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
          >
            {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Approve all {highCount} high-confidence
          </button>
        )}
      </div>

      <p className="text-slate-600 text-sm mb-4">
        Automated verifiers propose corrections here. Nothing in the canonical citation table changes
        until a founder clicks Approve.
      </p>

      {error && (
        <div className="mb-3 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : corrections.length === 0 ? (
        <div className="py-10 text-center text-slate-500 text-sm border border-dashed border-slate-200 rounded-2xl">
          No pending corrections. The queue is clean.
        </div>
      ) : (
        <div className="space-y-3">
          {corrections.map((c) => {
            const isOpen = expanded[c.id] ?? false;
            const reasoningShort = (c.reasoning ?? '').slice(0, 200);
            const reasoningHasMore = (c.reasoning ?? '').length > 200;
            const lawNameChanged =
              c.proposed_law_name && c.proposed_law_name !== c.before_law_name;
            const urlChanged =
              c.proposed_source_url && c.proposed_source_url !== c.before_source_url;
            return (
              <div
                key={c.id}
                className="border border-slate-200 rounded-2xl p-5 bg-white"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <a
                      href={`#ref-${c.ref_id}`}
                      className="text-sm font-semibold text-slate-900 hover:text-emerald-600"
                    >
                      {c.legal_references?.law_name ?? c.before_law_name ?? '(unknown ref)'}
                    </a>
                    <p className="text-xs text-slate-500 mt-0.5">
                      proposed by {c.proposer} · {new Date(c.proposed_at).toLocaleString('en-GB')}
                      {c.cost_gbp != null && ` · £${c.cost_gbp.toFixed(4)}`}
                    </p>
                  </div>
                  <span
                    className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full border ${CONFIDENCE_CLASS[c.confidence]}`}
                  >
                    {c.confidence}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Before
                    </p>
                    <p className="text-slate-800">{c.before_law_name ?? '—'}</p>
                    <p className="text-slate-500 text-xs mt-1 break-all">
                      {c.before_source_url ?? '—'}
                    </p>
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
                      className={`text-slate-900 ${lawNameChanged ? 'font-semibold text-emerald-800' : ''}`}
                    >
                      {c.proposed_law_name ?? c.before_law_name ?? '—'}
                    </p>
                    <p
                      className={`text-xs mt-1 break-all ${urlChanged ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}
                    >
                      {c.proposed_source_url ?? c.before_source_url ?? '—'}
                    </p>
                    {c.proposed_status && (
                      <p className="text-emerald-700 text-xs mt-1">status: {c.proposed_status}</p>
                    )}
                    {c.superseded_by && (
                      <p className="text-amber-700 text-xs mt-1">
                        superseded by: {c.superseded_by}
                      </p>
                    )}
                  </div>
                </div>

                {c.reasoning && (
                  <div className="mt-3 text-sm text-slate-700">
                    <p className="whitespace-pre-wrap">
                      {isOpen ? c.reasoning : reasoningShort}
                      {!isOpen && reasoningHasMore && '…'}
                    </p>
                    {reasoningHasMore && (
                      <button
                        onClick={() =>
                          setExpanded((s) => ({ ...s, [c.id]: !isOpen }))
                        }
                        className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700"
                      >
                        {isOpen ? (
                          <>
                            <ChevronUp className="h-3 w-3" />
                            collapse
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3" />
                            expand
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
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
                    onClick={() => decide(c.id, 'approve')}
                    disabled={busyId === c.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg"
                  >
                    {busyId === c.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </button>
                  <button
                    onClick={() => decide(c.id, 'reject')}
                    disabled={busyId === c.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-700 px-3 py-1.5 rounded-lg border border-red-200"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                  <button
                    onClick={() => decide(c.id, 'mark_duplicate')}
                    disabled={busyId === c.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Mark duplicate
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
