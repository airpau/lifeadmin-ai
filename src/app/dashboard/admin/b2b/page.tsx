'use client';

/**
 * /dashboard/admin/b2b — founder-only B2B operations console.
 *
 * Two sections:
 *   1. Waitlist signups — triage, status flips, notes
 *   2. API keys — mint, revoke, see this-month usage
 *
 * Auth is enforced server-side by the underlying /api/admin/b2b-*
 * endpoints. This page just renders for any authed user — non-admin
 * fetches will get 403 and the lists stay empty, which is fine.
 *
 * Lives under /dashboard/admin/b2b so the existing dashboard shell
 * (sidebar, NotificationBell, banner stack) wraps it for free.
 */

import { useEffect, useState } from 'react';

interface Signup {
  id: string;
  name: string;
  work_email: string;
  company: string;
  role: string | null;
  expected_volume: string;
  use_case: string;
  status: 'new' | 'qualified' | 'contacted' | 'rejected' | 'converted' | 'checkout_started' | 'checkout_abandoned';
  intended_tier: string | null;
  notes: string | null;
  utm_source: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  tier: 'starter' | 'growth' | 'enterprise';
  monthly_limit: number;
  monthly_used: number;
  owner_email: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  notes: string | null;
  created_at: string;
}

const STATUSES: Signup['status'][] = ['new', 'qualified', 'contacted', 'rejected', 'converted', 'checkout_started', 'checkout_abandoned'];

const STATUS_BADGE: Record<Signup['status'], { label: string; bg: string; fg: string }> = {
  new: { label: 'New', bg: '#e0e7ff', fg: '#3730a3' },
  qualified: { label: 'Qualified', bg: '#dbeafe', fg: '#1e40af' },
  contacted: { label: 'Contacted', bg: '#fef3c7', fg: '#92400e' },
  rejected: { label: 'Rejected', bg: '#fee2e2', fg: '#991b1b' },
  converted: { label: '🎉 Converted', bg: '#d1fae5', fg: '#065f46' },
  checkout_started: { label: '🛒 Checkout started', bg: '#fef3c7', fg: '#92400e' },
  checkout_abandoned: { label: '🛒💀 Abandoned', bg: '#fee2e2', fg: '#991b1b' },
};

