'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { MarkNav } from '@/app/blog/_shared';
import '../../(marketing)/styles.css';
import '../auth.css';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.includes('@')) {
      setError('Enter the email you signed up with.');
      return;
    }
    setLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://paybacker.co.uk';
      const { error: supaErr } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${origin}/auth/update-password`,
      });
      if (supaErr) {
        setError(supaErr.message || 'Could not send reset email. Try again shortly.');
      } else {
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-land-root">
      <MarkNav />
      <main className="auth-shell">
        <div className="auth-wrap" style={{ maxWidth: 440, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'var(--accent-mint-wash, #DCFCE7)',
              margin: '0 auto 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
          >
            🔑
          </div>

          <div className="auth-head">
            <h1>Forgot your password?</h1>
            <p>
              {sent
                ? 'Check your inbox — we\'ve sent a reset link. It expires in 60 minutes.'
                : 'Type the email you signed up with. We\'ll send a reset link valid for 60 minutes.'}
            </p>
          </div>

          {!sent && (
            <div className="auth-card" style={{ textAlign: 'left' }}>
              <form onSubmit={handleSubmit}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    marginBottom: 6,
                  }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@email.com"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: 14,
                    border: '1px solid var(--divider)',
                    borderRadius: 10,
                    fontFamily: 'inherit',
                    boxSizing: 'border-box',
                    background: '#fff',
                    marginBottom: 14,
                  }}
                  required
                />
                {error && <div className="form-error" style={{ marginBottom: 10 }}>{error}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  className="auth-submit"
                  style={{
                    width: '100%',
                    padding: '13px',
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 10,
                  }}
                >
                  {loading ? 'Sending…' : 'Send reset link →'}
                </button>
              </form>
            </div>
          )}

          {sent && (
            <div
              className="auth-card"
              style={{
                textAlign: 'left',
                background: 'var(--accent-mint-wash, #DCFCE7)',
                borderColor: '#86EFAC',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 24 }}>📬</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#065F46' }}>
                  <strong>Reset email sent to {email}.</strong>
                  <br />
                  Didn't arrive? Check your spam folder, or{' '}
                  <button
                    onClick={() => setSent(false)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#065F46',
                      textDecoration: 'underline',
                      padding: 0,
                      font: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    try a different email
                  </button>
                  .
                </div>
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: 24,
              display: 'flex',
              gap: 24,
              justifyContent: 'center',
              fontSize: 13,
              flexWrap: 'wrap',
            }}
          >
            <Link href="/auth/login" style={{ color: 'var(--accent-mint-deep)', fontWeight: 600, textDecoration: 'none' }}>
              ← Back to sign in
            </Link>
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <a
              href="mailto:support@paybacker.co.uk"
              style={{ color: 'var(--text-secondary)', fontWeight: 500, textDecoration: 'none' }}
            >
              Contact support
            </a>
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 40, lineHeight: 1.6 }}>
            Can't remember which email you used? Email{' '}
            <a href="mailto:support@paybacker.co.uk" style={{ color: 'var(--text-secondary)' }}>
              support@paybacker.co.uk
            </a>{' '}
            and we'll help you back in.
          </p>
        </div>
      </main>
    </div>
  );
}
