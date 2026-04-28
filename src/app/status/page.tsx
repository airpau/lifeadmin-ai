/**
 * /status — public Paybacker UK Consumer Rights API status page.
 *
 * Server-rendered, fetches /api/status (60s cache). No auth, no per-
 * customer data. Linkable from outreach DMs and trust documents.
 */

import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Status — Paybacker UK Consumer Rights API',
  description: 'Live availability + latency for the Paybacker /v1/disputes API. Updated every minute.',
  alternates: { canonical: 'https://paybacker.co.uk/status' },
  robots: { index: true, follow: true },
};

interface StatusPayload {
  status: 'operational' | 'degraded' | 'outage';
  last_24h: { total_calls: number; error_rate_pct: number; p50_latency_ms: number; p95_latency_ms: number; uptime_pct: number };
  updated_at: string;
}

async function fetchStatus(): Promise<StatusPayload | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://paybacker.co.uk';
    const r = await fetch(`${baseUrl}/api/status`, { next: { revalidate: 60 } });
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export default async function StatusPage() {
  const data = await fetchStatus();
  const colour = data?.status === 'operational' ? '#059669' : data?.status === 'degraded' ? '#d97706' : '#b91c1c';
  const label = data?.status === 'operational' ? 'All systems operational' : data?.status === 'degraded' ? 'Partial degradation' : data?.status === 'outage' ? 'Service outage' : 'Status unknown';
  return (
    <main style={page}>
      <div style={shell}>
        <nav style={{ marginBottom: 32, fontSize: 14, color: '#64748b' }}>
          <Link href="/for-business" style={{ color: '#64748b', textDecoration: 'none' }}>← paybacker.co.uk/for-business</Link>
        </nav>

        <h1 style={{ margin: 0, fontSize: 32, letterSpacing: '-0.02em' }}>API status</h1>
        <p style={{ marginTop: 8, fontSize: 16, color: '#475569' }}>
          Live availability and latency for <code style={inlineCode}>POST /v1/disputes</code>. Refreshes every minute.
        </p>

        <div style={{ ...card, marginTop: 32, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 16, height: 16, borderRadius: 8, background: colour }} />
          <div style={{ fontSize: 22, fontWeight: 600 }}>{label}</div>
          {data && <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: 13 }}>Updated {new Date(data.updated_at).toLocaleString('en-GB')}</div>}
        </div>

        {data && (
          <div style={{ ...statRow, marginTop: 16 }}>
            <Stat label="Uptime (24h)" value={`${data.last_24h.uptime_pct.toFixed(2)}%`} />
            <Stat label="p50 latency" value={`${data.last_24h.p50_latency_ms}ms`} />
            <Stat label="p95 latency" value={`${data.last_24h.p95_latency_ms}ms`} />
            <Stat label="Calls (24h)" value={data.last_24h.total_calls.toLocaleString()} />
            <Stat label="Error rate" value={`${data.last_24h.error_rate_pct.toFixed(2)}%`} accent={data.last_24h.error_rate_pct > 1 ? 'amber' : undefined} />
          </div>
        )}

        <div style={{ ...card, marginTop: 24 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>What this measures</h2>
          <ul style={{ paddingLeft: 18, color: '#475569', lineHeight: 1.7, marginTop: 8 }}>
            <li><strong>Operational</strong>: error rate &lt; 1% AND p95 ≤ 6s.</li>
            <li><strong>Degraded</strong>: error rate ≥ 1% OR p95 &gt; 6s.</li>
            <li><strong>Outage</strong>: error rate ≥ 5% OR p95 &gt; 10s.</li>
            <li>Latency includes the LLM call (Claude). Network variance to Anthropic is the dominant component.</li>
            <li>Aggregated across all customers and tiers. We do not display per-customer status here.</li>
          </ul>
        </div>

        <p style={{ marginTop: 24, color: '#64748b', fontSize: 13 }}>
          For incident notifications during a registered Enterprise SLA, raise to <a href="mailto:business@paybacker.co.uk" style={{ color: '#0f172a' }}>business@paybacker.co.uk</a>.
        </p>
      </div>
    </main>
  );
}

const page: React.CSSProperties = { minHeight: '100vh', background: '#fff', fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', color: '#0f172a' };
const shell: React.CSSProperties = { maxWidth: 880, margin: '0 auto', padding: '64px 24px' };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 };
const inlineCode: React.CSSProperties = { background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 };
const statRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 };

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: 'amber' | 'red' }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: accent === 'amber' ? '#d97706' : accent === 'red' ? '#b91c1c' : '#0f172a' }}>{value}</div>
    </div>
  );
}
