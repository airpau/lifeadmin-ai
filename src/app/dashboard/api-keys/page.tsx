'use client';

/**
 * /dashboard/api-keys — B2B customer self-serve portal.
 *
 * Tabs: Keys · Usage · Recent calls · Webhooks · Audit log · Account.
 * Stat row at top. Click any usage / audit / delivery row → side drawer
 * with full detail. Filters on Recent calls. CSV export on Usage + Audit.
 */

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface Key { id: string; name: string; key_prefix: string; tier: string; monthly_limit: number; monthly_used: number; last_used_at: string | null; revoked_at: string | null; created_at: string; allowed_ips?: string[] | null; weekly_digest_opt_in?: boolean; }
interface UsageRow { key_id: string; endpoint: string; status_code: number; latency_ms: number | null; scenario_kind: string | null; error_code: string | null; created_at: string; }
interface AuditRow { id: number; action: string; actor: string; key_id: string | null; ip_address: string | null; user_agent: string | null; metadata: Record<string, any>; created_at: string; }
interface DailyUsage { day: string; ok: number; err: number; }
interface PortalData { keys: Key[]; all_keys: Key[]; recent_usage: UsageRow[]; usage_daily: DailyUsage[]; audit_log: AuditRow[]; revoked_key_usage_this_month?: number; }
interface Webhook { id: string; url: string; description: string | null; events: string[]; is_active: boolean; last_delivery_at: string | null; last_delivery_status: number | null; consecutive_failures: number; created_at: string; }
interface Delivery { id: number; webhook_id: string; event: string; status_code: number | null; latency_ms: number | null; attempt: number; error: string | null; created_at: string; }
interface WebhookData { webhooks: Webhook[]; recent_deliveries: Delivery[]; supported_events: string[]; }

interface Member { id: string; member_email: string; role: 'admin' | 'viewer'; invited_at: string; accepted_at: string | null; invited_by: string | null; }
interface MembersData { owner: string; your_email: string; your_role: 'admin' | 'viewer'; members: Member[]; }
interface StatusPayload { status: string; last_24h: { uptime_pct: number; p50_latency_ms: number; p95_latency_ms: number; total_calls: number; error_rate_pct: number }; }

type Tab = 'keys' | 'usage' | 'activity' | 'webhooks' | 'members' | 'explorer' | 'audit' | 'account';

export const dynamic = 'force-dynamic';

