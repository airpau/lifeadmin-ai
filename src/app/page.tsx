'use client';

import { useState } from 'react';
import { CheckCircle, Sparkles, TrendingUp, Shield } from 'lucide-react';

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
        <header className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-amber-500" />
              <span className="text-xl font-bold text-white">LifeAdmin<span className="text-amber-500">AI</span></span>
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
                <span>AI-Powered Life Admin — Coming Soon</span>
              </div>
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl font-bold text-center mb-6 bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent leading-tight">
              The AI that gets your money back
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-center text-slate-300 mb-12 max-w-3xl mx-auto leading-relaxed">
              AI agents that dispute bills, write complaints, and cancel forgotten subscriptions — on your behalf
            </p>

            {/* Benefits */}
            <div className="grid md:grid-cols-3 gap-6 mb-16">
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <TrendingUp className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Average £847/year recovered</h3>
                <p className="text-slate-400 text-sm">Our AI finds overcharges, disputes errors, and claims refunds you didn't know you were owed</p>
              </div>

              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Save £200+ on subscriptions</h3>
                <p className="text-slate-400 text-sm">Automatically cancel unused subscriptions and negotiate better deals on your behalf</p>
              </div>

              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">82% complaint success rate</h3>
                <p className="text-slate-400 text-sm">Professional complaint letters citing UK consumer law — written and sent automatically</p>
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
                      Join <span className="font-semibold text-amber-500">2,847</span> people on the waitlist
                    </p>
                  </form>
                )}
              </div>
            </div>

            {/* Trust indicators */}
            <div className="mt-16 text-center">
              <p className="text-slate-500 text-sm mb-4">Trusted by consumers across the UK</p>
              <div className="flex justify-center items-center gap-2">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 border-2 border-slate-900" />
                  ))}
                </div>
                <span className="text-slate-400 text-sm ml-2">and 2,842 others</span>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="container mx-auto px-6 py-8 mt-16 border-t border-slate-800">
          <div className="text-center text-slate-500 text-sm">
            <p>© 2026 LifeAdminAI. UK consumer protection powered by AI.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
