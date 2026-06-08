/**
 * /dashboard/admin/intelligence
 *
 * Closed-loop architecture (see docs/CLOSED_LOOP_ARCHITECTURE.md).
 *
 * Five cards:
 *   1. Alert engagement (Phase 0) — per WhatsApp template precision.
 *   2. Auto-suppressions (Phase 0) — alerts the layer chose not to fire.
 *   3. Legal ref performance (Phase 1) — per-ref win rate, top + bottom 10.
 *   4. Chat reply quality (Phase 2) — per prompt template thumb rate.
 *   5. Tool reliability (Phase 2) — per tool success rate, with auto-
 *      downrank flag for >30% fail at >20 invocations.
 *
 * All cards read from intelligence_stats (rolled up daily by
 * /api/cron/intelligence-rollup-daily at 02:15 UTC) plus
 * intelligence_events for ambient context (suppressions, downrank flags).
 * Empty-state messaging shows the warmup math so the founder knows when
 * the first numbers will appear.
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

  // ── Phase 1: legal_ref performance ─────────────────────────────────
  const { data: refStatsRows } = await supabase
    .from('intelligence_stats')
    .select('*')
    .eq('scope_kind', 'legal_ref')
    .eq('window_kind', 'all_time')
    .gte('emitted', 5) // founder rec: don't show refs with <5 prior uses
    .order('precision_pct', { ascending: false });
  const refStats = (refStatsRows ?? []) as StatsRow[];

  // Join to legal_references for the human-readable law_name. Tiny table
  // (≤ 200 rows) so a single fetch is cheap; map by UUID for the render.
  const refIds = refStats.map((r) => r.scope_value);
  let refNamesById = new Map<string, { law_name: string; section: string | null }>();
  if (refIds.length > 0) {
    const { data: legalRows } = await supabase
      .from('legal_references')
      .select('id, law_name, section')
      .in('id', refIds);
    refNamesById = new Map(
      ((legalRows ?? []) as Array<{
        id: string;
        law_name: string;
        section: string | null;
      }>).map((r) => [r.id, { law_name: r.law_name, section: r.section }]),
    );
  }

  const topRefs = refStats.slice(0, 10);
  const bottomRefs = refStats.slice(-10).reverse();

  // ── Phase 2: chat reply quality (per prompt_template) ─────────────
  const { data: promptStatsRows } = await supabase
    .from('intelligence_stats')
    .select('*')
    .eq('scope_kind', 'prompt_template')
    .eq('window_kind', 'all_time')
    .gte('emitted', 5)
    .order('precision_pct', { ascending: false });
  const promptStats = (promptStatsRows ?? []) as StatsRow[];

  // ── Phase 2: tool reliability (per tool) ──────────────────────────
  const { data: toolStatsRows } = await supabase
    .from('intelligence_stats')
    .select('*')
    .eq('scope_kind', 'tool')
    .eq('window_kind', 'all_time')
    .order('emitted', { ascending: false });
  const toolStats = (toolStatsRows ?? []) as StatsRow[];

  // ── Phase 2: auto-downrank flags (last 30 days) ───────────────────
  const downrankSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: downrankRows } = await supabase
    .from('intelligence_events')
    .select('id, emitted_at, subject_id, predicted')
    .eq('action_kind', 'tool_downrank_flagged')
    .gte('emitted_at', downrankSince)
    .order('emitted_at', { ascending: false })
    .limit(20);
  const downrankFlags = (downrankRows ?? []) as Array<{
    id: string;
    emitted_at: string;
    subject_id: string | null;
    predicted: Record<string, unknown> | null;
  }>;
  const flaggedTools = new Set(downrankFlags.map((d) => d.subject_id ?? ''));

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

      {/* ───────── Card 3: Legal ref performance (Phase 1) ───────── */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">
            Legal ref performance (all time)
          </h2>
          <span className="text-xs text-slate-500">
            Win rate per legal_ref across every cited letter. Equal attribution across refs in multi-citation letters. Min sample 5.
          </span>
        </header>
        {refStats.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            No legal_ref data yet. Phase 1 started emitting on 2026-06-07.
            Rows appear once any cited legal_ref has been used 5+ times AND
            at least one of those disputes has been resolved. Under-sample
            refs are hidden — they're still being learned.
          </div>
        )}
        {refStats.length > 0 && (
          <div className="overflow-x-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
              <div>
                <h3 className="font-semibold text-sm text-emerald-700 mb-2">
                  Top 10 by win rate
                </h3>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium">Law</th>
                      <th className="text-right px-2 py-1 font-medium">Cited</th>
                      <th className="text-right px-2 py-1 font-medium">Won</th>
                      <th className="text-right px-2 py-1 font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRefs.map((r) => {
                      const name = refNamesById.get(r.scope_value);
                      const label = name
                        ? `${name.law_name}${name.section ? ` ${name.section}` : ''}`
                        : r.scope_value.slice(0, 8) + '…';
                      const prec =
                        r.precision_pct != null ? Number(r.precision_pct) : null;
                      return (
                        <tr key={r.scope_value} className="border-t border-slate-100">
                          <td className="px-2 py-1 text-slate-800">{label}</td>
                          <td className="px-2 py-1 text-right text-slate-700">{r.emitted}</td>
                          <td className="px-2 py-1 text-right text-slate-700">{r.won}</td>
                          <td className="px-2 py-1 text-right">
                            <Tone tone={precisionTone(prec, r.emitted)}>{fmtPct(prec)}</Tone>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-rose-700 mb-2">
                  Bottom 10 by win rate
                </h3>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium">Law</th>
                      <th className="text-right px-2 py-1 font-medium">Cited</th>
                      <th className="text-right px-2 py-1 font-medium">Won</th>
                      <th className="text-right px-2 py-1 font-medium">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bottomRefs.map((r) => {
                      const name = refNamesById.get(r.scope_value);
                      const label = name
                        ? `${name.law_name}${name.section ? ` ${name.section}` : ''}`
                        : r.scope_value.slice(0, 8) + '…';
                      const prec =
                        r.precision_pct != null ? Number(r.precision_pct) : null;
                      return (
                        <tr key={r.scope_value} className="border-t border-slate-100">
                          <td className="px-2 py-1 text-slate-800">{label}</td>
                          <td className="px-2 py-1 text-right text-slate-700">{r.emitted}</td>
                          <td className="px-2 py-1 text-right text-slate-700">{r.won}</td>
                          <td className="px-2 py-1 text-right">
                            <Tone tone={precisionTone(prec, r.emitted)}>{fmtPct(prec)}</Tone>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ───────── Card 4: Chat reply quality (Phase 2) ───────── */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">
            Chat reply quality (per prompt template)
          </h2>
          <span className="text-xs text-slate-500">
            Thumb rate = 👍 / (👍 + 👎). Significant replies only. Min sample 5.
          </span>
        </header>
        {promptStats.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            No chat reply feedback yet. The Pocket Agent started asking for
            thumbs on 2026-06-08. Rows appear once any prompt template has
            received 5+ rated replies.
          </div>
        )}
        {promptStats.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Prompt template</th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">Rated</th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">👍</th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">👎</th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">Thumb rate</th>
                </tr>
              </thead>
              <tbody>
                {promptStats.map((r) => {
                  const prec = r.precision_pct != null ? Number(r.precision_pct) : null;
                  return (
                    <tr key={r.scope_value} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">{r.scope_value}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.emitted}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.acted_on}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.dismissed}</td>
                      <td className="px-4 py-3 text-right">
                        <Tone tone={precisionTone(prec, r.emitted)}>{fmtPct(prec)}</Tone>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ───────── Card 5: Tool reliability (Phase 2) ───────── */}
      <section className="bg-white border border-slate-200 rounded-xl">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 text-sm">
            Tool reliability (Pocket Agent dispatch)
          </h2>
          <span className="text-xs text-slate-500">
            Success rate per tool. Auto-flagged for downrank when invocations &gt; 20 AND fail rate &gt; 30%.
          </span>
        </header>
        {toolStats.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-500">
            No tool telemetry yet. The Pocket Agent started emitting tool-call
            events on 2026-06-08. Rows appear once the daily rollup runs.
          </div>
        )}
        {toolStats.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Tool</th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">Calls</th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">Succeeded</th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">Failed</th>
                  <th className="text-right px-4 py-3 font-medium uppercase tracking-wide text-xs">Success rate</th>
                  <th className="text-left px-4 py-3 font-medium uppercase tracking-wide text-xs">Status</th>
                </tr>
              </thead>
              <tbody>
                {toolStats.map((r) => {
                  const prec = r.precision_pct != null ? Number(r.precision_pct) : null;
                  const flagged = flaggedTools.has(r.scope_value);
                  return (
                    <tr key={r.scope_value} className={`border-t border-slate-100 ${flagged ? 'bg-rose-50/40' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">{r.scope_value}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.emitted}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.acted_on}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{r.dismissed}</td>
                      <td className="px-4 py-3 text-right">
                        <Tone tone={precisionTone(prec, r.emitted)}>{fmtPct(prec)}</Tone>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {flagged ? (
                          <Tone tone="red">⚠ Auto-downrank flagged</Tone>
                        ) : r.emitted >= 30 && prec != null && prec >= 70 ? (
                          <Tone tone="green">Healthy</Tone>
                        ) : (
                          <Tone tone="slate">Watching</Tone>
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


