'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Sparkles, TrendingUp, Shield, Mail, ScanSearch, ThumbsUp } from 'lucide-react';

export default function Home() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });

      if (!res.ok) {
        throw new Error('Failed to join waitlist');
      }

      setSuccess(true);
      setName('');
      setEmail('');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Background effects */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      <div className="relative">
        {/* Header */}
        <header className="container mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-amber-500" />
              <span className="text-xl font-bold text-white">Pay<span className="text-amber-500">backer</span></span>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <Link
                href="/auth/login"
                className="text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-800 transition-all"
              >
                Sign In
              </Link>
              <Link
                href="/auth/signup"
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold px-4 py-2 rounded-lg transition-all"
              >
                Get Started
              </Link>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <main className="container mx-auto px-6 py-16 md:py-24">
          <div className="max-w-4xl mx-auto">
            {/* Badge */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-sm text-amber-400 border border-amber-500/20">
                <Sparkles className="h-4 w-4" />
                <span>AI-Powered Money Recovery — Now in Early Access</span>
              </div>
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-bold text-center mb-6 bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent leading-tight">
              Paybacker — Get Your Money Back
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-center text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed">
              AI agents that dispute bills, write complaints, and cancel forgotten subscriptions — on your behalf
            </p>

            {/* Hero CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <Link
                href="/auth/signup"
                className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-center text-lg"
              >
                Create Free Account
              </Link>
              <Link
                href="/auth/login"
                className="w-full sm:w-auto bg-slate-800 hover:bg-slate-700 text-white font-medium px-8 py-4 rounded-xl transition-all text-center text-lg"
              >
                Sign In
              </Link>
            </div>

            {/* Benefits */}
            <div className="grid md:grid-cols-3 gap-6 mb-24">
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Dispute overcharges and billing errors</h3>
                <p className="text-slate-400 text-sm">Our AI finds overcharges, disputes errors, and claims refunds you didn't know you were owed</p>
              </div>

              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Cancel forgotten subscriptions</h3>
                <p className="text-slate-400 text-sm">Automatically cancel unused subscriptions and negotiate better deals on your behalf</p>
              </div>

              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Letters citing UK consumer law</h3>
                <p className="text-slate-400 text-sm">Professional complaint letters citing UK consumer law — written and sent automatically</p>
              </div>
            </div>

            {/* How It Works */}
            <div className="mb-24">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How it works</h2>
                <p className="text-slate-400 text-lg">Three simple steps to start saving money</p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                {/* Step 1 */}
                <div className="relative">
                  <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 text-center h-full">
                    <div className="bg-gradient-to-br from-amber-500 to-amber-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Mail className="h-8 w-8 text-slate-950" />
                    </div>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                      1
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">Connect your accounts</h3>
                    <p className="text-slate-400">
                      Securely link your email and bank accounts. Our AI scans for bills, subscriptions, and transactions.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="relative">
                  <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 text-center h-full">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                      <ScanSearch className="h-8 w-8 text-white" />
                    </div>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                      2
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">AI scans for opportunities</h3>
                    <p className="text-slate-400">
                      Our AI detects overcharges, forgotten subscriptions, and renewal dates. Get alerts about every savings opportunity.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="relative">
                  <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 text-center h-full">
                    <div className="bg-gradient-to-br from-green-500 to-green-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                      <ThumbsUp className="h-8 w-8 text-white" />
                    </div>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                      3
                    </div>
                    <h3 className="text-xl font-bold text-white mb-3">Approve and we handle it</h3>
                    <p className="text-slate-400">
                      Review AI-generated complaints and cancellations. One click to approve, and we'll send it on your behalf.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Waitlist Form */}
            <div className="max-w-xl mx-auto">
              <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 shadow-2xl">
                {success ? (
                  <div className="text-center py-8">
                    <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircle className="h-8 w-8 text-green-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">You're on the list!</h3>
                    <p className="text-slate-400">We'll email you when we launch. Get ready to get your money back.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                        Full name
                      </label>
                      <input
                        type="text"
                        id="name"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                        placeholder="Enter your name"
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                        Email address
                      </label>
                      <input
                        type="email"
                        id="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                        placeholder="you@example.com"
                      />
                    </div>

                    {error && (
                      <p className="text-red-400 text-sm">{error}</p>
                    )}

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold py-4 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25"
                    >
                      {loading ? 'Joining...' : 'Join the waitlist'}
                    </button>

                    <p className="text-center text-sm text-slate-500 mt-4">
                      Free to join · No credit card required
                    </p>
                  </form>
                )}
              </div>
            </div>

            {/* Trust indicators */}
            <div className="mt-16 text-center">
              <p className="text-slate-500 text-sm">UK consumer protection · GDPR compliant · Read-only email access</p>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="container mx-auto px-6 py-8 mt-16 border-t border-slate-800">
          <div className="text-center text-slate-500 text-sm space-y-3">
            <div className="flex justify-center gap-6">
              <Link href="/legal/privacy" className="hover:text-white transition-all">Privacy Policy</Link>
              <Link href="/legal/terms" className="hover:text-white transition-all">Terms of Service</Link>
              <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
            </div>
            <p>© 2026 Paybacker LTD. UK consumer protection powered by AI.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