export default function ApiKeysPortalPage() {
  const params = useSearchParams();
  const [token, setTokenState] = useState<string | null>(params.get('token'));
  const [email, setEmailState] = useState<string | null>(params.get('email'));
  const [hasSession, setHasSession] = useState(false);
  const [tab, setTab] = useState<Tab>('keys');

  const [requestEmail, setRequestEmail] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const [data, setData] = useState<PortalData | null>(null);
  const [webhookData, setWebhookData] = useState<WebhookData | null>(null);
  const [membersData, setMembersData] = useState<MembersData | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reissued, setReissued] = useState<{ id: string; plaintext: string } | null>(null);
  const [drawer, setDrawer] = useState<{ kind: 'usage' | 'audit' | 'delivery'; row: any } | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [r1, r2, r3, r4] = await Promise.all([
        fetch('/api/v1/portal-keys', { credentials: 'include' }),
        fetch('/api/v1/portal-webhooks', { credentials: 'include' }),
        fetch('/api/v1/portal-members', { credentials: 'include' }),
        fetch('/api/status'),
      ]);
      const j1 = await r1.json();
      const j2 = await r2.json();
      const j3 = await r3.json();
      const j4 = await r4.json();
      if (r1.status === 401) { setHasSession(false); setLoading(false); return; }
      if (!r1.ok) throw new Error(j1.error || 'Could not load portal');
      setHasSession(true);
      setData(j1);
      if (r2.ok) setWebhookData(j2);
      if (r3.ok) setMembersData(j3);
      if (r4.ok) setStatus(j4);
      // Probe whether this email has a password set; if not, show banner.
      if (j3?.your_email) {
        try {
          const pwR = await fetch(`/api/v1/portal-password?email=${encodeURIComponent(j3.your_email)}`);
          const pwJ = await pwR.json();
          setNeedsPassword(!pwJ.has_password);
        } catch {}
      }
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally { setLoading(false); }
  }
  // First mount: if we have a magic-link token, exchange it for a
  // 30-day session cookie, then strip the query params from the URL
  // and reload data without them. Otherwise just attempt to load —
  // if the cookie is valid, we're already signed in; if not, the
  // sign-in form renders.
  useEffect(() => {
    (async () => {
      if (token && email) {
        try {
          const r = await fetch('/api/v1/portal-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email }) });
          if (r.ok) {
            history.replaceState({}, '', '/dashboard/api-keys');
            setHasSession(true);
          }
        } catch {}
      } else {
        // Probe — try loading; load() will set error if not signed in.
        setHasSession(true);
      }
      load();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await fetch('/api/v1/portal-session', { method: 'DELETE' });
    setTokenState(null); setEmailState(null); setHasSession(false);
    setData(null); setWebhookData(null); setMembersData(null);
    history.replaceState({}, '', '/dashboard/api-keys');
  }

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setRequesting(true);
    try {
      await fetch('/api/v1/portal-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: requestEmail }) });
      setRequestSent(true);
    } finally { setRequesting(false); }
  }

  async function reissue(id: string) {
    if (!confirm('Re-issue replaces this key. The old key will stop working immediately. Continue?')) return;
    const r = await fetch('/api/v1/portal-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'reissue', id }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error || 'Failed'); return; }
    setReissued({ id, plaintext: j.plaintext });
    await load();
  }
  async function revoke(id: string) {
    if (!confirm('Revoke this key? Calls using it will fail immediately.')) return;
    const r = await fetch('/api/v1/portal-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'revoke', id }) });
    if (r.ok) await load();
  }

  function exportCsv(type: 'usage' | 'audit') {
    if (!token || !email) return;
    window.open(`/api/v1/portal-export?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}&type=${type}`, '_blank');
  }

  // Not signed in → multi-mode sign-in form
  if (!hasSession && !loading) {
    return <SignIn />;
  }

  return (
    <main style={page}>
      <div style={shell}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <Link href="/for-business" style={{ color: '#64748b', fontSize: 13, textDecoration: 'none' }}>← paybacker.co.uk/for-business</Link>
            <h1 style={{ margin: '8px 0 4px', fontSize: 28, letterSpacing: '-0.01em' }}>API portal</h1>
            <p style={{ color: '#475569', margin: 0 }}>Signed in as <strong>{membersData?.your_email ?? '—'}</strong>{membersData?.your_role === 'viewer' && ' (viewer)'}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#64748b', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/for-business/docs" style={navLink}>Docs</Link>
            <Link href="/for-business/coverage" style={navLink}>Coverage</Link>
            <a href="mailto:business@paybacker.co.uk" style={navLink}>Support</a>
            <button onClick={signOut} style={{ ...btnGhost, fontSize: 12 }}>Sign out</button>
          </div>
        </header>

        {needsPassword && membersData?.your_email && (
          <SetPasswordBanner email={membersData.your_email} onDone={() => setNeedsPassword(false)} />
        )}

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
            <div style={statRow}>
              <Stat label="Active keys" value={data.keys.length} />
              <Stat
                label="Calls this month"
                value={data.keys.reduce((a, k) => a + k.monthly_used, 0) + (data.revoked_key_usage_this_month ?? 0)}
                hint={data.revoked_key_usage_this_month ? `incl. ${data.revoked_key_usage_this_month} on revoked keys` : undefined}
              />
              <Stat label="Calls (30d)" value={data.usage_daily.reduce((a, d) => a + d.ok + d.err, 0)} />
              <Stat label="Errors (30d)" value={data.usage_daily.reduce((a, d) => a + d.err, 0)} accent={data.usage_daily.reduce((a, d) => a + d.err, 0) > 0 ? 'amber' : undefined} />
              <Stat label="Webhooks" value={webhookData?.webhooks?.length ?? 0} />
            </div>

            <div style={{ display: 'flex', gap: 4, marginTop: 24, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              {(['keys', 'usage', 'activity', 'webhooks', 'members', 'explorer', 'audit', 'account'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} style={tab === t ? tabActive : tabBtn}>{labelFor(t)}</button>
              ))}
            </div>

            <div style={{ paddingTop: 20 }}>
              {tab === 'keys' && <KeysTab keys={data.keys} status={status} token={token ?? ''} email={email ?? ''} revokedUsageThisMonth={data.revoked_key_usage_this_month ?? 0} onReissue={reissue} onRevoke={revoke} onChange={load} />}
              {tab === 'usage' && <UsageTab daily={data.usage_daily} onExport={() => exportCsv('usage')} />}
              {tab === 'activity' && <ActivityTab usage={data.recent_usage} keys={data.all_keys} onOpen={(r) => setDrawer({ kind: 'usage', row: r })} />}
              {tab === 'webhooks' && webhookData && <WebhooksTab data={webhookData} token={token ?? ''} email={email ?? ''} onChange={load} onOpen={(r) => setDrawer({ kind: 'delivery', row: r })} />}
              {tab === 'members' && <MembersTab data={membersData} token={token ?? ''} email={email ?? ''} onChange={load} />}
              {tab === 'explorer' && <ExplorerTab keys={data.keys} />}
              {tab === 'audit' && <AuditTab audit={data.audit_log} keys={data.all_keys} onOpen={(r) => setDrawer({ kind: 'audit', row: r })} onExport={() => exportCsv('audit')} />}
              {tab === 'account' && <AccountTab email={membersData?.your_email ?? email ?? ''} keys={data.all_keys} />}
            </div>
          </>
        )}
      </div>

      {drawer && <Drawer drawer={drawer} keys={data?.all_keys ?? []} onClose={() => setDrawer(null)} />}
    </main>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

function KeysTab({ keys, status, token, email, revokedUsageThisMonth, onReissue, onRevoke, onChange }: { keys: Key[]; status: StatusPayload | null; token: string; email: string; revokedUsageThisMonth: number; onReissue: (id: string) => void; onRevoke: (id: string) => void; onChange: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Live status block */}
      {status && (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 12, height: 12, borderRadius: 6, background: status.status === 'operational' ? '#059669' : status.status === 'degraded' ? '#d97706' : '#b91c1c' }} />
          <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{status.status}</div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <span>Uptime 24h: <strong style={{ color: '#0f172a' }}>{status.last_24h.uptime_pct.toFixed(2)}%</strong></span>
            <span>p50: <strong style={{ color: '#0f172a' }}>{status.last_24h.p50_latency_ms}ms</strong></span>
            <span>p95: <strong style={{ color: '#0f172a' }}>{status.last_24h.p95_latency_ms}ms</strong></span>
            <Link href="/status" style={{ color: '#475569' }}>Public status →</Link>
          </div>
        </div>
      )}
      {keys.length === 0 ? <p style={{ color: '#64748b' }}>No active keys. <Link href="/for-business" style={{ color: '#0f172a' }}>Get one →</Link></p> : keys.map((k) => (
        <KeyCard key={k.id} k={k} token={token} email={email} onReissue={onReissue} onRevoke={onRevoke} onChange={onChange} />
      ))}
      {revokedUsageThisMonth > 0 && (
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          ℹ️ <strong>{revokedUsageThisMonth.toLocaleString()}</strong> additional call{revokedUsageThisMonth === 1 ? '' : 's'} this month
          went through previously-revoked keys. Active keys above show their own usage only.
          See the <strong>Recent calls</strong> tab to inspect every request.
        </p>
      )}
    </div>
  );
}

function KeyCard({ k, token, email, onReissue, onRevoke, onChange }: { k: Key; token: string; email: string; onReissue: (id: string) => void; onRevoke: (id: string) => void; onChange: () => void }) {
  const pct = k.monthly_limit > 0 ? Math.min(100, Math.round((k.monthly_used / k.monthly_limit) * 100)) : 0;
  const [editingIps, setEditingIps] = useState(false);
  const [ipInput, setIpInput] = useState((k.allowed_ips ?? []).join(', '));
  const isStarter = k.tier === 'starter';

  async function saveIps() {
    const ips = ipInput.split(',').map((s) => s.trim()).filter(Boolean);
    const r = await fetch('/api/v1/portal-key-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, id: k.id, allowed_ips: ips.length === 0 ? null : ips }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error || 'Failed'); return; }
    setEditingIps(false);
    onChange();
  }
  async function toggleDigest() {
    await fetch('/api/v1/portal-key-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, id: k.id, weekly_digest_opt_in: !(k.weekly_digest_opt_in ?? true) }) });
    onChange();
  }

  return (
    <div style={card}>
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
      {pct >= 90 && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b' }}>
          <strong>{pct >= 100 ? 'Monthly limit reached.' : 'Approaching monthly limit.'}</strong> Calls beyond your cap will return 429 until the 1st (UTC).
          {isStarter && <span> Upgrade to <strong>Growth (£499/mo, 10k calls)</strong> to keep going. We&rsquo;ll auto-revoke this free key once your paid key is active — your audit log and history stay attached to your email.</span>}
          <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isStarter && <button onClick={async () => {
              const r = await fetch('/api/v1/portal-upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'growth' }) });
              const j = await r.json();
              if (!r.ok) { alert(j.error || 'Could not start upgrade'); return; }
              window.location.href = j.url;
            }} style={btn}>Upgrade to Growth — £499/mo →</button>}
            {isStarter && <button onClick={async () => {
              const r = await fetch('/api/v1/portal-upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'enterprise' }) });
              const j = await r.json();
              if (!r.ok) { alert(j.error || 'Could not start upgrade'); return; }
              window.location.href = j.url;
            }} style={btnGhost}>Or Enterprise — £1,999/mo</button>}
            {!isStarter && <Link href="/for-business#buy" style={btn}>Upgrade tier →</Link>}
          </div>
        </div>
      )}
      {k.last_used_at && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Last used {new Date(k.last_used_at).toLocaleString('en-GB')}</div>}

      {/* Per-key settings */}
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 13 }}>
            <strong>IP allow-list</strong> {isStarter ? <span style={{ color: '#94a3b8', fontSize: 12 }}> (Growth + Enterprise only)</span> : (k.allowed_ips && k.allowed_ips.length > 0 ? <span style={{ color: '#0f172a' }}> · {k.allowed_ips.length} address{k.allowed_ips.length > 1 ? 'es' : ''}</span> : <span style={{ color: '#94a3b8' }}> · not set (all IPs allowed)</span>)}
          </div>
          {!isStarter && <button onClick={() => setEditingIps((v) => !v)} style={btnGhost}>{editingIps ? 'Cancel' : 'Edit'}</button>}
        </div>
        {editingIps && !isStarter && (
          <div style={{ display: 'grid', gap: 8 }}>
            <input value={ipInput} onChange={(e) => setIpInput(e.target.value)} placeholder="203.0.113.42, 198.51.100.1" style={inputStyle} />
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Comma-separated. Calls from any other IP will be rejected with 403. Leave empty to disable.</p>
            <div><button onClick={saveIps} style={btn}>Save</button></div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 13 }}><strong>Weekly email digest</strong> · Mondays 09:00 UTC summary of usage + errors</div>
          <button onClick={toggleDigest} style={btnGhost}>{k.weekly_digest_opt_in === false ? 'Off · click to turn on' : 'On · click to turn off'}</button>
        </div>
      </div>
    </div>
  );
}

function MembersTab({ data, token, email, onChange }: { data: MembersData | null; token: string; email: string; onChange: () => void }) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('viewer');
  if (!data) return <p style={{ color: '#64748b' }}>Loading…</p>;
  const isAdmin = data.your_role === 'admin';
  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch('/api/v1/portal-members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'invite', member_email: inviteEmail, role: inviteRole }) });
    const j = await r.json();
    if (!r.ok) { alert(j.error || 'Failed'); return; }
    setInviteEmail('');
    onChange();
  }
  async function changeRole(memberEmail: string, role: 'admin' | 'viewer') {
    await fetch('/api/v1/portal-members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'role', member_email: memberEmail, role }) });
    onChange();
  }
  async function remove(memberEmail: string) {
    if (!confirm(`Remove ${memberEmail} from this account?`)) return;
    await fetch('/api/v1/portal-members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'remove', member_email: memberEmail }) });
    onChange();
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <h3 style={sectionTitle}>Account owner</h3>
        <p style={{ color: '#475569', fontSize: 14, margin: '8px 0' }}>Owner: <strong>{data.owner}</strong></p>
        <p style={{ color: '#475569', fontSize: 14, margin: '8px 0' }}>Your role: <span style={{ ...badge, background: isAdmin ? '#d1fae5' : '#dbeafe', color: isAdmin ? '#065f46' : '#1e40af' }}>{data.your_role}</span></p>
      </div>
      {isAdmin && (
        <form onSubmit={invite} style={{ ...card, display: 'grid', gap: 10 }}>
          <h3 style={sectionTitle}>Invite a teammate</h3>
          <p style={{ color: '#475569', fontSize: 13, margin: 0 }}>They&rsquo;ll receive an email and can sign in to this portal with their work email. Viewers can read; admins can manage keys, webhooks, members.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com" style={{ ...inputStyle, flex: 1, minWidth: 220 }} />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)} style={selectStyle}>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" style={btn}>Invite</button>
          </div>
        </form>
      )}
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <h3 style={{ ...sectionTitle, padding: '14px 20px 0' }}>Members ({data.members.length + 1})</h3>
        <table style={{ ...tableStyle, marginTop: 10 }}>
          <thead><tr style={trHead}><th style={th}>Email</th><th style={th}>Role</th><th style={th}>Status</th><th style={th}>Invited by</th><th style={th}></th></tr></thead>
          <tbody>
            <tr style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={td}><strong>{data.owner}</strong></td>
              <td style={td}><span style={{ ...badge, background: '#d1fae5', color: '#065f46' }}>owner</span></td>
              <td style={td}>—</td><td style={td}>—</td><td style={td}></td>
            </tr>
            {data.members.map((m) => (
              <tr key={m.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={td}>{m.member_email}</td>
                <td style={td}><span style={{ ...badge, background: m.role === 'admin' ? '#d1fae5' : '#dbeafe', color: m.role === 'admin' ? '#065f46' : '#1e40af' }}>{m.role}</span></td>
                <td style={td}>{m.accepted_at ? 'Accepted' : 'Pending'}</td>
                <td style={td}>{m.invited_by ?? '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  {isAdmin && (
                    <>
                      <button onClick={() => changeRole(m.member_email, m.role === 'admin' ? 'viewer' : 'admin')} style={btnGhost}>Make {m.role === 'admin' ? 'viewer' : 'admin'}</button>
                      {' '}
                      <button onClick={() => remove(m.member_email)} style={{ ...btn, background: '#b91c1c' }}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExplorerTab({ keys }: { keys: Key[] }) {
  const [apiKey, setApiKey] = useState('');
  const [scenario, setScenario] = useState('Ryanair cancelled my flight LGW-DUB six hours before departure with no replacement, refusing compensation. The flight was 1500km.');
  const [amount, setAmount] = useState('350');
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  async function send() {
    setRunning(true); setResponse(null); setErrorMsg(null); setStatusCode(null); setLatency(null);
    const t0 = Date.now();
    try {
      const r = await fetch('https://paybacker.co.uk/api/v1/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ scenario, amount: amount ? Number(amount) : undefined }),
      });
      setStatusCode(r.status);
      setLatency(Date.now() - t0);
      const j = await r.json();
      setResponse(j);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Network error');
    } finally { setRunning(false); }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={card}>
        <h3 style={sectionTitle}>API explorer</h3>
        <p style={{ color: '#475569', fontSize: 13, margin: '6px 0 12px' }}>
          Try <code style={inlineCode}>POST /v1/disputes</code> live with one of your own keys. Plaintext is held in your browser only — we never store it.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="pbk_xxxx_xxxx — paste your plaintext key here" style={inputStyle} />
          {keys.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
              Active key prefixes: {keys.map((k) => <code key={k.id} style={{ ...inlineCode, marginRight: 4 }}>{k.key_prefix}</code>)}
            </p>
          )}
          <textarea value={scenario} onChange={(e) => setScenario(e.target.value)} rows={3} style={{ ...inputStyle, fontFamily: 'inherit' }} placeholder="Describe the dispute scenario in plain English (≥10 chars)" />
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount in GBP (optional)" style={inputStyle} />
          <div><button onClick={send} disabled={running || !apiKey || scenario.length < 10} style={btn}>{running ? 'Sending…' : 'Send POST /v1/disputes →'}</button></div>
        </div>
      </div>
      {errorMsg && <p style={{ color: '#b91c1c' }}>{errorMsg}</p>}
      {response && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={sectionTitle}>Response</h3>
            <div style={{ fontSize: 12, color: '#64748b' }}>{statusCode != null && <span style={statusBadge(statusCode)}>HTTP {statusCode}</span>}{' · '}{latency != null && `${latency}ms`}</div>
          </div>
          <pre style={{ background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, overflow: 'auto', fontSize: 12, lineHeight: 1.55, fontFamily: 'ui-monospace, Menlo, monospace' }}>{JSON.stringify(response, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function UsageTab({ daily, onExport }: { daily: DailyUsage[]; onExport: () => void }) {
  const total = daily.reduce((a, d) => a + d.ok + d.err, 0);
  const totalErr = daily.reduce((a, d) => a + d.err, 0);
  const errRate = total > 0 ? (totalErr / total) * 100 : 0;
  const max = Math.max(1, ...daily.map((d) => d.ok + d.err));
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={sectionTitle}>Last 30 days</h3>
        <button onClick={onExport} style={btnGhost}>Export CSV</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 12 }}>
        <Mini label="Total calls" value={total.toLocaleString()} />
        <Mini label="Errors" value={totalErr.toLocaleString()} />
        <Mini label="Error rate" value={`${errRate.toFixed(1)}%`} />
      </div>
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'flex-end', gap: 4, height: 120, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
        {daily.length === 0 ? (
          <div style={{ flex: 1, color: '#94a3b8', alignSelf: 'center', textAlign: 'center', fontSize: 13 }}>No traffic yet — make your first call.</div>
        ) : daily.map((d) => {
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
        <span>{daily[0]?.day ?? ''}</span><span>today</span>
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#64748b', marginTop: 12 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#059669', borderRadius: 2, marginRight: 6 }} />OK (2xx)</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#dc2626', borderRadius: 2, marginRight: 6 }} />Errors (4xx/5xx)</span>
      </div>
    </div>
  );
}

function ActivityTab({ usage, keys, onOpen }: { usage: UsageRow[]; keys: Key[]; onOpen: (row: UsageRow) => void }) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'err'>('all');
  const [keyFilter, setKeyFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    return usage.filter((u) => {
      if (statusFilter === 'ok' && u.status_code >= 400) return false;
      if (statusFilter === 'err' && u.status_code < 400) return false;
      if (keyFilter !== 'all' && u.key_id !== keyFilter) return false;
      if (search && !(u.endpoint.includes(search) || (u.error_code ?? '').includes(search) || (u.scenario_kind ?? '').includes(search))) return false;
      return true;
    });
  }, [usage, statusFilter, keyFilter, search]);
  const keyName = (id: string) => keys.find((k) => k.id === id)?.key_prefix ?? id.slice(0, 8);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} style={selectStyle}>
          <option value="all">All statuses</option>
          <option value="ok">2xx only</option>
          <option value="err">4xx / 5xx only</option>
        </select>
        <select value={keyFilter} onChange={(e) => setKeyFilter(e.target.value)} style={selectStyle}>
          <option value="all">All keys</option>
          {keys.map((k) => <option key={k.id} value={k.id}>{k.key_prefix} — {k.name}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search endpoint / error / scenario" style={{ ...inputStyle, padding: '8px 10px', fontSize: 13, flex: 1, minWidth: 180 }} />
      </div>
      {filtered.length === 0 ? <p style={{ color: '#64748b' }}>No calls match.</p> : (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <table style={tableStyle}>
            <thead>
              <tr style={trHead}>
                <th style={th}>When</th><th style={th}>Key</th><th style={th}>Endpoint</th><th style={th}>Status</th><th style={th}>Latency</th><th style={th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => onOpen(u)} onKeyDown={(e) => e.key === 'Enter' && onOpen(u)}>
                  <td style={td}>{new Date(u.created_at).toLocaleString('en-GB')}</td>
                  <td style={td}><code style={inlineCode}>{keyName(u.key_id)}</code></td>
                  <td style={td}><code style={inlineCode}>{u.endpoint}</code></td>
                  <td style={td}><span style={statusBadge(u.status_code)}>{u.status_code}</span></td>
                  <td style={td}>{u.latency_ms != null ? `${u.latency_ms}ms` : '—'}</td>
                  <td style={{ ...td, color: '#64748b' }}>{u.error_code ?? u.scenario_kind ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Click any row for full details (IP, full UA, metadata).</p>
    </div>
  );
}

function WebhooksTab({ data, token, email, onChange, onOpen }: { data: WebhookData; token: string; email: string; onChange: () => void; onOpen: (r: Delivery) => void }) {
  const [url, setUrl] = useState('https://');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  async function create() {
    if (!/^https:\/\//.test(url) || selectedEvents.length === 0) {
      alert('https URL and at least one event required');
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch('/api/v1/portal-webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'create', url, description, events: selectedEvents }) });
      const j = await r.json();
      if (!r.ok) { alert(j.error || 'Failed'); return; }
      setCreatedSecret(j.signing_secret);
      setUrl('https://'); setDescription(''); setSelectedEvents([]);
      onChange();
    } finally { setSubmitting(false); }
  }
  async function toggle(id: string, isActive: boolean) {
    await fetch('/api/v1/portal-webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'update', id, is_active: !isActive }) });
    onChange();
  }
  async function del(id: string) {
    if (!confirm('Delete this webhook? Deliveries history is retained.')) return;
    await fetch('/api/v1/portal-webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'delete', id }) });
    onChange();
  }
  async function test(id: string) {
    const r = await fetch('/api/v1/portal-webhooks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, email, action: 'test', id }) });
    const j = await r.json();
    alert(j.ok ? `Test delivery succeeded · status ${j.status} · ${j.latency}ms` : `Test failed · ${j.status ?? 'no response'} · ${j.error ?? ''}`);
    onChange();
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {createdSecret && (
        <div style={{ background: '#fefce8', border: '1px solid #fde68a', padding: 16, borderRadius: 10 }}>
          <strong style={{ color: '#854d0e' }}>Signing secret — shown ONCE:</strong>
          <pre style={{ marginTop: 8, background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 13 }}>{createdSecret}</pre>
          <p style={{ margin: '8px 0 0', color: '#854d0e', fontSize: 13 }}>Use this to verify the <code style={inlineCode}>Paybacker-Signature</code> HMAC-SHA256 header on incoming events. Save it now.</p>
        </div>
      )}

      <div style={card}>
        <h3 style={sectionTitle}>Add a webhook</h3>
        <p style={{ color: '#475569', fontSize: 13, marginTop: 6 }}>POST endpoint. We send JSON with HMAC-SHA256 signature header. Failed deliveries are recorded; 5 consecutive failures auto-disable.</p>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-domain.com/paybacker-webhook" style={inputStyle} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" style={inputStyle} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.supported_events.map((ev) => (
              <label key={ev} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: selectedEvents.includes(ev) ? '#0f172a' : '#f1f5f9', color: selectedEvents.includes(ev) ? '#fff' : '#0f172a', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                <input type="checkbox" style={{ display: 'none' }} checked={selectedEvents.includes(ev)} onChange={(e) => setSelectedEvents(e.target.checked ? [...selectedEvents, ev] : selectedEvents.filter((x) => x !== ev))} />
                {ev}
              </label>
            ))}
          </div>
          <div><button onClick={create} disabled={submitting} style={btn}>{submitting ? 'Creating…' : 'Create webhook'}</button></div>
        </div>
      </div>

      {data.webhooks.length === 0 ? <p style={{ color: '#64748b' }}>No webhooks yet.</p> : data.webhooks.map((w) => (
        <div key={w.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{w.url}</div>
              {w.description && <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{w.description}</div>}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {w.events.map((ev) => <span key={ev} style={chip}>{ev}</span>)}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>{w.is_active ? <span style={{ color: '#059669' }}>● active</span> : <span style={{ color: '#94a3b8' }}>○ paused</span>}</span>
                {w.last_delivery_at && <span>Last delivery {new Date(w.last_delivery_at).toLocaleString('en-GB')} · status {w.last_delivery_status ?? '—'}</span>}
                {w.consecutive_failures > 0 && <span style={{ color: '#b91c1c' }}>{w.consecutive_failures} consecutive failures</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => test(w.id)} style={btnGhost}>Send test</button>
              <button onClick={() => toggle(w.id, w.is_active)} style={btnGhost}>{w.is_active ? 'Pause' : 'Resume'}</button>
              <button onClick={() => del(w.id)} style={{ ...btn, background: '#b91c1c' }}>Delete</button>
            </div>
          </div>
        </div>
      ))}

      {data.recent_deliveries.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <h3 style={{ ...sectionTitle, padding: '14px 20px 0' }}>Recent deliveries</h3>
          <table style={{ ...tableStyle, marginTop: 12 }}>
            <thead>
              <tr style={trHead}>
                <th style={th}>When</th><th style={th}>Event</th><th style={th}>Status</th><th style={th}>Latency</th><th style={th}>Attempt</th><th style={th}>Error</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_deliveries.map((d) => (
                <tr key={d.id} style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => onOpen(d)}>
                  <td style={td}>{new Date(d.created_at).toLocaleString('en-GB')}</td>
                  <td style={td}><code style={inlineCode}>{d.event}</code></td>
                  <td style={td}>{d.status_code != null ? <span style={statusBadge(d.status_code)}>{d.status_code}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                  <td style={td}>{d.latency_ms != null ? `${d.latency_ms}ms` : '—'}</td>
                  <td style={td}>{d.attempt}</td>
                  <td style={{ ...td, color: '#b91c1c' }}>{d.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditTab({ audit, keys, onOpen, onExport }: { audit: AuditRow[]; keys: Key[]; onOpen: (r: AuditRow) => void; onExport: () => void }) {
  const [actionFilter, setActionFilter] = useState<string>('all');
  const filtered = useMemo(() => audit.filter((a) => actionFilter === 'all' || a.action === actionFilter), [audit, actionFilter]);
  const keyPrefix = (id: string | null) => id ? (keys.find((k) => k.id === id)?.key_prefix ?? id.slice(0, 8)) : '—';
  if (audit.length === 0) return <p style={{ color: '#64748b' }}>No audit events yet.</p>;
  const allActions = Array.from(new Set(audit.map((a) => a.action)));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={selectStyle}>
          <option value="all">All actions</option>
          {allActions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        <button onClick={onExport} style={btnGhost}>Export CSV</button>
      </div>
      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <table style={tableStyle}>
          <thead><tr style={trHead}><th style={th}>When</th><th style={th}>Action</th><th style={th}>Actor</th><th style={th}>Key</th><th style={th}>IP</th><th style={th}>User agent</th></tr></thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={() => onOpen(a)}>
                <td style={td}>{new Date(a.created_at).toLocaleString('en-GB')}</td>
                <td style={td}><span style={actionBadge(a.action)}>{a.action.replace(/_/g, ' ')}</span></td>
                <td style={{ ...td, textTransform: 'capitalize' }}>{a.actor}</td>
                <td style={td}><code style={inlineCode}>{keyPrefix(a.key_id)}</code></td>
                <td style={{ ...td, color: '#64748b' }}>{a.ip_address ?? '—'}</td>
                <td style={{ ...td, color: '#64748b', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.user_agent ?? ''}>{shortenUA(a.user_agent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountTab({ email, keys }: { email: string; keys: Key[] }) {
  const [opening, setOpening] = useState(false);
  async function openBilling() {
    setOpening(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const r = await fetch('/api/v1/portal-billing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: params.get('token'), email }) });
      const j = await r.json();
      if (!r.ok) {
        if (j.upgrade_url) {
          alert(j.error);
          window.location.href = j.upgrade_url;
        } else {
          alert(j.error || 'Could not open billing');
        }
        return;
      }
      window.location.href = j.url;
    } finally { setOpening(false); }
  }
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
            <thead><tr style={trHead}><th style={th}>Name</th><th style={th}>Prefix</th><th style={th}>Tier</th><th style={th}>Issued</th><th style={th}>Status</th></tr></thead>
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
        <button onClick={openBilling} disabled={opening} style={btn}>{opening ? 'Opening…' : 'Open Stripe customer portal ↗'}</button>
        <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: 13 }}>Free Starter pilot? No subscription to manage. Upgrade at <Link href="/for-business" style={{ color: '#0f172a' }}>/for-business</Link>.</p>
      </div>
      <div style={card}>
        <h3 style={sectionTitle}>Security &amp; data handling</h3>
        <ul style={{ paddingLeft: 18, color: '#475569', lineHeight: 1.7, margin: '8px 0' }}>
          <li>API keys are hashed with SHA-256. Plaintext shown once via single-use 24h reveal link, never stored after first view.</li>
          <li>Request bodies are not retained. We log only endpoint, status, latency, and an optional coarse <code style={inlineCode}>scenario_kind</code>.</li>
          <li>Portal sign-in is passwordless via 30-min single-use email links; mutating actions burn the token.</li>
          <li>Every key action and login attempt is appended to the immutable audit log on this page.</li>
          <li>Webhooks signed with HMAC-SHA256; signing secret shown once at creation. 5 consecutive failures auto-disable.</li>
          <li>Data residency: EU-West (Supabase). Backups: daily, 7-day retention.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Drawer (drill-down) ──────────────────────────────────────────────────

function Drawer({ drawer, keys, onClose }: { drawer: { kind: 'usage' | 'audit' | 'delivery'; row: any }; keys: Key[]; onClose: () => void }) {
  const k = (id: string) => keys.find((x) => x.id === id)?.key_prefix ?? id?.slice?.(0, 8) ?? '—';
  return (
    <div style={drawerOverlay} onClick={onClose}>
      <aside style={drawerSide} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{drawer.kind === 'usage' ? 'API call' : drawer.kind === 'audit' ? 'Audit event' : 'Webhook delivery'}</h2>
          <button onClick={onClose} style={btnGhost}>Close ×</button>
        </div>
        {drawer.kind === 'usage' && (
          <Field rows={[
            ['When', new Date(drawer.row.created_at).toLocaleString('en-GB')],
            ['Endpoint', drawer.row.endpoint],
            ['HTTP status', drawer.row.status_code],
            ['Latency', drawer.row.latency_ms != null ? `${drawer.row.latency_ms}ms` : '—'],
            ['Key prefix', k(drawer.row.key_id)],
            ['Scenario kind', drawer.row.scenario_kind ?? '—'],
            ['Error code', drawer.row.error_code ?? '—'],
          ]} />
        )}
        {drawer.kind === 'audit' && (
          <>
            <Field rows={[
              ['When', new Date(drawer.row.created_at).toLocaleString('en-GB')],
              ['Action', drawer.row.action.replace(/_/g, ' ')],
              ['Actor', drawer.row.actor],
              ['Key prefix', drawer.row.key_id ? k(drawer.row.key_id) : '—'],
              ['IP address', drawer.row.ip_address ?? '—'],
              ['User agent', drawer.row.user_agent ?? '—'],
            ]} />
            <h3 style={{ ...sectionTitle, marginTop: 16 }}>Metadata</h3>
            <pre style={drawerCode}>{JSON.stringify(drawer.row.metadata ?? {}, null, 2)}</pre>
          </>
        )}
        {drawer.kind === 'delivery' && (
          <Field rows={[
            ['When', new Date(drawer.row.created_at).toLocaleString('en-GB')],
            ['Event', drawer.row.event],
            ['HTTP status', drawer.row.status_code ?? '—'],
            ['Latency', drawer.row.latency_ms != null ? `${drawer.row.latency_ms}ms` : '—'],
            ['Attempt', drawer.row.attempt],
            ['Error', drawer.row.error ?? '—'],
          ]} />
        )}
      </aside>
    </div>
  );
}

function Field({ rows }: { rows: Array<[string, any]> }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 16px', margin: 0 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ color: '#64748b', fontSize: 13 }}>{k}</dt>
          <dd style={{ margin: 0, color: '#0f172a', fontSize: 13, wordBreak: 'break-all' }}>{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function labelFor(t: Tab) { return ({ keys: 'Keys', usage: 'Usage', activity: 'Recent calls', webhooks: 'Webhooks', members: 'Team', explorer: 'Explorer', audit: 'Audit log', account: 'Account' } as const)[t]; }

function SignIn() {
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  async function signInPassword(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      const r = await fetch('/api/v1/portal-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sign_in', email, password }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Sign-in failed'); return; }
      window.location.href = '/dashboard/api-keys';
    } finally { setSubmitting(false); }
  }
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setError(null);
    try {
      await fetch('/api/v1/portal-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      setLinkSent(true);
    } finally { setSubmitting(false); }
  }
  function startOAuth(provider: 'google' | 'microsoft') {
    window.location.href = `/api/v1/portal-oauth/${provider}`;
  }

  return (
    <main style={signinPage}>
      <div style={signinCard}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.01em' }}>Sign in to the API portal</h1>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={() => startOAuth('google')} style={{ ...btnGhost, flex: 1 }}>Continue with Google</button>
          <button onClick={() => startOAuth('microsoft')} style={{ ...btnGhost, flex: 1 }}>Continue with Microsoft</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: 12, margin: '16px 0' }}>
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} /> or <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 16 }}>
          <button onClick={() => { setMode('password'); setError(null); setLinkSent(false); }} style={mode === 'password' ? tabActive : tabBtn}>Password</button>
          <button onClick={() => { setMode('link'); setError(null); setLinkSent(false); }} style={mode === 'link' ? tabActive : tabBtn}>Email link</button>
        </div>

        {mode === 'password' ? (
          <form onSubmit={signInPassword} style={{ display: 'grid', gap: 10 }}>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" style={inputStyle} />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={inputStyle} />
            <button type="submit" disabled={submitting} style={btn}>{submitting ? 'Signing in…' : 'Sign in'}</button>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
              No password yet? <button type="button" onClick={() => setMode('link')} style={{ background: 'none', border: 0, padding: 0, color: '#0f172a', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Sign in with an email link</button> first — we&rsquo;ll let you set a password after.
            </p>
          </form>
        ) : (
          linkSent ? (
            <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', padding: 12, borderRadius: 8, color: '#065f46' }}>
              If you have access, a one-time link has been sent. Expires in 30 minutes.
            </div>
          ) : (
            <form onSubmit={sendMagicLink} style={{ display: 'grid', gap: 10 }}>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" style={inputStyle} />
              <button type="submit" disabled={submitting} style={btn}>{submitting ? 'Sending…' : 'Send sign-in link'}</button>
            </form>
          )
        )}

        {error && <p style={{ color: '#b91c1c', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}

        <p style={{ color: '#64748b', fontSize: 13, marginTop: 24 }}>No key yet? <Link href="/for-business" style={{ color: '#0f172a' }}>Get one →</Link></p>
      </div>
    </main>
  );
}

function SetPasswordBanner({ email, onDone }: { email: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true); setError(null);
    try {
      if (password !== confirm) { setError('Passwords do not match'); return; }
      const r = await fetch('/api/v1/portal-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set', password }) });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Failed'); return; }
      setOpen(false); setPassword(''); setConfirm('');
      onDone();
    } finally { setSaving(false); }
  }
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 14, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <strong style={{ color: '#92400e' }}>Set a password</strong>
        <div style={{ color: '#854d0e', fontSize: 13, marginTop: 2 }}>Skip the email-link round-trip on future visits. {email} will sign in with password or Google/Microsoft.</div>
      </div>
      {!open ? (
        <button onClick={() => setOpen(true)} style={btn}>Set password</button>
      ) : (
        <div style={{ display: 'grid', gap: 8, width: '100%', marginTop: 8 }}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password (12+ chars, upper, lower, number)" style={inputStyle} />
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" style={inputStyle} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saving} style={btn}>{saving ? 'Saving…' : 'Save password'}</button>
            <button onClick={() => { setOpen(false); setPassword(''); setConfirm(''); setError(null); }} style={btnGhost}>Cancel</button>
          </div>
          {error && <p style={{ color: '#b91c1c', margin: 0, fontSize: 13 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
function shortenUA(ua: string | null) { if (!ua) return '—'; const m = ua.match(/(Chrome|Safari|Firefox|Edg|curl|node|Postman|Insomnia)\/?[\d.]*/i); return m ? m[0] : ua.slice(0, 30); }
function statusBadge(code: number): React.CSSProperties { const isOk = code >= 200 && code < 300; const isClient = code >= 400 && code < 500; return { background: isOk ? '#d1fae5' : isClient ? '#fef3c7' : '#fee2e2', color: isOk ? '#065f46' : isClient ? '#92400e' : '#991b1b', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600 }; }
function actionBadge(action: string): React.CSSProperties { const palette: Record<string, [string, string]> = { key_created: ['#d1fae5', '#065f46'], key_revoked: ['#fee2e2', '#991b1b'], key_reissued: ['#fef3c7', '#92400e'], reveal_link_used: ['#dbeafe', '#1e40af'], portal_signin: ['#e0e7ff', '#3730a3'], login_link_requested: ['#f1f5f9', '#475569'], plan_changed: ['#cffafe', '#155e75'] }; const [bg, fg] = palette[action] ?? ['#f1f5f9', '#475569']; return { background: bg, color: fg, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }; }

const page: React.CSSProperties = { minHeight: '100vh', background: '#f8fafc', padding: 24, fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', color: '#0f172a' };
const shell: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' };
const signinPage: React.CSSProperties = { ...page, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const signinCard: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 32, maxWidth: 480, width: '100%', display: 'grid', gap: 12 };
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 };
const inputStyle: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '12px 14px', font: 'inherit', fontSize: 15 };
const selectStyle: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '8px 10px', background: '#fff', font: 'inherit', fontSize: 13 };
const btn: React.CSSProperties = { background: '#0f172a', color: '#fff', border: 0, padding: '8px 14px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13, textDecoration: 'none', display: 'inline-block' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: '#0f172a', border: '1px solid #cbd5e1', padding: '7px 13px', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 13 };
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
const chip: React.CSSProperties = { padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#0f172a', fontFamily: 'ui-monospace, Menlo, monospace' };
const drawerOverlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.4)', display: 'flex', justifyContent: 'flex-end', zIndex: 100 };
const drawerSide: React.CSSProperties = { width: 'min(520px, 90vw)', height: '100%', background: '#fff', boxShadow: '-12px 0 40px rgba(0,0,0,0.1)', padding: 24, overflow: 'auto' };
const drawerCode: React.CSSProperties = { background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', marginTop: 6 };

function Stat({ label, value, accent, hint }: { label: string; value: number | string; accent?: 'amber' | 'red'; hint?: string }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 24, fontWeight: 700, color: accent === 'amber' ? '#d97706' : accent === 'red' ? '#b91c1c' : '#0f172a' }}>{value}</div>
      {hint && <div style={{ marginTop: 2, fontSize: 11, color: '#94a3b8' }}>{hint}</div>}
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