export default function AdminB2BPage() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mintedToken, setMintedToken] = useState<{ name: string; plaintext: string } | null>(null);

  // Mint form
  const [mintName, setMintName] = useState('');
  const [mintTier, setMintTier] = useState<ApiKey['tier']>('starter');
  const [mintEmail, setMintEmail] = useState('');
  const [minting, setMinting] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [w, k] = await Promise.all([
        fetch('/api/admin/b2b-waitlist').then((r) => r.json()),
        fetch('/api/admin/b2b-keys').then((r) => r.json()),
      ]);
      if (w.error || k.error) throw new Error(w.error || k.error);
      setSignups(w.signups ?? []);
      setKeys(k.keys ?? []);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const updateStatus = async (id: string, status: Signup['status']) => {
    await fetch('/api/admin/b2b-waitlist', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    await refresh();
  };

  const mintKey = async () => {
    if (!mintName.trim()) return;
    setMinting(true);
    try {
      const res = await fetch('/api/admin/b2b-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mintName.trim(),
          tier: mintTier,
          owner_email: mintEmail || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Mint failed');
      setMintedToken({ name: data.key.name, plaintext: data.plaintext });
      setMintName('');
      setMintEmail('');
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Mint failed');
    } finally {
      setMinting(false);
    }
  };

  const revokeKey = async (id: string) => {
    if (!confirm('Revoke this key? Calls using it will start failing immediately.')) return;
    await fetch('/api/admin/b2b-keys', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'revoke' }),
    });
    await refresh();
  };

  const stats = {
    total: signups.length,
    qualified: signups.filter((s) => ['qualified', 'contacted', 'converted'].includes(s.status)).length,
    new: signups.filter((s) => s.status === 'new').length,
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">B2B Operations</h1>
        <p className="text-sm text-slate-500 mt-1">
          UK Consumer Rights API — waitlist triage and key management.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Signups" value={stats.total} />
        <Stat label="Qualified" value={stats.qualified} accent="green" />
        <Stat label="New (need triage)" value={stats.new} accent={stats.new > 0 ? 'amber' : undefined} />
      </div>

      {/* Decision tracker */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
        <strong>Decision rule:</strong> 10+ qualified signups in 30 days post-launch → green-light B2B build. &lt;10 → archive page.
        {' '}
        Currently <strong>{stats.qualified}/10 qualified</strong>.
      </div>

      {/* Waitlist */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Waitlist signups</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">Loading…</p>
        ) : signups.length === 0 ? (
          <p className="text-slate-500 text-sm">No signups yet. Once /for-business is live, submissions land here.</p>
        ) : (
          <div className="space-y-3">
            {signups.map((s) => (
              <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{s.name}</span>
                      <span className="text-slate-500">@</span>
                      <span className="font-medium text-slate-900">{s.company}</span>
                      {s.role && <span className="text-xs text-slate-500">({s.role})</span>}
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: STATUS_BADGE[s.status]?.bg, color: STATUS_BADGE[s.status]?.fg }}
                      >
                        {STATUS_BADGE[s.status]?.label ?? s.status}
                      </span>
                      {s.intended_tier && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                          {s.intended_tier}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <a href={`mailto:${s.work_email}`} className="text-emerald-600 hover:underline">
                        {s.work_email}
                      </a>
                      {s.expected_volume && <>{' · '}Volume: <span className="font-medium text-slate-700">{s.expected_volume}</span></>}
                      {' · '}
                      {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {s.utm_source && ` · src:${s.utm_source}`}
                    </p>
                    <p className="text-sm text-slate-700 mt-2 leading-relaxed">{s.use_case}</p>
                  </div>
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    <select
                      value={s.status}
                      onChange={(e) => updateStatus(s.id, e.target.value as Signup['status'])}
                      className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Keys */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-3">API keys</h2>

        {/* Just-minted plaintext display — show once */}
        {mintedToken && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-4 mb-4">
            <p className="text-sm font-semibold text-emerald-900">Key minted: {mintedToken.name}</p>
            <p className="text-xs text-emerald-700 mt-1">
              Save this now. We do not store the plaintext and cannot show it again.
            </p>
            <code className="block bg-white border border-emerald-200 rounded mt-2 p-3 text-sm font-mono break-all text-slate-900">
              {mintedToken.plaintext}
            </code>
            <button
              onClick={() => setMintedToken(null)}
              className="text-xs text-emerald-700 hover:text-emerald-900 mt-2"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Mint form */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Mint a new key</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Name (e.g. Acme Production)"
              value={mintName}
              onChange={(e) => setMintName(e.target.value)}
              className="border border-slate-300 rounded px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="Owner email (optional)"
              value={mintEmail}
              onChange={(e) => setMintEmail(e.target.value)}
              className="border border-slate-300 rounded px-3 py-2 text-sm"
            />
            <select
              value={mintTier}
              onChange={(e) => setMintTier(e.target.value as ApiKey['tier'])}
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
            >
              <option value="starter">Starter — 1,000 / mo</option>
              <option value="growth">Growth — 10,000 / mo</option>
              <option value="enterprise">Enterprise — 100,000 / mo</option>
            </select>
            <button
              onClick={mintKey}
              disabled={minting || !mintName.trim()}
              className="bg-slate-900 text-white text-sm font-semibold rounded px-4 py-2 disabled:opacity-50"
            >
              {minting ? 'Minting…' : 'Mint key'}
            </button>
          </div>
        </div>

        {/* Existing keys */}
        {keys.length === 0 ? (
          <p className="text-slate-500 text-sm">No keys minted yet.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Prefix</th>
                  <th className="text-left px-4 py-2">Tier</th>
                  <th className="text-left px-4 py-2">Usage</th>
                  <th className="text-left px-4 py-2">Last used</th>
                  <th className="text-right px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const pct = (k.monthly_used / k.monthly_limit) * 100;
                  return (
                    <tr key={k.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{k.name}</div>
                        {k.owner_email && (
                          <div className="text-xs text-slate-500">{k.owner_email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">pbk_{k.key_prefix}_…</td>
                      <td className="px-4 py-3 capitalize">{k.tier}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-700">
                          {k.monthly_used.toLocaleString()} / {k.monthly_limit.toLocaleString()}
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {k.last_used_at
                          ? new Date(k.last_used_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {k.revoked_at ? (
                          <span className="text-xs text-slate-400">Revoked</span>
                        ) : (
                          <button
                            onClick={() => revokeKey(k.id)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            Revoke
                          </button>
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
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: 'green' | 'amber' }) {
  const tone =
    accent === 'green'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : accent === 'amber'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-slate-900 bg-white border-slate-200';
  return (
    <div className={`border rounded-lg p-4 ${tone}`}>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}
