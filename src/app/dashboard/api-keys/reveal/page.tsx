'use client';

/**
 * /dashboard/api-keys/reveal — one-time plaintext key reveal page.
 *
 * The customer arrives via a one-shot link emailed at provisioning.
 * On first load we ask the API for the plaintext; the API returns it
 * and burns the token. We render the plaintext clearly with a copy
 * button and a "I've saved it" confirmation.
 *
 * On second load (back button, refresh, archived email replay) the
 * API returns 410 and we tell them to use Re-issue from the portal.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function RevealKeyPage() {
  const params = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');

  const [loading, setLoading] = useState(true);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token || !email) { setError('Missing token or email.'); setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`/api/v1/key-reveal?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`);
        const j = await r.json();
        if (!r.ok) {
          setError(j.error || 'Could not reveal key.');
        } else {
          setPlaintext(j.plaintext);
        }
      } catch {
        setError('Network error. Refresh in 30 seconds; if still failing, sign in to the portal and re-issue.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token, email]);

  return (
    <main style={page}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-0.01em' }}>Your Paybacker API key</h1>
        <p style={{ color: '#475569' }}>
          For <strong>{email ?? '—'}</strong>. This key is shown once. Save it now.
        </p>

        {loading && <p style={{ color: '#64748b' }}>Decrypting…</p>}

        {!loading && error && (
          <div style={errorBox}>
            <strong>Couldn&rsquo;t reveal the key.</strong>
            <p style={{ margin: '6px 0 0' }}>{error}</p>
            <p style={{ margin: '12px 0 0' }}>
              <Link href="/dashboard/api-keys" style={btn}>Sign in &amp; re-issue</Link>
            </p>
          </div>
        )}

        {!loading && plaintext && (
          <>
            <pre style={key}>{plaintext}</pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(plaintext);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={btn}
            >
              {copied ? '✓ Copied' : 'Copy to clipboard'}
            </button>

            <div style={tipBox}>
              <strong>Save it now.</strong> Push it to your secret manager
              (1Password, AWS Secrets Manager, Vault, Doppler) immediately.
              We never store the plaintext — only a hash. If you lose this
              key, sign in to the <Link href="/dashboard/api-keys" style={{ color: '#0f172a', fontWeight: 600 }}>portal</Link> and click <strong>Re-issue</strong>.
            </div>

            <h3 style={{ marginTop: 24, fontSize: 14, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quick test</h3>
            <pre style={code}>{`curl -X POST https://paybacker.co.uk/api/v1/disputes \\
  -H "Authorization: Bearer ${plaintext}" \\
  -H "Content-Type: application/json" \\
  -d '{"scenario":"Ryanair cancelled my flight 6h before departure, refusing compensation","amount":350}'`}</pre>

            <p style={{ marginTop: 24, fontSize: 14, color: '#64748b' }}>
              Next: <Link href="/for-business/docs" style={{ color: '#0f172a' }}>read the docs →</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}

const page: React.CSSProperties = {
  minHeight: '100vh', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif', color: '#0f172a',
};
const card: React.CSSProperties = {
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 32, maxWidth: 640, width: '100%', display: 'grid', gap: 12,
};
const key: React.CSSProperties = {
  background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8, overflow: 'auto',
  fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 14, wordBreak: 'break-all', whiteSpace: 'pre-wrap',
};
const code: React.CSSProperties = { ...key, fontSize: 12, lineHeight: 1.6 };
const btn: React.CSSProperties = {
  background: '#0f172a', color: '#fff', border: 0, padding: '10px 16px', borderRadius: 8,
  fontWeight: 600, cursor: 'pointer', fontSize: 14, textDecoration: 'none', display: 'inline-block',
};
const tipBox: React.CSSProperties = {
  background: '#fefce8', border: '1px solid #fde68a', padding: '12px 16px', borderRadius: 8, color: '#713f12', fontSize: 14,
};
const errorBox: React.CSSProperties = {
  background: '#fef2f2', border: '1px solid #fecaca', padding: '14px 18px', borderRadius: 8, color: '#7f1d1d',
};
