'use client';

/**
 * /dashboard/api-keys — B2B customer self-serve portal.
 *
 * Token-gated (not Supabase auth) — link is delivered by email via
 * /api/v1/portal-login. Sections:
 *   1. Active keys — prefix, tier, this-month usage bar, last-used,
 *      Re-issue / Revoke buttons.
 *   2. Usage chart (last 30 days, ok vs error).
 *   3. Recent API calls (last 50: timestamp, endpoint, status, latency).
 *   4. Audit log (logins, key actions, IP + user agent).
 *   5. Key history (revoked + active).
 *   6. Account info, billing portal link, support contact.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Key {
  id: string;
  name: string;
  key_prefix: string;
  tier: string;
  monthly_limit: number;
  monthly_used: number;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface UsageRow {
  key_id: string;
  endpoint: string;
  status_code: number;
  latency_ms: number | null;
  scenario_kind: string | null;
  error_code: string | null;
  created_at: string;
}

interface AuditRow {
  id: number;
  action: string;
  actor: string;
  key_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

interface DailyUsage {
  day: string;
  ok: number;
  err: number;
}

interface PortalData {
  keys: Key[];
  all_keys: Key[];
  recent_usage: UsageRow[];
  usage_daily: DailyUsage[];
  audit_log: AuditRow[];
}

export const dynamic = 'force-dynamic';

export default function ApiKeysPortalPage() {
  const params = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');

  const [requestEmail, setRequestEmail] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reissued, setReissued] = useState<{ id: string; plaintext: string } | null>(null);
  const [tab, setTab] = useState<'keys' | 'usage' | 'activity' | 'audit' | 'account'>('keys');

  async function load() {
    if (!token || !email) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/portal-keys?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load portal');
      setData(j);
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [token, email]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setRequesting(true);
    try {
      await fetch('/api/v1/portal-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: requestEmail }),
      });
      setRequestSent(true);
    } finally {
      setRequesting(false);
    }
  }

  async function reissue(id: string) {
    if (!confirm('Re-issue replaces this key. The old key will stop working immediately. Continue?')) return;
    const r = await fetch('/api/v1/portal-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email, action: 'reissue', id }),
    });
    const j = await r.json();
    if (!r.ok) { alert(j.error || 'Failed'); return; }
    setReissued({ id, plaintext: j.plaintext });
    await load();
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this key? Calls using it will fail immediately.')) return;
    const r = await fetch('/api/v1/portal-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, email, action: 'revoke', id }),
    });
    if (r.ok) await load();
  }

  // No token → render request-link form
  if (!token || !email) {
    return (
      <main style={signinPage}>
        <div style={signinCard}>
          <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.01em' }}>API portal sign-in</h1>
          <p style={{ color: '#475569' }}>
            Enter the work email your Paybacker API key is registered to. We&rsquo;ll send a one-time link.
          </p>
          {requestSent ? (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', padding: 12, borderRadius: 8, color: '#065f46' }}>
              If a key exists for that email, a link has been sent. It expires in 30 minutes.
            </div>
          ) : (
            <form onSubmit={requestLink} style={{ display: 'grid', gap: 10 }}>
              <input type="email" required value={requestEmail} onChange={(e) => setRequestEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} />
              <button type="submit" disabled={requesting} style={btn}>{requesting ? 'Sending…' : 'Send sign-in link'}</button>
            </form>
          )}
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 24 }}>
            No key yet? <Link href="/for-business" style={{ color: '#0f172a' }}>Get one →</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={page}>
      <div style={shell}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <Link href="/for-business" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← paybacker.co.uk/for-business</Link>
            <h1 style={{ margin: '8px 0 4px', fontSize: 28, letterSpacing: '-0.01em' }}>API portal</h1>
            <p style={{ color: '#475569', margin: 0 }}>Signed in as <strong>{email}</strong></p>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#64748b', flexWrap: 'wrap' }}>
            <Link href="/for-business/docs" style={navLink}>Docs</Link>
            <Link href="/for-business/coverage" style={navLink}>Coverage</Link>
            <a href="mailto:business@paybacker.co.uk" style={navLink}>Support</a>
          </div>
        </header>

        {reissued && (
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', padding: 16, borderRadius: 10, marginBottom: 16 }}>
            <strong style={{ color: '#854d0e' }}>New key — copy now, it is shown ONCE:</strong>
            <pre style={{ marginTop: 8, background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 13 }}>{reissued.plaintext}</pre>
          </div>
        )}

        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {data && (
          <>
            {/* Stats */}
            <div style={statRow}>
              <Stat label="Active keys" value={data.keys.length} />
              <Stat label="Calls (30d)" value={data.usage_daily.reduce((a, d) => a + d.ok + d.err, 0)} />
              <Stat label="Errors (30d)" value={data.usage_daily.reduce((a, d) => a + d.err, 0)} accent={data.usage_daily.reduce((a, d) => a + d.err, 0) > 0 ? 'amber' : undefined} />
              <Stat label="Audit events" value={data.audit_log.length} />
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4, marginTop: 24, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              {(['keys', 'usage', 'activity', 'audit', 'account'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={tab === t ? tabActive : tabBtn}>
                  {labelFor(t)}
                </button>
              ))}
            </div>

            <div style={{ paddingTop: 20 }}>
              {tab === 'keys' && <KeysTab keys={data.keys} onReissue={reissue} onRevoke={revoke} />}
              {tab === 'usage' && <UsageTab daily={data.usage_daily} />}
              {tab === 'activity' && <ActivityTab usage={data.recent_usage} keys={data.all_keys} />}
              {tab === 'audit' && <AuditTab audit={data.audit_log} keys={data.all_keys} />}
              {tab === 'account' && <AccountTab email={email} keys={data.all_keys} />}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function labelFor(t: 'keys' | 'usage' | 'activity' | 'audit' | 'account') {
  return ({
    keys: 'Keys',
    usage: 'Usage',
    activity: 'Recent calls',
    audit: 'Audit log',
    account: 'Account',
  } as const)[t];
}

