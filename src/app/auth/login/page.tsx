'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock } from 'lucide-react';
import { MarkNav } from '@/app/blog/_shared';
import '../../(marketing)/styles.css';
import '../auth.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState('');
  const [useMagicLink, setUseMagicLink] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect');
  const redirectTo = rawRedirect?.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : '/dashboard';

  const supabase = createClient();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(redirectTo);
    });
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(`Too many failed attempts. Please try again in ${remainingSeconds} seconds.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Persist the user's "stay signed in" choice so the dashboard
      // auto-signout timer (TODO) can honour it. Supabase's own session
      // cookie is long-lived by default, so today this flag is purely
      // a UX affordance + audit hook — the functional difference lands
      // in a follow-up PR that watches `pb_stay_signed_in=false` and
      // calls supabase.auth.signOut() after ~60 min of inactivity.
      try {
        localStorage.setItem('pb_stay_signed_in', stayLoggedIn ? 'true' : 'false');
      } catch {
        /* storage unavailable — default (stay signed in) applies */
      }

      router.push(redirectTo);
      router.refresh();
      setLoginAttempts(0); // Reset on success
    } catch (err: any) {
      setLoginAttempts(prev => {
        const next = prev + 1;
        if (next >= 5) {
          setLockoutUntil(Date.now() + 60000); // 1 minute lockout
          setError('Too many failed attempts. Please try again in 1 minute.');
        } else {
          setError(err.message || 'Failed to sign in');
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      });

      if (error) throw error;

      setMagicLinkSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="m-land-root">
      <MarkNav />
      <main className="auth-shell">
        <div className="auth-wrap">
          <Link href="/" className="auth-brand">
            <span className="pay">Pay</span>
            <span className="backer">backer</span>
          </Link>

          <div className="auth-head">
            <h1>Welcome back</h1>
            <p>Sign in to your Paybacker account.</p>
          </div>

          <div className="auth-card">
            {magicLinkSent ? (
              <div className="auth-sent">
                <div className="icon">
                  <Mail className="h-6 w-6" />
                </div>
                <h3>Check your email</h3>
                <p>
                  We sent a magic link to <strong>{email}</strong>. Click it to
                  finish signing in.
                </p>
                <Link className="back" href="/auth/login">Back to sign in</Link>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="oauth-btn"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                <div className="oauth-divider">
                  <span>Or continue with email</span>
                </div>

                <div className="seg-tabs">
                  <button
                    type="button"
                    onClick={() => setUseMagicLink(false)}
                    className={!useMagicLink ? 'is-active' : undefined}
                  >
                    Password
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseMagicLink(true)}
                    className={useMagicLink ? 'is-active' : undefined}
                  >
                    Magic Link
                  </button>
                </div>

                <form onSubmit={useMagicLink ? handleMagicLink : handleEmailLogin}>
                  <div className="field">
                    <label htmlFor="email">Email address</label>
                    <div className="field-control">
                      <Mail className="lead h-4 w-4" aria-hidden="true" />
                      <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {!useMagicLink && (
                    <>
                      <div className="field">
                        <label htmlFor="password">Password</label>
                        <div className="field-control">
                          <Lock className="lead h-4 w-4" aria-hidden="true" />
                          <input
                            id="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                          />
                        </div>
                        <div className="field-footer">
                          <Link href="/auth/reset-password">Forgot password?</Link>
                        </div>
                      </div>

                      <label className="stay-signed-in">
                        <input
                          type="checkbox"
                          checked={stayLoggedIn}
                          onChange={(e) => setStayLoggedIn(e.target.checked)}
                        />
                        <span>Keep me signed in on this device</span>
                      </label>
                    </>
                  )}

                  {error && (
                    <div className="form-error">
                      <div>{error}</div>
                      {lockoutUntil && Date.now() < lockoutUntil && (
                        <div style={{ marginTop: 6, fontSize: 13 }}>
                          Forgotten your password?{' '}
                          <Link href="/auth/reset-password" style={{ textDecoration: 'underline', fontWeight: 600 }}>
                            Reset it now
                          </Link>{' '}
                          or use a magic link instead.
                        </div>
                      )}
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="auth-submit">
                    {loading ? 'Please wait…' : useMagicLink ? 'Send magic link' : 'Sign in'}
                  </button>
                </form>

                <div className="auth-foot">
                  Don&apos;t have an account?{' '}
                  <Link
                    href={redirectTo !== '/dashboard' ? `/auth/signup?redirect=${encodeURIComponent(redirectTo)}` : '/auth/signup'}
                  >
                    Sign up
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
