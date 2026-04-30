import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';

const FOUNDER_FALLBACK = 'aireypaul@googlemail.com';

interface Summary {
  generatedAt: string;
  monthSoFar: {
    total_gbp: number;
    byProvider: Array<{ provider: string; cost_gbp: number }>;
    byModel: Array<{ model: string; cost_gbp: number }>;
  };
  last30Days: { total_gbp: number };
  topEndpoints: Array<{ endpoint: string; cost_gbp: number }>;
  topUsers: Array<{ user_id: string; email: string | null; tier: string | null; cost_gbp: number }>;
  perTier: Record<string, number>;
  dailyTrend: Array<{ date: string; cost_gbp: number }>;
  projection: { monthlyRunRate_gbp: number; basedOnDays: number };
}

function gbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

function isFounder(email: string | null | undefined): boolean {
  if (!email) return false;
  if ((process.env.FOUNDER_EMAIL || '').trim().toLowerCase() === email.toLowerCase()) return true;
  return email.toLowerCase() === FOUNDER_FALLBACK;
}

export default async function AdminBillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isFounder(user?.email)) {
    // Pretend the page doesn't exist.
    redirect('/dashboard');
  }

  // Fetch summary directly via the admin API (server fetch).
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('host');
  const cookie = h.get('cookie') || '';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

  let summary: Summary | null = null;
  let fetchErr: string | null = null;
  try {
    const res = await fetch(`${base}/api/admin/billing/summary`, {
      cache: 'no-store',
      headers: { cookie },
    });
    if (res.ok) summary = await res.json();
    else fetchErr = `Summary fetch failed: ${res.status}`;
  } catch (e: any) {
    fetchErr = e?.message || 'Summary fetch failed';
  }

  if (!summary) {
    return (
      <div className="p-8 text-white">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-red-400 mt-4">{fetchErr || 'No data.'}</p>
      </div>
    );
  }

  const maxDaily = Math.max(0.01, ...summary.dailyTrend.map((d) => d.cost_gbp));

  return (
    <div className="p-6 md:p-8 text-white space-y-8 max-w-6xl">
      <header>
        <h1 className="text-2xl md:text-3xl font-bold">API Billing</h1>
        <p className="text-sm text-slate-400 mt-1">
          Internal cost ledger — actual paid third-party API spend across Anthropic, Perplexity, Resend, Stripe, TrueLayer.
          Generated {new Date(summary.generatedAt).toLocaleString('en-GB')}.
        </p>
      </header>

      <section className="grid md:grid-cols-3 gap-4">
        <Card label="This month so far" value={gbp(summary.monthSoFar.total_gbp)} />
        <Card label="Last 30 days" value={gbp(summary.last30Days.total_gbp)} />
        <Card
          label={`Projection (${summary.projection.basedOnDays}d run-rate × 30)`}
          value={gbp(summary.projection.monthlyRunRate_gbp)}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">By provider (this month)</h2>
        <Table
          rows={summary.monthSoFar.byProvider}
          cols={[
            { key: 'provider', label: 'Provider' },
            { key: 'cost_gbp', label: 'Cost', render: (v) => gbp(v as number) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">By model (this month)</h2>
        <Table
          rows={summary.monthSoFar.byModel}
          cols={[
            { key: 'model', label: 'Model' },
            { key: 'cost_gbp', label: 'Cost', render: (v) => gbp(v as number) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Top 10 endpoints by cost (last 30d)</h2>
        <Table
          rows={summary.topEndpoints}
          cols={[
            { key: 'endpoint', label: 'Endpoint' },
            { key: 'cost_gbp', label: 'Cost', render: (v) => gbp(v as number) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Top 10 users by cost (last 30d)</h2>
        <Table
          rows={summary.topUsers}
          cols={[
            { key: 'email', label: 'Email', render: (v) => (v as string) || '(unknown)' },
            { key: 'tier', label: 'Tier', render: (v) => (v as string) || '—' },
            { key: 'cost_gbp', label: 'Cost', render: (v) => gbp(v as number) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Per-tier cost (last 30d)</h2>
        <Table
          rows={Object.entries(summary.perTier).map(([tier, cost]) => ({ tier, cost_gbp: cost }))}
          cols={[
            { key: 'tier', label: 'Tier' },
            { key: 'cost_gbp', label: 'Cost', render: (v) => gbp(v as number) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Daily cost trend (last 30 days)</h2>
        <div className="space-y-1 bg-slate-900/40 border border-slate-700 rounded p-4">
          {summary.dailyTrend.map((d) => (
            <div key={d.date} className="flex items-center gap-3 text-xs">
              <span className="w-20 shrink-0 text-slate-400">{d.date}</span>
              <div className="flex-1 bg-slate-800 rounded h-3 overflow-hidden">
                <div
                  className="h-full bg-amber-500"
                  style={{ width: `${Math.max(2, (d.cost_gbp / maxDaily) * 100)}%` }}
                />
              </div>
              <span className="w-20 text-right tabular-nums">{gbp(d.cost_gbp)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

interface Col {
  key: string;
  label: string;
  render?: (v: unknown) => React.ReactNode;
}

function Table({ rows, cols }: { rows: Array<Record<string, unknown>>; cols: Col[] }) {
  if (!rows || rows.length === 0) {
    return <p className="text-sm text-slate-400">No data.</p>;
  }
  return (
    <div className="overflow-x-auto bg-slate-900/40 border border-slate-700 rounded">
      <table className="w-full text-sm">
        <thead className="bg-slate-800/60 text-slate-300">
          <tr>
            {cols.map((c) => (
              <th key={c.key} className="text-left px-3 py-2 font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-800">
              {cols.map((c) => (
                <td key={c.key} className="px-3 py-2 text-slate-200 tabular-nums">
                  {c.render ? c.render(row[c.key]) : String(row[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
