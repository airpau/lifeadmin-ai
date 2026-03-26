'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState('');
  const [useMagicLink, setUseMagicLink] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const supabase = createClient();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace('/dashboard');
    });
  }, []);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
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
          emailRedirectTo: `${window.location.origin}/auth/callback`,
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
          <h1 className="text-3xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Welcome back</h1>
          <p className="text-slate-400">Sign in to your account</p>
        </div>

        {/* Login Form */}
        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl p-8 shadow-2xl">
          {magicLinkSent ? (
            <div className="text-center py-8">
              <Mail className="h-16 w-16 text-mint-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Check your email</h3>
              <p className="text-slate-400">We sent you a magic link to {email}</p>
            </div>
          ) : (
            <>
              {/* Toggle */}
              <div className="flex gap-2 mb-6 bg-navy-950 rounded-lg p-1">
                <button
                  onClick={() => setUseMagicLink(false)}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                    !useMagicLink
                      ? 'bg-mint-400 text-navy-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Password
                </button>
                <button
                  onClick={() => setUseMagicLink(true)}
                  className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${
                    useMagicLink
                      ? 'bg-mint-400 text-navy-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Magic Link
                </button>
              </div>

              <form onSubmit={useMagicLink ? handleMagicLink : handleEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-navy-950 border border-navy-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                {!useMagicLink && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-navy-950 border border-navy-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                )}

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
                  {loading ? 'Please wait...' : useMagicLink ? 'Send magic link' : 'Sign in'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-slate-400 text-sm">
                  Don't have an account?{' '}
                  <Link href="/auth/signup" className="text-mint-400 hover:text-mint-300 font-medium">
                    Sign up
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
