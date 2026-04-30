'use client';

/**
 * /dashboard/admin/crons
 *
 * Admin-only inventory of every Vercel cron registered in vercel.json.
 * Shows schedule, last-run timestamp + outcome, and exposes a "Run now"
 * button that proxies the call through /api/admin/crons/run (which
 * handles the CRON_SECRET server-side — the browser never touches it).
 *
 * Useful for:
 *   - Debugging (did the job fire? what did it log?)
 *   - Demoing (run sync-upcoming after reconnecting a bank)
 *   - Recovery (run a missed cron by hand)
 *
 * The list endpoint joins with business_log for last-run info, so every
 * manual run here immediately shows up in the "Last run" column after
 * refresh.
 */

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, Loader2, Play, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface CronRow {
  path: string;
  schedule: string;
  lastRun: {
    at: string;
    severity: string;
    summary: string;
  } | null;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Translate a cron expression into a human-readable cadence. Keeps it
 * short — full natural-language conversion isn't worth a dependency.
 */
function describeSchedule(cron: string): string {
  if (cron === '0 0 * * 0') return 'Weekly on Sunday (midnight)';
  const m = cron.match(/^(\*\/\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (m) return `Every ${m[1].replace('*/', '')} min`;
  const h = cron.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
  if (h) return `Every ${h[1]}h`;
  const daily = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (daily) {
    const hh = String(daily[2]).padStart(2, '0');
    const mm = String(daily[1]).padStart(2, '0');
    return `Daily at ${hh}:${mm} UTC`;
  }
  const multiHour = cron.match(/^(\d+)\s+([\d,]+)\s+\*\s+\*\s+\*$/);
  if (multiHour) {
    const mm = String(multiHour[1]).padStart(2, '0');
    const hours = multiHour[2].split(',').map((h) => `${String(h).padStart(2, '0')}:${mm}`).join(', ');
    return `Daily at ${hours} UTC`;
  }
  const dayOfWeek = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+([\d,]+)$/);
  if (dayOfWeek) {
    const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = dayOfWeek[3].split(',').map((d) => labels[parseInt(d, 10)] ?? d).join(', ');
    const hh = String(dayOfWeek[2]).padStart(2, '0');
    const mm = String(dayOfWeek[1]).padStart(2, '0');
    return `${days} at ${hh}:${mm} UTC`;
  }
  return cron;
}

export default function AdminCronsPage() {
  const [crons, setCrons] = useState<CronRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{ path: string; ok: boolean; message: string } | null>(null);

  const loadCrons = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/crons/list', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        setCrons([]);
        return;
      }
      setCrons(data.crons ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setCrons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCrons();
  }, [loadCrons]);

  const runCron = async (cronPath: string) => {
    setRunning(cronPath);
    setRunResult(null);
    try {
      const res = await fetch('/api/admin/crons/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cronPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRunResult({ path: cronPath, ok: false, message: data.error ?? `HTTP ${res.status}` });
      } else {
        const responseSummary = typeof data.response === 'object'
          ? JSON.stringify(data.response).slice(0, 200)
          : String(data.response ?? '').slice(0, 200);
        setRunResult({ path: cronPath, ok: true, message: `OK in ${data.durationMs}ms — ${responseSummary}` });
        // Refresh the list so the Last-run column updates.
        loadCrons();
      }
    } catch (e) {
      setRunResult({ path: cronPath, ok: false, message: e instanceof Error ? e.message : 'Network error' });
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/dashboard/admin" className="text-slate-500 text-sm inline-flex items-center gap-1 hover:text-slate-900 mb-2">
              <ArrowLeft className="h-4 w-4" /> Admin
            </Link>
            <h1 className="text-2xl font-bold text-slate-900">Cron jobs</h1>
            <p className="text-sm text-slate-500 mt-1">
              Every Vercel cron registered in <code className="text-xs bg-slate-200 px-1 rounded">vercel.json</code>.
              Tap <strong>Run now</strong> to invoke one manually — the call is proxied server-side with <code className="text-xs bg-slate-200 px-1 rounded">CRON_SECRET</code>, never in the browser.
            </p>
          </div>
          <button
            onClick={loadCrons}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {runResult && (
          <div
            className={`mb-4 rounded-xl p-3 text-sm flex items-start gap-2 ${
              runResult.ok
                ? 'bg-mint-400/10 border border-mint-400/30 text-mint-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {runResult.ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold break-all">{runResult.path}</p>
              <p className="text-xs mt-0.5 break-words">{runResult.message}</p>
            </div>
            <button onClick={() => setRunResult(null)} className="text-slate-500 hover:text-slate-900 text-xs">
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            <p className="font-semibold mb-1">Couldn&apos;t load cron list</p>
            <p>{error}</p>
          </div>
        )}

        {loading && !crons ? (
          <div className="text-center py-16 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
            Loading cron inventory…
          </div>
        ) : crons && crons.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">Path</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Schedule</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">Last run</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {crons.map((c) => {
                  const isRunning = running === c.path;
                  const lastSeverity = c.lastRun?.severity ?? null;
                  return (
                    <tr key={c.path} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-900 break-all">{c.path}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="text-xs">{describeSchedule(c.schedule)}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{c.schedule}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {c.lastRun ? (
                          <div className="flex items-start gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-slate-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className={`text-xs font-medium ${lastSeverity === 'error' ? 'text-red-600' : 'text-slate-700'}`}>
                                {timeAgo(c.lastRun.at)}
                                {lastSeverity === 'error' ? ' · failed' : ''}
                              </div>
                              <div className="text-[11px] text-slate-500 line-clamp-2 break-words" title={c.lastRun.summary}>
                                {c.lastRun.summary}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Never run manually</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => runCron(c.path)}
                          disabled={isRunning}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
                        >
                          {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          {isRunning ? 'Running…' : 'Run now'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-slate-500">No crons registered.</div>
        )}

        <p className="text-xs text-slate-500 mt-6">
          The &quot;Last run&quot; column reads from <code className="text-[11px] bg-slate-200 px-1 rounded">business_log</code> where <code className="text-[11px] bg-slate-200 px-1 rounded">category=&apos;cron_run&apos;</code>. Cron runs triggered by Vercel itself (on their schedule) need to opt in to this log by inserting a row in their handler — manual runs via this page always log. Vercel&apos;s built-in cron logs are still available in the Vercel dashboard.
        </p>
      </div>
    </div>
  );
}
