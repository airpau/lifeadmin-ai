/**
 * Public moat surface — anonymised aggregate dispute outcome stats.
 *
 * noindex until the dataset is mature (>=1000 cases). The page renders
 * without auth and pulls from `dispute_intelligence_stats` directly via
 * the service-role client (no per-user data is exposed; we only show
 * aggregates with sample size >=5).
 */

import type { Metadata } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'UK Dispute Success Rates · Paybacker',
  description: 'Anonymised aggregate stats from the Paybacker UK consumer dispute outcome dataset.',
  robots: { index: false, follow: false },
};

interface StatRow {
  scope_kind: string;
  scope_key: string;
  total_count: number;
  win_rate: number | null;
  avg_recovered_gbp: number | null;
  total_recovered_gbp: number | null;
  computed_at: string;
}

function pct(n: number | null): string {
  if (n == null) return '—';
  return `${(n * 100).toFixed(0)}%`;
}
function gbp(n: number | null): string {
  if (n == null) return '£0';
  return `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
}

async function latestPerScope(scope: string, limit: number): Promise<StatRow[]> {
  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await sb
    .from('dispute_intelligence_stats')
    .select('scope_kind, scope_key, total_count, win_rate, avg_recovered_gbp, total_recovered_gbp, computed_at')
    .eq('scope_kind', scope)
    .order('computed_at', { ascending: false })
    .limit(2000);
  const seen = new Map<string, StatRow>();
  for (const r of (data ?? []) as StatRow[]) {
    if (!seen.has(r.scope_key)) seen.set(r.scope_key, r);
    if (seen.size >= limit) break;
  }
  return Array.from(seen.values());
}

export default async function PublicSuccessRates() {
  const [overall, industries, types] = await Promise.all([
    latestPerScope('overall', 1),
    latestPerScope('industry', 30),
    latestPerScope('dispute_type', 30),
  ]);
  const o = overall[0];
  const totalCases = o?.total_count ?? 0;
  const totalValue = o?.total_recovered_gbp ?? 0;

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          UK consumer dispute outcomes — what actually works
        </h1>
        <p className="text-xl text-slate-300 mb-8">
          We&apos;ve tracked <strong>{totalCases.toLocaleString('en-GB')}</strong> UK consumer disputes
          worth <strong>{gbp(totalValue)}</strong> in dispute value.
          Here&apos;s the data, anonymised.
        </p>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Win rate by industry</h2>
          <div className="space-y-2">
            {industries
              .filter((i) => i.total_count >= 5)
              .sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0))
              .map((i) => (
                <div key={i.scope_key} className="flex items-center gap-3 text-sm">
                  <div className="w-32 capitalize">{i.scope_key}</div>
                  <div className="flex-1 bg-slate-800 rounded h-4 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${(i.win_rate ?? 0) * 100}%` }} />
                  </div>
                  <div className="w-16 text-right">{pct(i.win_rate)}</div>
                  <div className="w-24 text-right text-slate-400">{i.total_count} cases</div>
                </div>
              ))}
            {industries.filter((i) => i.total_count >= 5).length === 0 && (
              <p className="text-slate-400">Dataset is still warming up — fewer than 5 industries with enough data to publish.</p>
            )}
          </div>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">Win rate by dispute type</h2>
          <div className="space-y-2">
            {types.filter((t) => t.total_count >= 5).map((t) => (
              <div key={t.scope_key} className="flex justify-between border-b border-slate-800 py-2 text-sm">
                <span className="font-mono text-slate-300">{t.scope_key}</span>
                <span className="font-semibold">{pct(t.win_rate)} ({t.total_count} cases)</span>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-slate-800 pt-8 text-sm text-slate-400">
          <p className="mb-2">
            Source: Paybacker dispute outcome dataset v1. Outcomes tagged by users
            and AI-extracted from incoming correspondence (human-confirmed).
            Sample size &ge; 5 required before a row is published.
          </p>
          <p>
            This is the largest UK consumer dispute outcome dataset outside of the
            Financial Ombudsman Service. The moat compounds with usage —
            <a href="/" className="text-emerald-400 hover:underline ml-1">join Paybacker free</a>
            {' '}and your outcomes train the engine for everyone.
          </p>
        </section>
      </div>
    </main>
  );
}
