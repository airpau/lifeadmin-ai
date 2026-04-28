'use client';

/**
 * /dashboard/api-keys — B2B customer self-serve portal.
 *
 * Token-gated (not Supabase auth) — link is delivered by email via
 * /api/v1/portal-login. Customer can:
 *   - See their key prefix, tier, monthly usage, last-used timestamp
 *   - Re-issue (revoke + mint replacement, plaintext shown ONCE)
 *   - Revoke a key
 *
 * The plaintext key is never re-displayed for an existing key — that
 * is the whole point of hashing. To recover from a lost key, customers
 * use Re-issue: it revokes the old key and shows the new plaintext
 * once on this page.
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

export const dynamic = 'force-dynamic';

export default function ApiKeysPortalPage() {
  const params = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');

  const [requestEmail, setRequestEmail] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reissued, setReissued] = useState<{ id: string; plaintext: string } | null>(null);

  async function load() {
    if (!token || !email) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/portal-keys?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not load keys');
      setKeys(j.keys ?? []);
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
    if (!confirm('Revoke this key? Calls will fail immediately.')) return;
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
      <main style={pageWrap}>
        <div style={card}>
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
              <input
                type="email"
                required
                value={requestEmail}
                onChange={(e) => setRequestEmail(e.target.value)}
                placeholder="you@company.com"
                style={input}
              />
              <button type="submit" disabled={requesting} style={btn}>{requesting ? 'Sending…' : 'Send sign-in link'}</button>
            </form>
          )}
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 24 }}>
            Don&rsquo;t have a key yet? <Link href="/for-business" style={{ color: '#0f172a' }}>Get one →</Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={pageWrap}>
      <div style={{ ...card, maxWidth: 720 }}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.01em' }}>Your API keys</h1>
        <p style={{ color: '#475569' }}>Signed in as <strong>{email}</strong></p>

        {reissued && (
          <div style={{ background: '#fefce8', border: '1px solid #fde68a', padding: 16, borderRadius: 8, marginTop: 16 }}>
            <strong style={{ color: '#854d0e' }}>New key — copy now, it is shown ONCE:</strong>
            <pre style={{ marginTop: 8, background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 6, overflow: 'auto', fontSize: 13 }}>{reissued.plaintext}</pre>
          </div>
        )}

        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#b91c1c' }}>{error}</p>}

        {keys?.length === 0 && (
          <p style={{ color: '#64748b' }}>No active keys for this email. <Link href="/for-business">Get one →</Link></p>
        )}

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {keys?.map((k) => {
            const pct = k.monthly_limit > 0 ? Math.min(100, Math.round((k.monthly_used / k.monthly_limit) * 100)) : 0;
            return (
              <div key={k.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{k.name}</div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
                      Prefix <code style={codeInline}>{k.key_prefix}</code> · Tier <strong style={{ color: '#0f172a' }}>{k.tier}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => reissue(k.id)} style={{ ...btn, background: '#0f172a' }}>Re-issue</button>
                    <button onClick={() => revoke(k.id)} style={{ ...btn, background: '#b91c1c' }}>Revoke</button>
                  </div>
                </div>
                <div style={{ marginTop: 12, fontSize: 13, color: '#64748b' }}>
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

        <p style={{ color: '#64748b', fontSize: 13, marginTop: 24 }}>
          <Link href="/for-business/docs" style={{ color: '#0f172a' }}>API docs</Link> ·
          {' '}<Link href="/for-business/coverage" style={{ color: '#0f172a' }}>Statute coverage</Link> ·
          {' '}<a href="mailto:business@paybacker.co.uk" style={{ color: '#0f172a' }}>business@paybacker.co.uk</a>
        </p>
      </div>
    </main>
  );
}

const pageWrap: React.CSSProperties = {
  minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', color: '#0f172a',
};
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 32, maxWidth: 480, width: '100%', display: 'grid', gap: 12,
};
const input: React.CSSProperties = {
  border: '1px solid #cbd5e1', borderRadius: 8, padding: '12px 14px', font: 'inherit', fontSize: 15,
};
const btn: React.CSSProperties = {
  background: '#0f172a', color: '#fff', border: 0, padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14,
};
const codeInline: React.CSSProperties = {
  background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13,
};
