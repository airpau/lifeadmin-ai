'use client';

/**
 * Admin panel showing legal-reference corrections that the η three-gate
 * verifier auto-applied in the last 7 days. Each row is reviewable and
 * one-click revertable. Rendered inside the existing /dashboard/admin/legal-refs
 * page; founder-gated upstream by the page's existing auth check.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, Loader2 } from 'lucide-react';

interface AutoAppliedRow {
  id: string;
  legal_reference_id: string;
  before_law_name?: string | null;
  before_source_url?: string | null;
  proposed_law_name?: string | null;
  proposed_source_url?: string | null;
  applied_at?: string | null;
  reviewed_by?: string | null;
  notes?: string | null;
}

export function AutoAppliedPanel() {
  const [rows, setRows] = useState<AutoAppliedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/legal-ref-corrections/auto-applied?days=7');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load');
      } else {
        setRows(json.rows ?? []);
        setTableMissing(Boolean(json.table_missing));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const revert = async (id: string) => {
    if (!confirm('Revert this auto-applied change to its previous values?')) return;
    setReverting(id);
    try {
      const res = await fetch(`/api/admin/legal-ref-corrections/${id}/revert`, {
        method: 'POST',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`Revert failed: ${j.error ?? res.statusText}`);
      } else {
        await load();
      }
    } finally {
      setReverting(null);
    }
  };

  if (tableMissing) return null; // ε not deployed yet — hide silently

  return (
    <section className="mb-6 border border-emerald-200 bg-emerald-50 rounded-2xl p-5">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          Auto-applied (last 7 days)
        </h2>
        <span className="text-xs text-emerald-700">
          {loading ? 'loading…' : `${rows.length} change${rows.length === 1 ? '' : 's'}`}
        </span>
      </header>

      {error && (
        <p className="text-sm text-red-700 mb-2">{error}</p>
      )}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-emerald-800">
          No auto-applied corrections in the last 7 days. Everything has flowed through manual review.
        </p>
      )}

      <ul className="space-y-3">
        {rows.map(r => (
          <li key={r.id} className="bg-white rounded-xl border border-emerald-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {r.proposed_law_name ?? r.before_law_name ?? '(unnamed reference)'}
                </p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-500">Before:</span>{' '}
                    <span className="text-slate-700 break-all">
                      {r.before_law_name} · {r.before_source_url}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">After:</span>{' '}
                    <span className="text-slate-700 break-all">
                      {r.proposed_law_name} · {r.proposed_source_url}
                    </span>
                  </div>
                </div>
                {r.notes && (
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-semibold">Why auto-applied:</span> {r.notes}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Applied {r.applied_at ? new Date(r.applied_at).toLocaleString('en-GB') : '—'}{' '}
                  by {r.reviewed_by ?? 'system-auto-apply'}
                </p>
              </div>
              <button
                onClick={() => revert(r.id)}
                disabled={reverting === r.id}
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 disabled:opacity-50"
              >
                {reverting === r.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Revert
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
