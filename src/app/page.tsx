'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, Sparkles, TrendingUp, Shield, Mail, ScanSearch, ThumbsUp, Scale, Users, CreditCard, Bell, Gift, Banknote, FileText, Zap, BarChart3, Building2, Check, X } from 'lucide-react';
import { WAITLIST_MODE } from '@/lib/config';
import { capture } from '@/lib/posthog';

export default function Home() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);

  useEffect(() => {
    if (WAITLIST_MODE) {
      fetch('/api/waitlist')
        .then((res) => res.json())
        .then((data) => { setWaitlistCount(data.count ?? 0); })
        .catch(() => { setWaitlistCount(0); });
    }
  }, []);

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
        const data = await res.json();
        throw new Error(data.error || 'Failed to join waitlist');
      }

      const data = await res.json();
      if (data.count) setWaitlistCount(data.count);
      setSuccess(true);
      capture('waitlist_signup', { email, count: data.count });
      setName('');
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const ctaButton = WAITLIST_MODE ? (
    <a href="#waitlist" className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-center text-lg">
      Join the Waitlist — Get Early Access
    </a>
  ) : (
    <Link href="/auth/signup" className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-center text-lg">
      Create Free Account
    </Link>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-transparent to-transparent" />
      <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      <div className="relative">
        {/* Header */}
        <header className="container mx-auto px-4 md:px-6 py-4 md:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Paybacker" width={32} height={32} />
              <span className="text-xl font-bold text-white">Pay<span className="text-amber-500">backer</span></span>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <Link href="/auth/login" className="text-slate-300 hover:text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-800 transition-all">
                Sign In
              </Link>
              {WAITLIST_MODE ? (
                <a href="#waitlist" className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold px-4 py-2 rounded-lg transition-all">
                  Join Waitlist
                </a>
              ) : (
                <Link href="/auth/signup" className="bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold px-4 py-2 rounded-lg transition-all">
                  Get Started
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="container mx-auto px-6">
          {/* Hero */}
          <div className="max-w-4xl mx-auto py-16 md:py-24">
            <div className="flex justify-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-sm text-amber-400 border border-amber-500/20">
                <Sparkles className="h-4 w-4" />
                {WAITLIST_MODE ? (
                  <span>Launching Soon — Join the Waitlist for Early Access</span>
                ) : (
                  <span>AI-Powered Money Recovery — Now in Early Access</span>
                )}
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-center mb-6 bg-gradient-to-br from-white via-white to-slate-400 bg-clip-text text-transparent leading-tight">
              Your AI-Powered Money Assistant
            </h1>

            <p className="text-xl md:text-2xl text-center text-slate-300 mb-8 max-w-3xl mx-auto leading-relaxed">
              Cancel forgotten subscriptions. Dispute unfair bills. Find better deals on energy, broadband and insurance. Track every penny — automatically.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-10 text-sm text-slate-400">
              <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-amber-500" /> Cites Consumer Rights Act 2015</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-amber-500" /> UK consumer law trained</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-amber-500" /> Open Banking powered</span>
              <span className="flex items-center gap-1.5"><CheckCircle className="h-4 w-4 text-amber-500" /> GDPR compliant</span>
            </div>

            <div className="flex justify-center mb-16">
              {ctaButton}
            </div>
          </div>

          {/* Features Grid — All planned features */}
          <div className="max-w-6xl mx-auto mb-24">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Everything you need to take control of your money</h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">Six powerful AI agents working around the clock to save you money, fight your corner, and find you better deals.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Feature 1 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">AI Complaint Letters</h3>
                <p className="text-slate-400 text-sm mb-3">Generate formal complaint letters in seconds. Every letter cites the exact UK legislation that applies — Consumer Rights Act 2015, Ofcom, FCA, Ofgem rules. Companies take these seriously.</p>
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">3 free per month</span>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-blue-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <ScanSearch className="h-6 w-6 text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Inbox Scanner</h3>
                <p className="text-slate-400 text-sm mb-3">Connect your email and our AI scans for billing notifications, price increases, subscription confirmations, and savings opportunities hiding in your inbox.</p>
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-full">Essential and Pro</span>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-green-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <CreditCard className="h-6 w-6 text-green-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Subscription Tracker</h3>
                <p className="text-slate-400 text-sm mb-3">See every subscription in one place. Bank feeds and email scanning combined give you the complete picture — what you pay, when it renews, and what you can cancel.</p>
                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">Unlimited on paid plans</span>
              </div>

              {/* Feature 4 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-purple-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Building2 className="h-6 w-6 text-purple-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Open Banking</h3>
                <p className="text-slate-400 text-sm mb-3">Connect your bank account securely via TrueLayer. We read your transactions to detect every recurring payment — including direct debits and card subscriptions email scanning misses.</p>
                <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded-full">Pro plan</span>
              </div>

              {/* Feature 5 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-rose-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Scale className="h-6 w-6 text-rose-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Deal Finder</h3>
                <p className="text-slate-400 text-sm mb-3">Compare energy, broadband, insurance, mobile, mortgages, credit cards and loans. We know what you currently pay and find cheaper alternatives. Switch and start saving immediately.</p>
                <span className="text-xs text-rose-400 bg-rose-500/10 px-2 py-1 rounded-full">Available on all plans</span>
              </div>

              {/* Feature 6 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-amber-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Bell className="h-6 w-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">AI Deal Alerts</h3>
                <p className="text-slate-400 text-sm mb-3">Get personalised emails before your subscriptions renew with better deals we have found for you. Timed alerts at 30, 14, and 7 days before renewal so you never overpay.</p>
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">Essential and Pro</span>
              </div>

              {/* Feature 7 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-emerald-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Auto-Cancellation</h3>
                <p className="text-slate-400 text-sm mb-3">Found a subscription you do not use? Paybacker drafts and sends the cancellation email for you, citing your legal right to cancel. Review it, approve it, done.</p>
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">Essential and Pro</span>
              </div>

              {/* Feature 8 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-sky-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-sky-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Spending Insights</h3>
                <p className="text-slate-400 text-sm mb-3">Monthly spending trends, category breakdowns, and alerts when your costs increase. Powered by Open Banking data so you always know where your money goes.</p>
                <span className="text-xs text-sky-400 bg-sky-500/10 px-2 py-1 rounded-full">Pro plan</span>
              </div>

              {/* Feature 9 */}
              <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 hover:border-amber-500/50 transition-all">
                <div className="bg-yellow-500/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                  <Gift className="h-6 w-6 text-yellow-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Loyalty Rewards</h3>
                <p className="text-slate-400 text-sm mb-3">Earn points every time you save money — complaints filed, subscriptions cancelled, deals switched. Redeem points for discounts on your Paybacker subscription. The more you save, the more you earn.</p>
                <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded-full">Paid members</span>
              </div>
            </div>
          </div>

          {/* How It Works */}
          <div className="max-w-4xl mx-auto mb-24">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How it works</h2>
              <p className="text-slate-400 text-lg">Three simple steps to start saving money</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative">
                <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 text-center h-full">
                  <div className="bg-gradient-to-br from-amber-500 to-amber-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Mail className="h-8 w-8 text-slate-950" />
                  </div>
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-950 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">1</div>
                  <h3 className="text-xl font-bold text-white mb-3">Connect your accounts</h3>
                  <p className="text-slate-400">Securely link your email and bank accounts. Our AI scans for bills, subscriptions, and transactions.</p>
                </div>
              </div>
              <div className="relative">
                <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 text-center h-full">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ScanSearch className="h-8 w-8 text-white" />
                  </div>
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">2</div>
                  <h3 className="text-xl font-bold text-white mb-3">AI finds savings</h3>
                  <p className="text-slate-400">Our AI detects overcharges, forgotten subscriptions, and renewal dates. Better deals are surfaced automatically.</p>
                </div>
              </div>
              <div className="relative">
                <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 text-center h-full">
                  <div className="bg-gradient-to-br from-green-500 to-green-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Banknote className="h-8 w-8 text-white" />
                  </div>
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">3</div>
                  <h3 className="text-xl font-bold text-white mb-3">Save money automatically</h3>
                  <p className="text-slate-400">Review AI-generated letters, switch to better deals, cancel unused subscriptions — all from one dashboard.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Tier Comparison */}
          <div className="max-w-5xl mx-auto mb-24">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Choose the plan that works for you</h2>
              <p className="text-slate-400 text-lg">Start free, upgrade when you are ready. No contracts, cancel anytime.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="py-4 pr-4 text-slate-400 font-medium text-sm">Feature</th>
                    <th className="py-4 px-4 text-center">
                      <div className="text-white font-bold">Free</div>
                      <div className="text-slate-500 text-xs mt-1">See what Paybacker can do — one bank scan included.</div>
                    </th>
                    <th className="py-4 px-4 text-center bg-amber-500/5 rounded-t-xl">
                      <div className="text-amber-400 font-bold">Essential — £9.99/mo</div>
                      <div className="text-slate-400 text-xs mt-1">Keep your finances on track with daily bank sync and full insights.</div>
                    </th>
                    <th className="py-4 px-4 text-center">
                      <div className="text-purple-400 font-bold">Pro — £19.99/mo</div>
                      <div className="text-slate-400 text-xs mt-1">Complete financial control — unlimited banks and premium features.</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {[
                    { feature: 'AI complaint letters', free: '3/month', essential: 'Unlimited', pro: 'Unlimited' },
                    { feature: 'Subscription tracker', free: true, essential: true, pro: true },
                    { feature: 'Personalised deals page', free: true, essential: true, pro: true },
                    { feature: 'AI support chatbot', free: true, essential: true, pro: true },
                    { feature: 'Bank scan', free: 'One-time', essential: '1 bank, daily sync', pro: 'Unlimited banks' },
                    { feature: 'Spending intelligence', free: 'Top 5 categories', essential: 'Full dashboard', pro: 'Full + transactions' },
                    { feature: 'Cancellation emails', free: false, essential: true, pro: true },
                    { feature: 'Renewal reminders', free: false, essential: true, pro: true },
                    { feature: 'Targeted deal alerts', free: 'Weekly digest', essential: 'Personalised', pro: 'Priority alerts' },
                    { feature: 'Email scanning', free: false, essential: false, pro: 'Coming soon' },
                    { feature: 'Auto-cancel on your behalf', free: false, essential: false, pro: 'Coming soon' },
                    { feature: 'Priority support', free: false, essential: false, pro: true },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      <td className="py-3 pr-4 text-slate-300">{row.feature}</td>
                      <td className="py-3 px-4 text-center">
                        {typeof row.free === 'boolean' ? (
                          row.free ? <Check className="h-5 w-5 text-green-500 mx-auto" /> : <X className="h-5 w-5 text-slate-700 mx-auto" />
                        ) : (
                          <span className="text-slate-400">{row.free}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center bg-amber-500/5">
                        {typeof row.essential === 'boolean' ? (
                          row.essential ? <Check className="h-5 w-5 text-amber-500 mx-auto" /> : <X className="h-5 w-5 text-slate-700 mx-auto" />
                        ) : (
                          <span className="text-amber-400 font-medium">{row.essential}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {typeof row.pro === 'boolean' ? (
                          row.pro ? <Check className="h-5 w-5 text-purple-500 mx-auto" /> : <X className="h-5 w-5 text-slate-700 mx-auto" />
                        ) : (
                          <span className="text-purple-400 font-medium">{row.pro}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-center mt-8">
              {ctaButton}
            </div>
          </div>

          {/* Money You Could Be Owed */}
          <div className="max-w-5xl mx-auto mb-24">
            <div className="text-center mb-10">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Money you could be owed right now</h2>
              <p className="text-slate-400 text-lg">Most UK consumers are owed money they do not know about. Here are the most common.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
                <div className="text-4xl font-bold text-amber-500 mb-2">£520</div>
                <p className="text-white font-medium mb-1">Flight delay compensation</p>
                <p className="text-slate-400 text-xs">Up to £520 per person for delays over 3 hours under EU261/UK261. Airlines count on you not claiming.</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
                <div className="text-4xl font-bold text-amber-500 mb-2">£312</div>
                <p className="text-white font-medium mb-1">Forgotten subscriptions</p>
                <p className="text-slate-400 text-xs">The average UK adult wastes £312 a year on subscriptions they have forgotten about or no longer use.</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
                <div className="text-4xl font-bold text-amber-500 mb-2">£30k</div>
                <p className="text-white font-medium mb-1">Section 75 protection</p>
                <p className="text-slate-400 text-xs">Credit card purchases between £100 and £30,000 are protected. If something goes wrong, your card provider is jointly liable.</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
                <div className="text-4xl font-bold text-amber-500 mb-2">£100s</div>
                <p className="text-white font-medium mb-1">Council tax overpayment</p>
                <p className="text-slate-400 text-xs">Bands were set in 1991. Millions of homes are in the wrong band. If yours is too high, you could be owed years of overpayments.</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
                <div className="text-4xl font-bold text-amber-500 mb-2">£150</div>
                <p className="text-white font-medium mb-1">Energy credit refunds</p>
                <p className="text-slate-400 text-xs">Your energy supplier must refund credit on your account within 10 working days. The average UK household is owed around £150.</p>
              </div>
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 text-center">
                <div className="text-4xl font-bold text-amber-500 mb-2">30s</div>
                <p className="text-white font-medium mb-1">AI complaint letter</p>
                <p className="text-slate-400 text-xs">Generate a formal complaint citing the exact UK law that applies in under 30 seconds. Companies respond when you know your rights.</p>
              </div>
            </div>
          </div>

          {/* Waitlist Form */}
          <div id="waitlist" className="max-w-xl mx-auto scroll-mt-24 mb-24">
            <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-8 shadow-2xl">
              {WAITLIST_MODE && (
                <div className="flex items-center justify-center gap-2 mb-6 text-sm text-slate-400">
                  <Users className="h-4 w-4 text-amber-500" />
                  {waitlistCount && waitlistCount > 0 ? (
                    <span>Join <span className="text-white font-semibold">{waitlistCount.toLocaleString()}</span> {waitlistCount === 1 ? 'other' : 'others'} on the waitlist</span>
                  ) : (
                    <span>Be the first on the waitlist</span>
                  )}
                </div>
              )}

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
                  {WAITLIST_MODE && (
                    <div className="text-center mb-2">
                      <h3 className="text-xl font-bold text-white mb-1">Get early access</h3>
                      <p className="text-slate-400 text-sm">Be first in line when we launch. No spam, ever.</p>
                    </div>
                  )}

                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">Full name</label>
                    <input type="text" id="name" required value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      placeholder="Enter your name" />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
                    <input type="email" id="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all"
                      placeholder="you@example.com" />
                  </div>

                  {error && <p className="text-red-400 text-sm">{error}</p>}

                  <button type="submit" disabled={loading}
                    className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold py-4 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25">
                    {loading ? 'Joining...' : 'Join the waitlist'}
                  </button>

                  <p className="text-center text-sm text-slate-500 mt-4">Free to join · No credit card required</p>
                </form>
              )}
            </div>
          </div>

          {/* Trust indicators */}
          <div className="text-center mb-16">
            <p className="text-slate-500 text-sm">UK consumer law trained · GDPR compliant · Read-only access · FCA-regulated Open Banking · Not legal advice</p>
          </div>
        </main>

        {/* Footer */}
        <footer className="container mx-auto px-6 py-8 border-t border-slate-800">
          <div className="text-center text-slate-500 text-sm space-y-3">
            <div className="flex justify-center gap-6">
              <Link href="/legal/privacy" className="hover:text-white transition-all">Privacy Policy</Link>
              <Link href="/legal/terms" className="hover:text-white transition-all">Terms of Service</Link>
              <Link href="/pricing" className="hover:text-white transition-all">Pricing</Link>
            </div>
            <p>© 2026 Paybacker LTD. UK consumer law. Automated.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