function KeysTab({ keys, onReissue, onRevoke }: { keys: Key[]; onReissue: (id: string) => void; onRevoke: (id: string) => void }) {
  if (keys.length === 0) return <p style={{ color: '#64748b' }}>No active keys. <Link href="/for-business" style={{ color: '#0f172a' }}>Get one →</Link></p>;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {keys.map((k) => {
        const pct = k.monthly_limit > 0 ? Math.min(100, Math.round((k.monthly_used / k.monthly_limit) * 100)) : 0;
        return (
          <div key={k.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{k.name}</div>
                <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                  Prefix <code style={inlineCode}>{k.key_prefix}</code> · Tier <strong style={{ color: '#0f172a', textTransform: 'capitalize' }}>{k.tier}</strong> · Issued {new Date(k.created_at).toLocaleDateString('en-GB')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onReissue(k.id)} style={btn}>Re-issue</button>
                <button onClick={() => onRevoke(k.id)} style={{ ...btn, background: '#b91c1c' }}>Revoke</button>
              </div>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: '#64748b' }}>
              Usage this month: <strong style={{ color: '#0f172a' }}>{k.monthly_used.toLocaleString()}</strong> / {k.monthly_limit.toLocaleString()} ({pct}%)
            </div>
            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? '#dc2626' : pct >= 60 ? '#d97706' : '#059669' }} />
            </div>
            {k.last_used_at && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                Last used {new Date(k.last_used_at).toLocaleString('en-GB')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function UsageTab({ daily }: { daily: DailyUsage[] }) {
  const total = daily.reduce((a, d) => a + d.ok + d.err, 0);
  const totalErr = daily.reduce((a, d) => a + d.err, 0);
  const errRate = total > 0 ? (totalErr / total) * 100 : 0;
  const max = Math.max(1, ...daily.map((d) => d.ok + d.err));
  return (
    <div style={card}>
      <h3 style={sectionTitle}>Last 30 days</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 8 }}>
        <Mini label="Total calls" value={total.toLocaleString()} />
        <Mini label="Errors" value={totalErr.toLocaleString()} />
        <Mini label="Error rate" value={`${errRate.toFixed(1)}%`} />
      </div>
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
        {daily.length === 0 ? (
          <div style={{ flex: 1, color: '#94a3b8', alignSelf: 'center', textAlign: 'center', fontSize: 13 }}>No traffic yet — make your first call.</div>
        ) : daily.map((d) => {
          const total = d.ok + d.err;
          const okH = (d.ok / max) * 116;
          const errH = (d.err / max) * 116;
          return (
            <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', minWidth: 0 }} title={`${d.day}: ${d.ok} ok / ${d.err} err`}>
              {d.err > 0 && <div style={{ height: errH, background: '#dc2626', borderRadius: '2px 2px 0 0' }} />}
              <div style={{ height: okH, background: '#059669', borderRadius: d.err === 0 ? '2px 2px 0 0' : 0 }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
        <span>{daily[0]?.day ?? ''}</span>
        <span>today</span>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b', marginTop: 12 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#059669', borderRadius: 2, marginRight: 6 }} />OK (2xx)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#dc2626', borderRadius: 2, marginRight: 6 }} />Errors (4xx/5xx)</span>
      </div>
    </div>
  );
}

function ActivityTab({ usage, keys }: { usage: UsageRow[]; keys: Key[] }) {
  const keyName = (id: string) => keys.find((k) => k.id === id)?.key_prefix ?? id.slice(0, 8);
  if (usage.length === 0) return <p style={{ color: '#64748b' }}>No calls yet — make your first request to see it here.</p>;
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <table style={tableStyle}>
        <thead>
          <tr style={trHead}>
            <th style={th}>When</th>
            <th style={th}>Key</th>
            <th style={th}>Endpoint</th>
            <th style={th}>Status</th>
            <th style={th}>Latency</th>
            <th style={th}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {usage.map((u, i) => (
            <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={td}>{new Date(u.created_at).toLocaleString('en-GB')}</td>
              <td style={td}><code style={inlineCode}>{keyName(u.key_id)}</code></td>
              <td style={td}><code style={inlineCode}>{u.endpoint}</code></td>
              <td style={td}>
                <span style={statusBadge(u.status_code)}>{u.status_code}</span>
              </td>
              <td style={td}>{u.latency_ms != null ? `${u.latency_ms}ms` : '—'}</td>
              <td style={{ ...td, color: '#64748b' }}>{u.error_code ?? u.scenario_kind ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditTab({ audit, keys }: { audit: AuditRow[]; keys: Key[] }) {
  const keyPrefix = (id: string | null) => id ? (keys.find((k) => k.id === id)?.key_prefix ?? id.slice(0, 8)) : '—';
  if (audit.length === 0) return <p style={{ color: '#64748b' }}>No audit events yet.</p>;
  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <table style={tableStyle}>
        <thead>
          <tr style={trHead}>
            <th style={th}>When</th>
            <th style={th}>Action</th>
            <th style={th}>Actor</th>
            <th style={th}>Key</th>
            <th style={th}>IP</th>
            <th style={th}>User agent</th>
          </tr>
        </thead>
        <tbody>
          {audit.map((a) => (
            <tr key={a.id} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={td}>{new Date(a.created_at).toLocaleString('en-GB')}</td>
              <td style={td}><span style={actionBadge(a.action)}>{labelAction(a.action)}</span></td>
              <td style={{ ...td, textTransform: 'capitalize' }}>{a.actor}</td>
              <td style={td}><code style={inlineCode}>{keyPrefix(a.key_id)}</code></td>
              <td style={{ ...td, color: '#64748b' }}>{a.ip_address ?? '—'}</td>
              <td style={{ ...td, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.user_agent ?? ''}>{shortenUA(a.user_agent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccountTab({ email, keys }: { email: string; keys: Key[] }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <h3 style={sectionTitle}>Account</h3>
        <p style={{ margin: '8px 0', color: '#475569' }}>Owner email: <strong>{email}</strong></p>
        <p style={{ margin: '8px 0', color: '#475569' }}>Total keys issued: <strong>{keys.length}</strong> ({keys.filter((k) => !k.revoked_at).length} active, {keys.filter((k) => k.revoked_at).length} revoked)</p>
      </div>

      <div style={card}>
        <h3 style={sectionTitle}>Key history</h3>
        {keys.length === 0 ? <p style={{ color: '#64748b' }}>No keys yet.</p> : (
          <table style={tableStyle}>
            <thead>
              <tr style={trHead}>
                <th style={th}>Name</th>
                <th style={th}>Prefix</th>
                <th style={th}>Tier</th>
                <th style={th}>Issued</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={td}>{k.name}</td>
                  <td style={td}><code style={inlineCode}>{k.key_prefix}</code></td>
                  <td style={{ ...td, textTransform: 'capitalize' }}>{k.tier}</td>
                  <td style={td}>{new Date(k.created_at).toLocaleDateString('en-GB')}</td>
                  <td style={td}>
                    {k.revoked_at
                      ? <span style={{ ...badge, background: '#fee2e2', color: '#991b1b' }}>Revoked {new Date(k.revoked_at).toLocaleDateString('en-GB')}</span>
                      : <span style={{ ...badge, background: '#d1fae5', color: '#065f46' }}>Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={card}>
        <h3 style={sectionTitle}>Billing</h3>
        <p style={{ margin: '8px 0 12px', color: '#475569' }}>Manage your Stripe subscription, update card, view invoices.</p>
        <a href="https://billing.stripe.com/p/login/9AUaH4dWj9Hf6Wk000" target="_blank" rel="noreferrer" style={btn}>Open Stripe customer portal ↗</a>
        <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: 13 }}>Free Starter pilot? No subscription to manage. Upgrade at <Link href="/for-business" style={{ color: '#0f172a' }}>/for-business</Link>.</p>
      </div>

      <div style={card}>
        <h3 style={sectionTitle}>Security &amp; data handling</h3>
        <ul style={{ paddingLeft: 18, color: '#475569', lineHeight: 1.7, margin: '8px 0' }}>
          <li>API keys are hashed with SHA-256. The plaintext is shown once via a single-use 24h reveal link and never stored after first view.</li>
          <li>Request bodies are not retained. We log only endpoint, status, latency, and an optional coarse <code style={inlineCode}>scenario_kind</code> for debugging.</li>
          <li>Portal sign-in is passwordless via 30-min single-use email links; mutating actions burn the token.</li>
          <li>Every key action and login attempt is appended to the immutable audit log on this page.</li>
        </ul>
      </div>
    </div>
  );
}

function shortenUA(ua: string | null) {
  if (!ua) return '—';
  // Take first browser-token-ish chunk for quick scanning.
  const m = ua.match(/(Chrome|Safari|Firefox|Edg|curl|node|Postman|Insomnia)\/?[\d.]*/i);
  return m ? m[0] : ua.slice(0, 30);
}
function labelAction(a: string) {
  return a.replace(/_/g, ' ');
}

function statusBadge(code: number): React.CSSProperties {
  const isOk = code >= 200 && code < 300;
  const isClient = code >= 400 && code < 500;
  return {
    background: isOk ? '#d1fae5' : isClient ? '#fef3c7' : '#fee2e2',
    color: isOk ? '#065f46' : isClient ? '#92400e' : '#991b1b',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
  };
}
function actionBadge(action: string): React.CSSProperties {
  const palette: Record<string, [string, string]> = {
    key_created: ['#d1fae5', '#065f46'],
    key_revoked: ['#fee2e2', '#991b1b'],
    key_reissued: ['#fef3c7', '#92400e'],
    reveal_link_used: ['#dbeafe', '#1e40af'],
    portal_signin: ['#e0e7ff', '#3730a3'],
    login_link_requested: ['#f1f5f9', '#475569'],
    plan_changed: ['#cffafe', '#155e75'],
  };
  const [bg, fg] = palette[action] ?? ['#f1f5f9', '#475569'];
  return { background: bg, color: fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' };
}

const page: React.CSSProperties = {
  minHeight: '100vh', background: '#f8fafc', padding: 24,
  fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', color: '#0f172a',
};
const shell: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const signinPage: React.CSSProperties = { ...page, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const signinCard: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 32, maxWidth: 480, width: '100%', display: 'grid', gap: 12,
};
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 };
const inputStyle: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '12px 14px', font: 'inherit', fontSize: 15 };
const btn: React.CSSProperties = { background: '#0f172a', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, textDecoration: 'none', display: 'inline-block' };
const inlineCode: React.CSSProperties = { background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 };
const navLink: React.CSSProperties = { color: '#475569', textDecoration: 'none' };
const tabBtn: React.CSSProperties = { background: 'transparent', border: 0, padding: '10px 14px', fontSize: 14, color: '#64748b', cursor: 'pointer', fontWeight: 500, borderBottom: '2px solid transparent' };
const tabActive: React.CSSProperties = { ...tabBtn, color: '#0f172a', borderBottom: '2px solid #0f172a', fontWeight: 600 };
const sectionTitle: React.CSSProperties = { margin: 0, fontSize: 16, letterSpacing: '-0.005em' };
const statRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const trHead: React.CSSProperties = { background: '#f8fafc' };
const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' };
const td: React.CSSProperties = { padding: '10px 14px', verticalAlign: 'top', color: '#0f172a' };
const badge: React.CSSProperties = { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 };

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: 'amber' | 'red' }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: accent === 'amber' ? '#d97706' : accent === 'red' ? '#b91c1c' : '#0f172a' }}>{value}</div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
