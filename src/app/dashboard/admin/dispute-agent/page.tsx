/**
 * Founder-only dashboard for the autonomous Dispute Agent.
 *
 * Companion to /dashboard/admin/dispute-intelligence. The intelligence
 * page is the brain (what works); this is the body (what the agent
 * actually does). The key feedback metric is "Effectiveness by
 * recommendation" — when the agent says escalate, what % end won?
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Link from 'next/link';
import AdminPage from '@/components/admin/AdminPage';

export const dynamic = 'force-dynamic';
const ADMIN_EMAIL = 'aireypaul@googlemail.com';

function getAdminEmails(): string[] {
  const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (fromEnv.length === 0) return [ADMIN_EMAIL.toLowerCase()];
  return fromEnv.includes(ADMIN_EMAIL.toLowerCase()) ? fromEnv : [...fromEnv, ADMIN_EMAIL.toLowerCase()];
}

interface DecisionRow {
  id: number;
  dispute_id: string;
  decided_at: string;
  to_state: string | null;
  recommended_action: string;
  user_action: string | null;
  data_grounded: boolean;
  historical_signal: unknown;
}

export default async function DisputeAgentAdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email || !getAdminEmails().includes(user.email.toLowerCase())) {
    redirect('/dashboard');
  }

  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const [{ data: activeRows }, { data: decisions }, { count: managedCount }] = await Promise.all([
    sb.from('disputes').select('id,outcome,agent_state').neq('agent_disabled', true).is('archived_at', null),
    sb.from('dispute_agent_decisions').select('id,dispute_id,decided_at,to_state,recommended_action,user_action,data_grounded,historical_signal').order('decided_at', { ascending: false }).limit(2000),
    sb.from('disputes').select('id', { count: 'exact', head: true }).neq('agent_disabled', true).not('agent_state', 'is', null),
  ]);

  const active = (activeRows ?? []) as Array<{ id: string; outcome: string | null; agent_state: string | null }>;
  const decs = (decisions ?? []) as DecisionRow[];

  const totalActive = active.filter(
    (r) => !['resolved_won', 'resolved_partial', 'resolved_lost', 'withdrawn', 'timeout'].includes(r.agent_state ?? ''),
  ).length;
  const decisionsPerDispute = (() => {
    const map = new Map<string, number>();
    for (const d of decs) map.set(d.dispute_id, (map.get(d.dispute_id) ?? 0) + 1);
    if (map.size === 0) return 0;
    let total = 0;
    for (const v of map.values()) total += v;
    return total / map.size;
  })();
  const userActed = decs.filter((d) => d.user_action);
  const approveCount = userActed.filter((d) => d.user_action === 'approved').length;
  const overrideCount = userActed.filter((d) => d.user_action === 'overrode').length;
  const approveRate = userActed.length ? approveCount / userActed.length : 0;
  const overrideRate = userActed.length ? overrideCount / userActed.length : 0;

  // Frequency by recommended action
  const byAction = new Map<string, number>();
  for (const d of decs) byAction.set(d.recommended_action, (byAction.get(d.recommended_action) ?? 0) + 1);
  const actionRows = [...byAction.entries()].sort((a, b) => b[1] - a[1]);

  // Effectiveness by recommendation — for each dispute, take the most-recent
  // recommendation BEFORE its terminal outcome and tally.
  const outcomeByDispute = new Map<string, string | null>();
  for (const r of active) outcomeByDispute.set(r.id, r.outcome);
  const recsBeforeOutcome = new Map<string, string>(); // dispute_id -> action (latest)
  for (const d of decs.slice().reverse()) {
    recsBeforeOutcome.set(d.dispute_id, d.recommended_action);
  }
  const effectivenessAgg = new Map<string, { wins: number; total: number }>();
  for (const [disputeId, action] of recsBeforeOutcome) {
    const outcome = outcomeByDispute.get(disputeId);
    if (!outcome) continue;
    const slot = effectivenessAgg.get(action) ?? { wins: 0, total: 0 };
    slot.total += 1;
    if (outcome === 'won') slot.wins += 1;
    effectivenessAgg.set(action, slot);
  }

  // Decisions firing right now — last 60 minutes.
  const cutoff = Date.now() - 60 * 60 * 1000;
  const firingNow = decs.filter((d) => Date.parse(d.decided_at) > cutoff);

  return (
    <AdminPage
      title="Dispute Agent"
      description="Autonomous state-machine driving every open dispute. Companion to Dispute Intelligence."
    >
      <div className="text-sm text-slate-600 -mt-4">
        See also{' '}
        <Link href="/dashboard/admin/dispute-intelligence" className="text-emerald-700 underline">
          Dispute Intelligence
        </Link>
        .
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card label="Active managed disputes" value={String(totalActive)} hint={`${managedCount ?? 0} ever managed`} />
          <Card label="Decisions / dispute" value={decisionsPerDispute.toFixed(1)} />
          <Card label="Approve rate" value={`${(approveRate * 100).toFixed(0)}%`} hint={`${approveCount} of ${userActed.length} actioned`} />
          <Card label="Override rate" value={`${(overrideRate * 100).toFixed(0)}%`} hint={`${overrideCount} overrides`} />
        </div>

        <Section title={`Decisions firing right now (last hour: ${firingNow.length})`}>
          <ul className="space-y-1 text-sm">
            {firingNow.length === 0 && <li className="text-slate-500">Nothing in the last hour.</li>}
            {firingNow.slice(0, 20).map((d) => (
              <li key={d.id} className="text-slate-700">
                <span className="text-slate-500">{new Date(d.decided_at).toLocaleString('en-GB')}</span>{' '}
                <span className="text-amber-700">{d.recommended_action}</span> →{' '}
                <span className="text-slate-500">dispute {d.dispute_id.slice(0, 8)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Recommendations by action type">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th>Action</th><th>Count</th></tr></thead>
            <tbody>
              {actionRows.map(([action, count]) => (
                <tr key={action} className="border-t border-slate-100">
                  <td className="py-1 text-slate-700">{action}</td>
                  <td className="py-1 text-slate-700">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Effectiveness by recommendation (key feedback signal)">
          <p className="mb-2 text-xs text-slate-500">
            Of disputes whose latest recommendation was X, what share ended <code>outcome=won</code>?
          </p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th>Action</th><th>Wins</th><th>Resolved</th><th>Win rate</th></tr></thead>
            <tbody>
              {[...effectivenessAgg.entries()].sort((a, b) => b[1].total - a[1].total).map(([action, agg]) => (
                <tr key={action} className="border-t border-slate-100">
                  <td className="py-1 text-slate-700">{action}</td>
                  <td className="py-1 text-slate-700">{agg.wins}</td>
                  <td className="py-1 text-slate-700">{agg.total}</td>
                  <td className="py-1 text-amber-700">{((agg.wins / Math.max(1, agg.total)) * 100).toFixed(0)}%</td>
                </tr>
              ))}
              {effectivenessAgg.size === 0 && (
                <tr><td colSpan={4} className="py-2 text-slate-500">Not enough resolved disputes yet.</td></tr>
              )}
            </tbody>
          </table>
        </Section>
    </AdminPage>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 overflow-x-auto">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">{title}</h2>
      {children}
    </div>
  );
}
