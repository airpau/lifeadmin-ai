'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, User, Phone, CheckCircle2 } from 'lucide-react';
import { WAITLIST_MODE } from '@/lib/config';
import { capture } from '@/lib/posthog';
import { MarkNav } from '@/app/blog/_shared';
import '../../(marketing)/styles.css';
import '../auth.css';

export default function SignupPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifyMode, setVerifyMode] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const rawRedirect = searchParams.get('redirect');
  let redirectTo = rawRedirect?.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : null;

  // Homepage "Sign up free to open the full draft" flow — carry the
  // demo form intent straight into the dispute composer so the user
  // doesn't re-type what they just described. See HeroDemo in
  // src/app/preview/homepage/page.tsx for the source of these params.
  if (!redirectTo && searchParams.get('from') === 'homepage_demo') {
    const t = searchParams.get('type');
    const iss = searchParams.get('issue');
    const params = new URLSearchParams({ new: '1' });
    if (t) params.set('type', t);
    if (iss) params.set('issue', iss);
    redirectTo = `/dashboard/complaints?${params.toString()}`;
  }

  useEffect(() => {
    if (WAITLIST_MODE) {
      router.replace('/');
      return;
    }
    // Redirect to dashboard if already logged in
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(redirectTo || '/dashboard');
    });
    if (searchParams.get('verify') === 'true') setVerifyMode(true);
  }, [searchParams, router]);

  const handleGoogleSignup = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo || '/dashboard')}`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // AU-002: Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      setLoading(false);
      return;
    }

    // AU-002: Phone number validation
    if (mobile.trim() !== '') {
      const phoneRegex = /^(\+?[0-9\sT\-\(\)]{7,20})$/;
      if (!phoneRegex.test(mobile.trim())) {
        setError('Please enter a valid phone number, e.g. +44 7700 900000');
        setLoading(false);
        return;
      }
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            mobile_number: mobile.trim() || null,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      // If session is present, email confirmation is disabled — update profile then go to dashboard
      if (data.session) {
        // Read UTM from URL params first, then fall back to cookies set by middleware
        const getCookie = (name: string) => {
          const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
          return match ? decodeURIComponent(match[1]) : null;
        };
        const utmData: Record<string, string | null> = {
          utm_source: searchParams.get('utm_source') || getCookie('pb_utm_source'),
          utm_medium: searchParams.get('utm_medium') || getCookie('pb_utm_medium'),
          utm_campaign: searchParams.get('utm_campaign') || getCookie('pb_utm_campaign'),
          utm_content: searchParams.get('utm_content') || getCookie('pb_utm_content'),
          utm_term: searchParams.get('utm_term') || getCookie('pb_utm_term'),
          gclid: searchParams.get('gclid') || getCookie('pb_gclid'),
          fbclid: searchParams.get('fbclid') || getCookie('pb_fbclid'),
        };
        // Determine signup source
        const signupSource = utmData.gclid ? 'google_ads'
          : utmData.fbclid ? 'meta_ads'
          : utmData.utm_source || 'organic';
        // Filter out nulls
        const utmUpdate: Record<string, string> = { signup_source: signupSource };
        for (const [key, val] of Object.entries(utmData)) {
          if (val) utmUpdate[key] = val;
        }

        await supabase.from('profiles').update({
          full_name: fullName,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          mobile_number: mobile.trim() || null,
          onboarded_at: new Date().toISOString(),
          ...utmUpdate,
        }).eq('id', data.user!.id);

        // Log signup attribution snapshot
        const refCode = searchParams.get('ref') || localStorage.getItem('pb_ref');
        await supabase.from('signup_attribution').insert({
          user_id: data.user!.id,
          utm_source: utmData.utm_source || null,
          utm_medium: utmData.utm_medium || null,
          utm_campaign: utmData.utm_campaign || null,
          utm_content: utmData.utm_content || null,
          utm_term: utmData.utm_term || null,
          gclid: utmData.gclid || null,
          fbclid: utmData.fbclid || null,
          ref_code: refCode || null,
          landing_page: window.location.pathname,
        }).then(() => {});

        // Process referral if ref code present
        if (refCode && data.user) {
          fetch('/api/referrals/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referralCode: refCode, userId: data.user.id, email }),
          }).catch(() => {});
          localStorage.removeItem('pb_ref');
        }

        // Founding member: first 25 signups get Pro free for 30 days
        fetch('/api/founding-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {});

        // Fire Awin S2S lead tracking — must be awaited before navigation
        const awinRes = await fetch('/api/awin/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: data.user!.id, email }),
        }).then(r => r.json()).catch(() => ({ awc: '' }));
        const awinAwc = awinRes.awc || '';

        // Send welcome email (fire and forget)
        fetch('/api/auth/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, name: firstName.trim(), userId: data.user!.id }),
        }).catch(() => {});

        capture('user_signed_up', { email, referral: refCode || undefined, ...utmUpdate });

        // Store awc for fallback pixel — fired on dashboard (confirmation page)
        if (awinAwc) sessionStorage.setItem('awin_awc', awinAwc);
        sessionStorage.setItem('awin_ref', `signup-${data.user!.id}`);

        // Fresh signups land on the onboarding wizard (Connect bank → Scan
        // inbox → First win). Users who signed up via a ?redirect= param
        // get sent to that target instead so deep-links still work.
        const destination = redirectTo
          ? `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}signup=1`
          : '/onboarding?signup=1';
        router.push(destination);
        router.refresh();
      } else {
        capture('user_signup_verify', { email });
        router.push('/auth/signup?verify=true');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
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
            <h1>Create your account</h1>
            <p>Start getting your money back today.</p>
          </div>

          <div className="auth-card">
            {verifyMode ? (
              <div className="auth-sent">
                <div className="icon">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3>Check your email</h3>
                <p>
                  We sent a confirmation link to <strong>{email}</strong>. Click
                  it to activate your account.
                </p>
                <Link className="back" href="/auth/login">Back to sign in</Link>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignup}
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

                <form onSubmit={handleSignup}>
                  <div className="field-row">
                    <div className="field">
                      <label htmlFor="first-name">First name</label>
                      <div className="field-control">
                        <User className="lead h-4 w-4" aria-hidden="true" />
                        <input
                          id="first-name"
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Paul"
                          autoComplete="given-name"
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor="last-name">Last name</label>
                      <div className="field-control">
                        <input
                          id="last-name"
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Smith"
                          autoComplete="family-name"
                          className="no-icon"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="signup-email">Email address</label>
                    <div className="field-control">
                      <Mail className="lead h-4 w-4" aria-hidden="true" />
                      <input
                        id="signup-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="signup-mobile">
                      Mobile number <span className="optional">(optional)</span>
                    </label>
                    <div className="field-control">
                      <Phone className="lead h-4 w-4" aria-hidden="true" />
                      <input
                        id="signup-mobile"
                        type="tel"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="+44 7700 900000"
                        autoComplete="tel"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="signup-password">Password</label>
                    <div className="field-control">
                      <Lock className="lead h-4 w-4" aria-hidden="true" />
                      <input
                        id="signup-password"
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>
                    <p className="hint">Minimum 8 characters.</p>
                  </div>

                  {error && <div className="form-error">{error}</div>}

                  <button type="submit" disabled={loading} className="auth-submit">
                    {loading ? 'Creating account…' : 'Create account'}
                  </button>
                </form>

                <div className="auth-foot">
                  Already have an account?{' '}
                  <Link
                    href={redirectTo ? `/auth/login?redirect=${encodeURIComponent(redirectTo)}` : '/auth/login'}
                  >
                    Sign in
                  </Link>
                </div>

                <div className="auth-finepr">
                  By creating an account, you agree to our{' '}
                  <Link href="/terms-of-service">Terms of Service</Link> and{' '}
                  <Link href="/privacy-policy">Privacy Policy</Link>.
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
