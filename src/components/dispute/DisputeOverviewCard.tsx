'use client';

/**
 * Dispute detail page header card.
 *
 * Renders three things at the very top so the user knows where they
 * stand without scrolling through 12 letters:
 *   1. Plain-English summary of the dispute
 *   2. Most-recent update (one sentence)
 *   3. What to do right now + 2-3 suggested next steps
 *
 * Backed by `/api/disputes/[id]/ai-overview` — Haiku-cached on the
 * disputes row, keyed on correspondence count, so subsequent loads
 * are instant and a new reply naturally invalidates the cache.
 */

import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Loader2, ArrowRight, AlertCircle, Bell } from 'lucide-react';

interface OverviewPayload {
  summary: string;
  latest_update: string;
  next_action: string;
  suggested_steps: string[];
  generated_at: string;
  correspondence_count: number;
  cached: boolean;
}

export default function DisputeOverviewCard({ disputeId }: { disputeId: string }) {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = `/api/disputes/${disputeId}/ai-overview${force ? '?refresh=1' : ''}`;
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed to load');
      setData(d as OverviewPayload);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { void load(false); }, [disputeId]);

  if (loading && !data) {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the thread for you…
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-900">Couldn\'t generate overview</p>
          <button onClick={() => load(true)} className="text-xs text-amber-700 underline hover:text-amber-900">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl p-5 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-700" />
          <h3 className="text-sm font-semibold text-emerald-900">Where this dispute stands</h3>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 disabled:opacity-50"
          title="Re-run AI overview"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Updating' : 'Refresh'}
        </button>
      </div>

      <p className="text-sm text-slate-800 leading-relaxed mb-4">{data.summary}</p>

      {data.latest_update && (
        <div className="bg-white/80 border border-emerald-200 rounded-xl p-3 mb-3">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1 flex items-center gap-1">
            <Bell className="h-3 w-3" /> Latest update
          </p>
          <p className="text-sm text-slate-900">{data.latest_update}</p>
        </div>
      )}

      {data.next_action && (
        <div className="bg-emerald-600 text-white rounded-xl p-3 mb-2">
          <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-semibold mb-1 flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> Do this next
          </p>
          <p className="text-sm font-semibold">{data.next_action}</p>
        </div>
      )}

      {data.suggested_steps.length > 0 && (
        <ul className="text-xs text-slate-700 space-y-1 mt-3">
          {data.suggested_steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-emerald-700 font-bold mt-0.5">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
