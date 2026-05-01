/**
 * Founder-only dashboard for the dispute outcome dataset + flywheel.
 *
 * Renders headline cards, win-rate-by-industry, top merchants by case
 * count, top legal arguments by win rate, the merchant x legal_ref
 * heatmap, the 12-month trend, and the dataset-growth narrative card.
 *
 * Reads the latest snapshot per (scope_kind, scope_key) from
 * `dispute_intelligence_stats`. The cron at
 * `/api/cron/compute-dispute-intelligence` populates this nightly.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

interface StatRow {
  scope_kind: string;
  scope_key: string;
  total_count: number;
  won_count: number;
  partial_count: number;
  lost_count: number;
  pending_count: number;
  avg_resolution_days: number | null;
  avg_recovered_gbp: number | null;
  total_recovered_gbp: number | null;
  win_rate: number | null;
  computed_at: string;
}

function getAdminEmails(): string[] {
  const fromEnv = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (fromEnv.length === 0) return [ADMIN_EMAIL.toLowerCase()];
  return fromEnv.includes(ADMIN_EMAIL.toLowerCase()) ? fromEnv : [...fromEnv, ADMIN_EMAIL.toLowerCase()];
}

async function fetchLatestPerScope(scopeKind: string, limit = 200): Promise<StatRow[]> {
  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await sb
    .from('dispute_intelligence_stats')
    .select('*')
    .eq('scope_kind', scopeKind)
    .order('computed_at', { ascending: false })
    .limit(2000);
  const seen = new Map<string, StatRow>();
  for (const row of (data ?? []) as StatRow[]) {
    if (!seen.has(row.scope_key)) seen.set(row.scope_key, row);
    if (seen.size >= limit) break;
  }
  return Array.from(seen.values());
}

function pct(n: number | null): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(0)}%`;
}
function gbp(n: number | null): string {
  if (n == null) return '—';
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

function heatColour(winRate: number | null): string {
  if (winRate == null) return 'bg-gray-700';
  if (winRate >= 0.7) return 'bg-emerald-500';
  if (winRate >= 0.5) return 'bg-yellow-500';
  if (winRate >= 0.3) return 'bg-orange-500';
  return 'bg-red-500';
}

export default async function DisputeIntelligenceDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!user.email || !getAdminEmails().includes(user.email.toLowerCase())) {
    redirect('/dashboard');
  }

  const [overall, byIndustry, byMerchant, byLegalRef, byMerchantRef, byType] = await Promise.all([
    fetchLatestPerScope('overall', 1),
    fetchLatestPerScope('industry', 30),
    fetchLatestPerScope('merchant', 100),
    fetchLatestPerScope('legal_ref', 100),
    fetchLatestPerScope('merchant_x_legal_ref', 500),
    fetchLatestPerScope('dispute_type', 30),
  ]);

  const overallStat = overall[0] ?? null;

  // Top 10 merchants by case count
  const topMerchants = [...byMerchant]
    .sort((a, b) => b.total_count - a.total_count).slice(0, 10);

  // Legal args with min sample 5, sorted by win rate
  const topLegal = byLegalRef
    .filter((r) => r.total_count >= 5 && r.win_rate != null)
    .sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0))
    .slice(0, 15);

  // Heatmap: top merchants × top legal refs by overlap
  const merchantKeys = topMerchants.slice(0, 10).map((m) => m.scope_key);
  const legalKeys = topLegal.slice(0, 10).map((l) => l.scope_key);
  const heatLookup = new Map<string, StatRow>();
  for (const r of byMerchantRef) heatLookup.set(r.scope_key, r);

  const totalDisputesQ = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { count: totalDisputes } = await totalDisputesQ
    .from('disputes').select('id', { count: 'exact', head: true });

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <Link href="/dashboard/admin" className="text-sm text-gray-400 hover:text-white inline-flex items-center gap-1 mb-4">
          <ArrowLeft size={14} /> Back to admin
        </Link>
        <h1 className="text-3xl font-bold mb-2">Dispute Intelligence</h1>
        <p className="text-gray-400 mb-8 max-w-2xl">
          The flywheel. Every tagged outcome trains the engine and compounds our moat.
        </p>

        {/* Headline cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <Card label="Total disputes" value={(totalDisputes ?? 0).toLocaleString('en-GB')} />
          <Card label="Total won" value={(overallStat?.won_count ?? 0).toLocaleString('en-GB')} />
          <Card label="Total recovered" value={gbp(overallStat?.total_recovered_gbp ?? null)} />
          <Card label="Overall win rate" value={pct(overallStat?.win_rate ?? null)} />
          <Card label="Avg resolution days" value={overallStat?.avg_resolution_days?.toFixed(0) ?? '—'} />
        </div>

        {/* Dataset growth — fundraise narrative card */}
        <div className="border-2 border-amber-500/40 bg-amber-500/5 rounded-lg p-6 mb-8">
          <div className="text-amber-300 text-sm uppercase tracking-wider mb-1">Dataset growth</div>
          <div className="text-2xl font-bold mb-1">
            {(overallStat?.total_count ?? 0).toLocaleString('en-GB')} tagged outcomes
            {' '}
            <span className="text-gray-400 font-normal">
              of {(totalDisputes ?? 0).toLocaleString('en-GB')} disputes
            </span>
          </div>
          <div className="text-gray-300 text-sm">
            Largest UK consumer dispute outcome dataset outside the Financial Ombudsman Service.
            Every confirmed outcome retrains the legal-basis selector against this merchant.
          </div>
        </div>

        {/* Win rate by industry */}
        <Section title="Win rate by industry">
          <div className="space-y-2">
            {byIndustry
              .filter((i) => i.total_count >= 3)
              .sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0))
              .map((i) => (
                <div key={i.scope_key} className="flex items-center gap-3 text-sm">
                  <div className="w-32 capitalize">{i.scope_key}</div>
                  <div className="flex-1 bg-gray-800 rounded h-4 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${(i.win_rate ?? 0) * 100}%` }} />
                  </div>
                  <div className="w-16 text-right">{pct(i.win_rate)}</div>
                  <div className="w-20 text-right text-gray-400">n={i.total_count}</div>
                </div>
              ))}
            {byIndustry.length === 0 && <Empty />}
          </div>
        </Section>

        {/* Top 10 merchants */}
        <Section title="Top merchants by case count">
          <Table headers={['Merchant', 'Cases', 'Win rate', 'Avg recovered']}>
            {topMerchants.map((m) => (
              <tr key={m.scope_key} className="border-t border-gray-800">
                <td className="py-2 font-mono text-xs">{m.scope_key}</td>
                <td className="py-2 text-right">{m.total_count}</td>
                <td className="py-2 text-right">{pct(m.win_rate)}</td>
                <td className="py-2 text-right">{gbp(m.avg_recovered_gbp)}</td>
              </tr>
            ))}
            {topMerchants.length === 0 && <tr><td colSpan={4}><Empty /></td></tr>}
          </Table>
        </Section>

        {/* Top legal arguments */}
        <Section title="Which legal arguments actually work? (min sample 5)">
          <Table headers={['Legal basis', 'Sample', 'Win rate', 'Avg recovered']}>
            {topLegal.map((l) => (
              <tr key={l.scope_key} className="border-t border-gray-800">
                <td className="py-2 font-mono text-xs">{l.scope_key}</td>
                <td className="py-2 text-right">{l.total_count}</td>
                <td className="py-2 text-right">{pct(l.win_rate)}</td>
                <td className="py-2 text-right">{gbp(l.avg_recovered_gbp)}</td>
              </tr>
            ))}
            {topLegal.length === 0 && <tr><td colSpan={4}><Empty /></td></tr>}
          </Table>
        </Section>

        {/* Heatmap */}
        <Section title="Heatmap: merchant × legal basis (red→green = win rate)">
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="text-left p-1"></th>
                  {legalKeys.map((k) => (
                    <th key={k} className="p-1 max-w-[80px] truncate" title={k}>{k.slice(0, 18)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {merchantKeys.map((m) => (
                  <tr key={m}>
                    <td className="p-1 font-mono">{m}</td>
                    {legalKeys.map((l) => {
                      const cell = heatLookup.get(`${m}::${l}`);
                      return (
                        <td key={l} className="p-1">
                          <div
                            className={`w-12 h-8 rounded text-white flex items-center justify-center text-[10px] ${heatColour(cell?.win_rate ?? null)}`}
                            title={cell ? `${cell.total_count} cases, win ${pct(cell.win_rate)}` : 'no data'}
                          >
                            {cell ? pct(cell.win_rate) : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {merchantKeys.length === 0 && <Empty />}
          </div>
        </Section>

        <Section title="By dispute type">
          <Table headers={['Type', 'Cases', 'Win rate', 'Avg recovered']}>
            {byType.sort((a, b) => b.total_count - a.total_count).map((t) => (
              <tr key={t.scope_key} className="border-t border-gray-800">
                <td className="py-2 font-mono text-xs">{t.scope_key}</td>
                <td className="py-2 text-right">{t.total_count}</td>
                <td className="py-2 text-right">{pct(t.win_rate)}</td>
                <td className="py-2 text-right">{gbp(t.avg_recovered_gbp)}</td>
              </tr>
            ))}
            {byType.length === 0 && <tr><td colSpan={4}><Empty /></td></tr>}
          </Table>
        </Section>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">{children}</div>
    </section>
  );
}
function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-gray-400 text-left">
        <tr>{headers.map((h, i) => <th key={h} className={i === 0 ? '' : 'text-right'}>{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Empty() {
  return <div className="text-gray-500 text-sm py-4">No data yet — cron has not produced a snapshot for this scope.</div>;
}
