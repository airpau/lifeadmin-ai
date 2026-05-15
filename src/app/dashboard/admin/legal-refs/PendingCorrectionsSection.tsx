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
import { Check, Loader2, AlertTriangle } from 'lucide-react';
import InlineCorrectionPanel, { InlineCorrection } from './InlineCorrectionPanel';

interface Correction extends InlineCorrection {
  legal_references?: {
    id: string;
    law_name: string;
    source_url: string;
    category: string;
    subcategory: string | null;
    verification_status: string;
  } | null;
}

interface PendingCorrectionsSectionProps {
  /** Optional callback so the parent page can refresh its own state when
   *  a correction is resolved (used by the page-level review queue to
   *  drop the row out of the queue once approved). */
  onResolved?: () => void | Promise<void>;
}

export default function PendingCorrectionsSection({ onResolved }: PendingCorrectionsSectionProps = {}) {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default view = only items that genuinely need a human eye (enriched
  // AND medium/high risk). Toggle to show every pending row.
  const [showAll, setShowAll] = useState(false);

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

  const handleResolved = useCallback(async () => {
    await load();
    if (onResolved) await onResolved();
  }, [load, onResolved]);

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
      await handleResolved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBulkBusy(false);
    }
  };

  const highCount = corrections.filter((c) => c.confidence === 'high').length;

  // "Genuinely needs a human eye" = enriched AND (medium or high risk).
  // Items without enrichment_data haven't been processed yet — they'll
  // be enriched on the next compliance-sync run, after which the auto-
  // apply / auto-reject phases will resolve the obvious cases.
  const needsHumanEye = (c: Correction): boolean => {
    const risk = c.enrichment_data?.risk_score ?? null;
    return !!c.enriched_at && (risk === 'medium' || risk === 'high');
  };
  const visible = showAll ? corrections : corrections.filter(needsHumanEye);
  const hiddenCount = corrections.length - visible.length;

  return (
    <section className="mt-10 mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          Pending corrections{' '}
          <span className="text-slate-500 text-base font-normal">
            ({visible.length}
            {hiddenCount > 0 && !showAll ? ` of ${corrections.length}` : ''})
          </span>
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

      <p className="text-slate-600 text-sm mb-3">
        Default view shows only enriched MEDIUM/HIGH-risk items that genuinely need your judgment.
        Mechanical and auto-rejectable rows resolve themselves on the next compliance sync.
      </p>

      <div className="flex items-center gap-3 mb-4 text-xs">
        <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            className="rounded border-slate-300"
          />
          Show all pending ({corrections.length})
        </label>
        {hiddenCount > 0 && !showAll && (
          <span className="text-slate-500">
            {hiddenCount} hidden (low-risk / un-enriched — will resolve automatically)
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 px-4 py-3 rounded-xl text-sm font-medium bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      ) : visible.length === 0 ? (
        <div className="py-10 text-center text-slate-500 text-sm border border-dashed border-slate-200 rounded-2xl">
          {corrections.length === 0
            ? 'No pending corrections. The queue is clean.'
            : `No items currently need your eye. ${corrections.length} pending row${corrections.length === 1 ? '' : 's'} ${corrections.length === 1 ? 'is' : 'are'} hidden — toggle "Show all pending" to see them.`}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => (
            <div
              key={c.id}
              id={`correction-${c.id}`}
              className="border border-slate-200 rounded-2xl p-5 bg-white scroll-mt-24"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <a
                    href={`#ref-${c.ref_id}`}
                    className="text-sm font-semibold text-slate-900 hover:text-emerald-600"
                  >
                    {c.legal_references?.law_name ?? c.before_law_name ?? '(unknown ref)'}
                  </a>
                  {/* Amendments-sweep proposals are XML-hash drift signals
                      (high trust, deterministic) — distinguish them from
                      Perplexity-verdict proposals so the founder knows
                      what they're approving. Added 2026-05-01. */}
                  {c.proposer && c.proposer.includes('amendments-sweep') && (
                    <span className="inline-flex items-center gap-1 ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300">
                      🔁 amendments sweep
                    </span>
                  )}
                </div>
              </div>
              <InlineCorrectionPanel correction={c} onResolve={handleResolved} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
