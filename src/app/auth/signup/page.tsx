'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, User, Phone, Sparkles, CheckCircle2 } from 'lucide-react';
import { WAITLIST_MODE } from '@/lib/config';
import { capture } from '@/lib/posthog';

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
  const redirectTo = rawRedirect?.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : null;

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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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

        const destination = redirectTo
          ? `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}signup=1`
          : '/dashboard?signup=1';
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
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <Image src="/logo.png" alt="Paybacker" width={36} height={36} className="rounded-lg" />
            <span className="text-2xl font-bold text-white">
              Pay<span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">backer</span>
            </span>
          </Link>
          <h1 className="text-3xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Create your account</h1>
          <p className="text-slate-400">Start getting your money back today</p>
        </div>

        {/* Signup Form */}
        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl p-8 shadow-2xl">
          {verifyMode ? (
            <div className="text-center py-6">
              <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
              <p className="text-slate-400 text-sm mb-6">
                We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
                Click it to activate your account.
              </p>
              <Link href="/auth/login" className="text-mint-400 hover:text-mint-300 text-sm font-medium">
                Back to sign in
              </Link>
            </div>
          ) : (
          <form onSubmit={handleSignup} className="space-y-4">
            {/* First + Last name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">First name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full pl-9 pr-3 py-3 bg-navy-950 border border-navy-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                    placeholder="Paul"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Last name *</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-3 bg-navy-950 border border-navy-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                  placeholder="Smith"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email address *</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 bg-navy-950 border border-navy-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Mobile number
                <span className="text-slate-500 font-normal ml-1">(optional)</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 bg-navy-950 border border-navy-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                  placeholder="+44 7700 900000"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password *</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-4 py-3 bg-navy-950 border border-navy-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                  placeholder="••••••••"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Minimum 8 characters</p>
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>

          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm">
              Already have an account?{' '}
              <Link
                href={redirectTo ? `/auth/login?redirect=${encodeURIComponent(redirectTo)}` : '/auth/login'}
                className="text-mint-400 hover:text-mint-300 font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-navy-700/50">
            <p className="text-xs text-slate-500 text-center">
              By creating an account, you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
