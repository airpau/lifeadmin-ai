/**
 * /dashboard/admin/intelligence
 *
 * Phase 0 of the closed-loop architecture (see docs/CLOSED_LOOP_ARCHITECTURE.md).
 *
 * Two cards today:
 *   1. Alert engagement — per WhatsApp template precision (acted_on /
 *      emitted) over the last 7 days, the all-time baseline, and a
 *      visual flag when precision is below the 15% auto-suppression
 *      floor. Templates in the critical-bypass list are marked so the
 *      founder knows they can't be auto-suppressed.
 *
 *   2. Auto-suppressions (last 7d) — every alert the intelligence
 *      layer chose not to fire, with the reason + sample size +
 *      precision that triggered the call.
 *
 * Both read from intelligence_stats (rolled up daily by
 * /api/cron/intelligence-rollup-daily). Empty-state messaging shows
 * the warmup math so the founder knows when the first numbers will
 * appear.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ADMIN_EMAIL } from '@/lib/admin-auth';
import AdminPage from '@/components/admin/AdminPage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StatsRow {
  scope_kind: string;
  scope_value: string;
  window_kind: 'day' | 'week' | 'month' | 'all_time';
  window_start: string;
  emitted: number;
  acted_on: number;
  dismissed: number;
  ignored: number;
  won: number;
  lost: number;
  auto_suppressed: number;
  recovered_gbp: number | string | null;
  precision_pct: number | string | null;
  computed_at: string;
}

interface SuppressionRow {
  id: string;
  emitted_at: string;
  user_id: string | null;
  subject_id: string | null;
  metadata: Record<string, unknown> | null;
}

const CRITICAL_TEMPLATES = new Set([
  'paybacker_alert_price_increase',
  'paybacker_dispute_reply',
  'paybacker_money_recovered',
  'paybacker_savings_goal_milestone',
]);

function precisionTone(
  p: number | null,
  emitted: number,
): 'green' | 'amber' | 'red' | 'slate' {
  if (emitted < 30) return 'slate';
  if (p == null) return 'slate';
  if (p >= 70) return 'green';
  if (p >= 30) return 'amber';
  return 'red';
}

function fmtPct(p: number | string | null): string {
  if (p == null) return '—';
  const n = typeof p === 'string' ? Number(p) : p;
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(0)}%`;
}

function Tone({
  tone,
  children,
}: {
  tone: 'green' | 'amber' | 'red' | 'slate';
  children: React.ReactNode;
}) {
  const cls = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    red: 'bg-rose-50 text-rose-700 border-rose-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  }[tone];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

export default async function IntelligenceAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    redirect('/dashboard');
  }

  // Pull all-time + week stats for alert_template scope. Phase 1 will
  // extend to more scope kinds (legal_ref, merchant, etc.).
  const { data: stats } = await supabase
    .from('intelligence_stats')
    .select('*')
    .eq('scope_kind', 'alert_template')
    .in('window_kind', ['all_time', 'week'])
    .order('emitted', { ascending: false });

  const rows = (stats ?? []) as StatsRow[];
  const allTime = new Map<string, StatsRow>();
  const week = new Map<string, StatsRow>();
  for (const r of rows) {
    if (r.window_kind === 'all_time') allTime.set(r.scope_value, r);
    else if (r.window_kind === 'week') week.set(r.scope_value, r);
  }

  const templates = Array.from(
    new Set([...allTime.keys(), ...week.keys()]),
  ).sort();

  // Recent auto-suppressions.
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: suppressionRows } = await supabase
    .from('intelligence_events')
    .select('id, emitted_at, user_id, subject_id, metadata')
    .eq('action_kind', 'alert_sent_suppressed')
    .gte('emitted_at', since)
    .order('emitted_at', { ascending: false })
    .limit(50);
  const suppressions = (suppressionRows ?? []) as SuppressionRow[];

  return (
    <AdminPage
      title="Intelligence layer"
      description="Per-loop precision + auto-suppression decisions. Phase 0: WhatsApp alert engagement. See docs/CLOSED_LOOP_ARCHITECTURE.md for the wider roadmap."
    >
      {/* ───────── Card 1: Alert engagement ───────── */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">
            Alert engagement (per template)
          </h2>
          <span className="text-xs text-slate-500">
            Precision = action_taken / emitted. Suppression floor: ≥ 30 sends AND ≤ 15%.
          </span>
        </header>
        {templates.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            No alert engagement data yet. The daily rollup at 02:15 UTC populates this table — first useful numbers appear once intelligence_events has rows. The dispatcher started emitting events on 2026-05-29.
          </div>
        )}
        {templates.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Template
                  </th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Sent (week)
                  </th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Precision (week)
                  </th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Sent (all time)
                  </th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Precision (all time)
                  </th>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {templates.map((name) => {
                  const at = allTime.get(name);
                  const wk = week.get(name);
                  const atPrec =
                    at?.precision_pct != null ? Number(at.precision_pct) : null;
                  const wkPrec =
                    wk?.precision_pct != null ? Number(wk.precision_pct) : null;
                  const isCritical = CRITICAL_TEMPLATES.has(name);
                  const atTone = precisionTone(atPrec, at?.emitted ?? 0);
                  const wkTone = precisionTone(wkPrec, wk?.emitted ?? 0);
                  return (
                    <tr key={name} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">
                        {name}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {wk?.emitted ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Tone tone={wkTone}>{fmtPct(wkPrec)}</Tone>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {at?.emitted ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Tone tone={atTone}>{fmtPct(atPrec)}</Tone>
                      </td>
                      <td className="px-4 py-3">
                        {isCritical ? (
                          <Tone tone="green">critical · cannot be auto-suppressed</Tone>
                        ) : (at?.emitted ?? 0) < 30 ? (
                          <Tone tone="slate">warming up</Tone>
                        ) : atPrec != null && atPrec <= 15 ? (
                          <Tone tone="red">below floor · will auto-suppress</Tone>
                        ) : (
                          <Tone tone="green">healthy</Tone>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───────── Card 2: Auto-suppressions ───────── */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">
            Auto-suppressed alerts (last 7 days)
          </h2>
          <span className="text-xs text-slate-500">
            Every alert the intelligence layer chose not to fire, with the reason it gave.
          </span>
        </header>
        {suppressions.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            No suppressions yet. The intelligence layer hasn't refused to fire any alerts in the last 7 days — either every template is above floor, or none have reached the 30-send sample minimum.
          </div>
        )}
        {suppressions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Time (UTC)
                  </th>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Template
                  </th>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    User
                  </th>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppressions.map((s) => {
                  const meta = (s.metadata ?? {}) as Record<string, unknown>;
                  const reason = (meta.decision_reason as string) ?? '—';
                  const sample = (meta.sample as number | undefined) ?? null;
                  const prec = (meta.precision_pct as number | null | undefined) ?? null;
                  return (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {new Date(s.emitted_at).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">
                        {s.subject_id ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-600">
                        {s.user_id?.slice(0, 8) ?? '—'}…
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {reason}{' '}
                        {sample != null && (
                          <span className="text-slate-400">
                            (sample={sample}, precision={fmtPct(prec)})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPage>
  );
}
