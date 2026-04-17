'use client';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        // Supabase PKCE flow sends a token_hash to this URL.
        // /auth/confirm exchanges it server-side and redirects to /auth/reset-password.
        redirectTo: `${window.location.origin}/auth/confirm?next=/auth/reset-password`,
      });

      if (error) throw error;

      setSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email. Please try again.');
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
          <h1 className="text-3xl font-bold text-white mb-2 font-[family-name:var(--font-heading)]">Reset password</h1>
          <p className="text-slate-400">Enter your email and we will send you a reset link</p>
        </div>

        <div className="bg-navy-900 backdrop-blur-sm border border-navy-700/50 rounded-2xl p-8 shadow-2xl">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle2 className="h-16 w-16 text-mint-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">Check your email</h3>
              <p className="text-slate-400 mb-6">
                If an account exists for <span className="text-white">{email}</span>, we have sent a password reset link.
              </p>
              <Link href="/auth/login" className="text-mint-400 hover:text-mint-300 font-medium text-sm">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
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
                {loading ? 'Sending...' : 'Send reset link'}
              </button>

              <div className="text-center">
                <Link href="/auth/login" className="text-slate-400 hover:text-white text-sm transition-all">
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
