'use client';

/**
 * AI overview of a dispute: the "full story".
 *
 * Renders the plain-English narrative of where the dispute stands:
 *   1. Most-recent update (one sentence, shown first)
 *   2. Plain-English summary of the dispute so far
 *   3. Suggested next steps
 *
 * Backed by `/api/disputes/[id]/ai-overview`. Haiku-cached on the
 * disputes row, keyed on correspondence count, so subsequent loads
 * are instant and a new reply naturally invalidates the cache.
 *
 * Used in `embedded` mode inside the "What happens next" hero card on
 * the dispute detail page: no header or refresh button of its own
 * (the hero card owns the single Refresh control), and the "Do this
 * next" block is hidden because the hero CTA covers it. When the
 * parent bumps `refreshKey` (correspondence added, letter saved,
 * resolve completed, watchdog change) the card refetches with
 * ?refresh=1 so the narrative is regenerated, not served stale from
 * the server-side cache.
 */

import { useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw, Loader2, ArrowRight, AlertCircle, Bell } from 'lucide-react';

export interface OverviewPayload {
  summary: string;
  latest_update: string;
  next_action: string;
  suggested_steps: string[];
  generated_at: string;
  correspondence_count: number;
  cached: boolean;
}

export default function DisputeOverviewCard({
  disputeId,
  refreshKey = 0,
  embedded = false,
  onLoaded,
}: {
  disputeId: string;
  /** Bump to force a refetch (with ?refresh=1) from the parent. */
  refreshKey?: number;
  /** Render bare content for composing inside a parent card. */
  embedded?: boolean;
  /** Called whenever a payload loads, so the parent can read next_action. */
  onLoaded?: (data: OverviewPayload) => void;
}) {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRefreshKey = useRef<number | null>(null);

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
      onLoaded?.(d as OverviewPayload);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // First mount: plain load (server cache is fine). Subsequent
    // refreshKey bumps: force ?refresh=1 so the narrative regenerates
    // even though the server caches on correspondence count.
    const force = lastRefreshKey.current !== null && lastRefreshKey.current !== refreshKey;
    lastRefreshKey.current = refreshKey;
    void load(force);
  }, [disputeId, refreshKey]);

  if ((loading || refreshing) && !data) {
    const row = (
      <div className="flex items-center gap-2 text-sm text-emerald-700">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading the thread for you…
      </div>
    );
    if (embedded) return row;
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl p-5 mb-4">
        {row}
      </div>
    );
  }

  if (error && !data) {
    const row = (
      <div className="flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-900">Couldn&apos;t generate the story</p>
          <button onClick={() => load(true)} className="text-xs text-amber-700 underline hover:text-amber-900">
            Retry
          </button>
        </div>
      </div>
    );
    if (embedded) return row;
    return <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">{row}</div>;
  }

  if (!data) return null;

  const story = (
    <>
      {data.latest_update && (
        <div className="bg-white/80 border border-emerald-200 rounded-xl p-3 mb-3">
          <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1 flex items-center gap-1">
            <Bell className="h-3 w-3" /> Latest update
          </p>
          <p className="text-sm text-slate-900">{data.latest_update}</p>
        </div>
      )}

      <p className="text-sm text-slate-800 leading-relaxed">{data.summary}</p>

      {!embedded && data.next_action && (
        <div className="bg-emerald-600 text-white rounded-xl p-3 mt-3">
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
    </>
  );

  if (embedded) {
    return (
      <div className="relative">
        {refreshing && (
          <p className="text-[11px] text-emerald-700 mb-2 flex items-center gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" /> Updating the story…
          </p>
        )}
        {story}
      </div>
    );
  }

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
      {story}
    </div>
  );
}
