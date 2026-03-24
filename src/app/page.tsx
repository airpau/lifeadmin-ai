'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, Sparkles, TrendingUp, Shield, Mail, ScanSearch, Users, CreditCard, Bell, Banknote, FileText, Zap, BarChart3, Building2, Check, X, ArrowRight, ChevronRight } from 'lucide-react';
import { WAITLIST_MODE } from '@/lib/config';
import { capture } from '@/lib/posthog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function Home() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Capture referral code from URL and persist
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('pb_ref', ref);
    }

    if (WAITLIST_MODE) {
      fetch('/api/waitlist')
        .then((res) => res.json())
        .then((data) => { setWaitlistCount(data.count ?? 0); })
        .catch(() => { setWaitlistCount(0); });
    }

    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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
      // Awin lead conversion tracking
      if (typeof window !== 'undefined') {
        const img = new window.Image();
        img.src = `https://www.awin1.com/sread.php?tt=ns&tv=2&merchant=125502&amount=0.00&ch=aw&parts=DEFAULT:0.00&ref=waitlist-${Date.now()}&vc=&cr=GBP&testmode=0`;
      }
      setName('');
      setEmail('');
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const ctaButton = WAITLIST_MODE ? (
    <a href="#waitlist" className="group inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-center text-lg">
      Join the Waitlist
      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
    </a>
  ) : (
    <Link href="/auth/signup" className="group inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-center text-lg">
      Create Free Account
      <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
    </Link>
  );

  return (
    <div className="min-h-screen bg-white bg-grid">
      {/* Ambient glow effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-amber-500/[0.04] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-purple-500/[0.03] rounded-full blur-[100px]" />
      </div>

      <div className="relative">
        {/* Header / Nav */}
        <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'glass py-3' : 'py-5'}`}>
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Paybacker" width={28} height={28} />
              <span className="text-lg font-bold text-slate-900 tracking-tight">Pay<span className="text-amber-500">backer</span></span>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/about" className="text-slate-600 hover:text-slate-900 text-sm px-3 py-2 rounded-lg hover:bg-slate-100 transition-all">About</Link>
              <Link href="/blog" className="text-slate-600 hover:text-slate-900 text-sm px-3 py-2 rounded-lg hover:bg-slate-100 transition-all">Blog</Link>
              <Link href="/pricing" className="text-slate-600 hover:text-slate-900 text-sm px-3 py-2 rounded-lg hover:bg-slate-100 transition-all">Pricing</Link>
              <Link href="/deals" className="text-slate-600 hover:text-slate-900 text-sm px-3 py-2 rounded-lg hover:bg-slate-100 transition-all">Deals</Link>
            </nav>
            <div className="flex items-center gap-3">
              <Link href="/auth/login" className="text-slate-600 hover:text-slate-900 text-sm font-medium px-3 py-2 rounded-lg hover:bg-slate-100 transition-all">
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

        <main>
          {/* ============ HERO ============ */}
          <section className="pt-32 pb-24 md:pt-44 md:pb-32 px-6">
            <div className="max-w-4xl mx-auto text-center">
              <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
                <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-2 text-sm text-amber-600 mb-8">
                  <Sparkles className="h-4 w-4" />
                  {WAITLIST_MODE ? (
                    <span>Launching Soon: Join the Waitlist for Early Access</span>
                  ) : (
                    <span>AI-Powered Money Recovery: Now in Early Access</span>
                  )}
                </div>
              </div>

              <h1 className="animate-fade-in-up text-gradient text-5xl md:text-7xl font-bold mb-6 leading-[1.1] tracking-tight" style={{ animationDelay: '100ms' }}>
                Your Complete Financial<br />Control Centre
              </h1>

              <p className="animate-fade-in-up text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed" style={{ animationDelay: '200ms' }}>
                Track every penny. Switch to cheaper deals. Dispute unfair bills. Cancel forgotten subscriptions. AI-powered financial intelligence that saves you money automatically.
              </p>

              <div className="animate-fade-in-up flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mb-12 text-sm text-slate-500" style={{ animationDelay: '300ms' }}>
                <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-amber-500" /> Consumer Rights Act 2015</span>
                <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-amber-500" /> UK consumer law trained</span>
                <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-amber-500" /> Open Banking powered</span>
                <span className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-amber-500" /> GDPR compliant</span>
              </div>

              <div className="animate-fade-in-up flex justify-center" style={{ animationDelay: '400ms' }}>
                {ctaButton}
              </div>
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ============ MONEY HUB SPOTLIGHT ============ */}
          <section className="py-24 md:py-32 px-6">
            <div className="max-w-5xl mx-auto">
              <div className="animate-fade-in-up glass rounded-2xl p-8 md:p-12 relative overflow-hidden">
                {/* Subtle glow */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-100/50 rounded-full blur-[80px] animate-glow-pulse" />

                <div className="relative">
                  <Badge variant="outline" className="mb-4 border-amber-200 text-amber-600 bg-amber-50">
                    <Sparkles className="h-3 w-3 mr-1" /> Introducing the Money Hub
                  </Badge>
                  <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">Your complete financial intelligence centre</h2>
                  <p className="text-slate-600 text-lg mb-10 max-w-2xl leading-relaxed">Connect your bank account and email. Paybacker analyses every transaction, detects every subscription, and tells you exactly where your money goes and how to keep more of it.</p>

                  <div className="grid md:grid-cols-3 gap-4 mb-10">
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 hover:border-amber-300 transition-all shadow-sm">
                      <p className="text-amber-600 font-bold text-3xl mb-1">20+</p>
                      <p className="text-slate-500 text-sm">Spending categories with AI categorisation</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 hover:border-amber-300 transition-all shadow-sm">
                      <p className="text-amber-600 font-bold text-3xl mb-1">Bank + Email</p>
                      <p className="text-slate-500 text-sm">Two data sources no other app combines</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 hover:border-amber-300 transition-all shadow-sm">
                      <p className="text-amber-600 font-bold text-3xl mb-1">Self-learning</p>
                      <p className="text-slate-500 text-sm">AI gets smarter with every correction you make</p>
                    </div>
                  </div>

                  {ctaButton}
                </div>
              </div>
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ============ SMART DEAL SWITCHING ============ */}
          <section className="py-24 md:py-32 px-6">
            <div className="max-w-5xl mx-auto">
              <div className="glass rounded-2xl p-8 md:p-12 relative overflow-hidden">
                {/* Subtle glow */}
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-green-100/50 rounded-full blur-[80px] animate-glow-pulse" />

                <div className="relative">
                  <Badge variant="outline" className="mb-4 border-green-200 text-green-600 bg-green-50">
                    <TrendingUp className="h-3 w-3 mr-1" /> Smart Deal Switching
                  </Badge>
                  <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4 tracking-tight">We find you cheaper deals. Automatically.</h2>
                  <p className="text-slate-600 text-lg mb-10 max-w-2xl leading-relaxed">Paybacker analyses your bank transactions and email receipts to identify every bill you are overpaying on. We alert you before contracts renew and show you better deals from 50+ UK providers.</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 hover:border-green-300 transition-all text-center shadow-sm">
                      <p className="text-green-600 font-bold text-3xl mb-1">56</p>
                      <p className="text-slate-500 text-xs">Deals from top UK providers</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 hover:border-green-300 transition-all text-center shadow-sm">
                      <p className="text-green-600 font-bold text-3xl mb-1">9</p>
                      <p className="text-slate-500 text-xs">Categories: energy, broadband, mobile, insurance and more</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 hover:border-green-300 transition-all text-center shadow-sm">
                      <p className="text-green-600 font-bold text-3xl mb-1">30/14/7</p>
                      <p className="text-slate-500 text-xs">Day alerts before your contracts renew</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 hover:border-green-300 transition-all text-center shadow-sm">
                      <p className="text-green-600 font-bold text-3xl mb-1">AI</p>
                      <p className="text-slate-500 text-xs">Personalised recommendations from your real data</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-10">
                    {['Energy', 'Broadband', 'Mobile', 'Insurance', 'Mortgages', 'Loans', 'Credit Cards', 'Car Finance', 'Travel'].map(cat => (
                      <span key={cat} className="text-sm text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1 rounded-full">{cat}</span>
                    ))}
                  </div>

                  {ctaButton}
                </div>
              </div>
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ============ BENTO FEATURES GRID ============ */}
          <section className="py-24 md:py-32 px-6">
            <div className="max-w-6xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold text-gradient mb-4 tracking-tight">Everything you need to take control</h2>
                <p className="text-slate-500 text-lg max-w-xl mx-auto">AI-powered tools that analyse, alert, and act on your behalf.</p>
              </div>

              {/* Bento grid: 2 large featured cards */}
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                {/* Money Hub - large card */}
                <div className="group glass rounded-2xl p-8 hover:border-amber-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="bg-amber-50 w-10 h-10 rounded-lg flex items-center justify-center mb-5">
                      <BarChart3 className="h-5 w-5 text-amber-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">Money Hub Dashboard</h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-4">Income vs outgoings, spending by category, budget tracking, net worth, savings goals, and a financial health score. All in one view, updated daily from your bank.</p>
                    <Badge variant="outline" className="border-amber-200 text-amber-600 bg-amber-50 text-xs">Essential and Pro</Badge>
                  </div>
                </div>

                {/* AI Letters - large card */}
                <div className="group glass rounded-2xl p-8 hover:border-amber-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="bg-amber-50 w-10 h-10 rounded-lg flex items-center justify-center mb-5">
                      <FileText className="h-5 w-5 text-amber-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">AI Complaint Letters</h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-4">Generate formal complaint letters citing exact UK law in 30 seconds. Energy, broadband, debt disputes, parking appeals, flight delays (up to £520), HMRC, council tax, and more.</p>
                    <Badge variant="outline" className="border-amber-200 text-amber-600 bg-amber-50 text-xs">3 free per month</Badge>
                  </div>
                </div>
              </div>

              {/* Bento grid: 3-column smaller cards */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="group glass rounded-2xl p-6 hover:border-purple-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="bg-purple-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4">
                      <Building2 className="h-5 w-5 text-purple-500" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">Open Banking</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Connect your bank securely via Open Banking. We detect every subscription, categorise every transaction, and track spending patterns automatically.</p>
                  </div>
                </div>

                <div className="group glass rounded-2xl p-6 hover:border-blue-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="bg-blue-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4">
                      <ScanSearch className="h-5 w-5 text-blue-500" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">Email Inbox Scanning</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Connect Gmail or Outlook. We scan 2 years of emails for overcharges, forgotten subscriptions, flight delay compensation, and debt disputes.</p>
                  </div>
                </div>

                <div className="group glass rounded-2xl p-6 hover:border-green-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="bg-green-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4">
                      <CreditCard className="h-5 w-5 text-green-500" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">Subscription Tracker</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Track every subscription, direct debit, mortgage, loan, and contract. See end dates, monthly costs, and get alerts before renewals.</p>
                  </div>
                </div>

                <div className="group glass rounded-2xl p-6 hover:border-rose-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="bg-rose-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4">
                      <Zap className="h-5 w-5 text-rose-500" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">Action Centre</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">A prioritised to-do list of money you can claim or save, ranked by value. Each action links directly to the right tool.</p>
                  </div>
                </div>

                <div className="group glass rounded-2xl p-6 hover:border-sky-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-sky-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="bg-sky-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4">
                      <Shield className="h-5 w-5 text-sky-500" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">Budget Planner</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Set spending limits per category. Real-time progress bars, alerts at 80% and 100%, rollover option. Aligns to your payday.</p>
                  </div>
                </div>

                <div className="group glass rounded-2xl p-6 hover:border-emerald-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative">
                    <div className="bg-emerald-50 w-10 h-10 rounded-lg flex items-center justify-center mb-4">
                      <TrendingUp className="h-5 w-5 text-emerald-500" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">Net Worth Tracker</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Track total assets minus liabilities. See your net worth grow over time with auto-updating from connected bank accounts.</p>
                  </div>
                </div>
              </div>

              {/* Extra feature row */}
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="group glass rounded-2xl p-6 hover:border-indigo-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative flex items-start gap-4">
                    <div className="bg-indigo-50 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                      <Users className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 mb-2">AI Financial Assistant</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">Chat with AI about your finances using your real data. "How much did I spend on eating out?" "What subscriptions could I cancel?"</p>
                    </div>
                  </div>
                </div>

                <div className="group glass rounded-2xl p-6 hover:border-amber-300 transition-all duration-300 relative overflow-hidden shadow-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="relative flex items-start gap-4">
                    <div className="bg-amber-50 w-10 h-10 rounded-lg flex items-center justify-center shrink-0">
                      <Bell className="h-5 w-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 mb-2">Renewal Reminders</h3>
                      <p className="text-slate-500 text-sm leading-relaxed">Email alerts at 30, 14, and 7 days before any contract renews. Never get caught off guard by an auto-renewal again.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ============ HOW IT WORKS ============ */}
          <section className="py-24 md:py-32 px-6">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold text-gradient mb-4 tracking-tight">How it works</h2>
                <p className="text-slate-500 text-lg">Three simple steps to start saving money</p>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="relative group">
                  <div className="glass rounded-2xl p-8 text-center h-full hover:border-amber-300 transition-all duration-300 shadow-sm">
                    <div className="bg-gradient-to-br from-amber-500 to-amber-600 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-500/20">
                      <Mail className="h-7 w-7 text-white" />
                    </div>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs">1</div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">Connect your accounts</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Securely link your email and bank accounts. Our AI scans for bills, subscriptions, and transactions.</p>
                  </div>
                </div>
                <div className="relative group">
                  <div className="glass rounded-2xl p-8 text-center h-full hover:border-blue-300 transition-all duration-300 shadow-sm">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/20">
                      <ScanSearch className="h-7 w-7 text-white" />
                    </div>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs">2</div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">AI finds savings</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Our AI detects overcharges, forgotten subscriptions, contract end dates, and overpayments across all your bills.</p>
                  </div>
                </div>
                <div className="relative group">
                  <div className="glass rounded-2xl p-8 text-center h-full hover:border-green-300 transition-all duration-300 shadow-sm">
                    <div className="bg-gradient-to-br from-green-500 to-green-600 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
                      <Banknote className="h-7 w-7 text-white" />
                    </div>
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs">3</div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-3">Save money automatically</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">Review AI-generated letters, cancel unused subscriptions, track every contract, and take control of your finances.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ============ TIER COMPARISON ============ */}
          <section className="py-24 md:py-32 px-6">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold text-gradient mb-4 tracking-tight">Choose the plan that works for you</h2>
                <p className="text-slate-500 text-lg">Start free, upgrade when you are ready. No contracts, cancel anytime.</p>
              </div>

              <div className="glass rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-5 px-6 text-slate-500 font-medium text-sm">Feature</th>
                        <th className="py-5 px-6 text-center">
                          <div className="text-slate-900 font-bold">Free</div>
                          <div className="text-slate-400 text-xs mt-1">See what Paybacker can do</div>
                        </th>
                        <th className="py-5 px-6 text-center bg-amber-50/50">
                          <div className="text-amber-600 font-bold">Essential: £9.99/mo</div>
                          <div className="text-slate-500 text-xs mt-1">Full financial insights</div>
                        </th>
                        <th className="py-5 px-6 text-center">
                          <div className="text-purple-600 font-bold">Pro: £19.99/mo</div>
                          <div className="text-slate-500 text-xs mt-1">Complete financial control</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {[
                        { feature: 'AI complaint and form letters', free: '3/month', essential: 'Unlimited', pro: 'Unlimited' },
                        { feature: 'Subscription and contract tracker', free: 'Manual add', essential: 'Auto-detect', pro: 'Auto-detect' },
                        { feature: 'Bank connection', free: 'One-time scan', essential: '1 bank, daily sync', pro: 'Unlimited banks' },
                        { feature: 'Email inbox scanning', free: 'One-time', essential: 'Monthly', pro: 'Unlimited' },
                        { feature: 'Opportunity scanner', free: 'One-time', essential: 'Monthly', pro: 'Unlimited' },
                        { feature: 'Money Hub dashboard', free: 'Top 5 categories', essential: 'Full dashboard', pro: 'Full + AI assistant' },
                        { feature: 'Budget planner', free: false, essential: true, pro: true },
                        { feature: 'Income and spending analysis', free: false, essential: 'Full breakdown', pro: 'Full + merchant drill-down' },
                        { feature: 'Contract end date tracking', free: false, essential: true, pro: true },
                        { feature: 'Cancellation emails with legal context', free: false, essential: true, pro: true },
                        { feature: 'Renewal reminders (30/14/7 days)', free: false, essential: true, pro: true },
                        { feature: 'Net worth tracker', free: false, essential: 'Manual', pro: 'Auto from banks' },
                        { feature: 'Savings goals', free: false, essential: 'Up to 3', pro: 'Unlimited' },
                        { feature: 'AI financial assistant (chat)', free: false, essential: false, pro: true },
                        { feature: 'Self-learning categorisation', free: false, essential: false, pro: true },
                        { feature: 'Weekly financial digest email', free: false, essential: true, pro: true },
                        { feature: 'AI support chatbot', free: true, essential: true, pro: true },
                        { feature: 'Priority support', free: false, essential: false, pro: true },
                      ].map((row, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="py-3.5 px-6 text-slate-700">{row.feature}</td>
                          <td className="py-3.5 px-6 text-center">
                            {typeof row.free === 'boolean' ? (
                              row.free ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : <X className="h-4 w-4 text-slate-300 mx-auto" />
                            ) : (
                              <span className="text-slate-500">{row.free}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-6 text-center bg-amber-50/50">
                            {typeof row.essential === 'boolean' ? (
                              row.essential ? <Check className="h-4 w-4 text-amber-500 mx-auto" /> : <X className="h-4 w-4 text-slate-300 mx-auto" />
                            ) : (
                              <span className="text-amber-600 font-medium">{row.essential}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-6 text-center">
                            {typeof row.pro === 'boolean' ? (
                              row.pro ? <Check className="h-4 w-4 text-purple-500 mx-auto" /> : <X className="h-4 w-4 text-slate-300 mx-auto" />
                            ) : (
                              <span className="text-purple-600 font-medium">{row.pro}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-center mt-10">
                {ctaButton}
              </div>
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ============ MONEY YOU COULD BE OWED ============ */}
          <section className="py-24 md:py-32 px-6">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-3xl md:text-5xl font-bold text-gradient mb-4 tracking-tight">Money you could be owed right now</h2>
                <p className="text-slate-500 text-lg max-w-xl mx-auto">Most UK consumers are owed money they do not know about. Here are the most common.</p>
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { amount: '£520', label: 'Flight delay compensation', desc: 'Up to £520 per person for delays over 3 hours under EU261/UK261. Airlines count on you not claiming.' },
                  { amount: '£312', label: 'Forgotten subscriptions', desc: 'The average UK adult wastes £312 a year on subscriptions they have forgotten about or no longer use.' },
                  { amount: '£30k', label: 'Section 75 protection', desc: 'Credit card purchases between £100 and £30,000 are protected. If something goes wrong, your card provider is jointly liable.' },
                  { amount: '£100s', label: 'Council tax overpayment', desc: 'Bands were set in 1991. Millions of homes are in the wrong band. If yours is too high, you could be owed years of overpayments.' },
                  { amount: '£150', label: 'Energy credit refunds', desc: 'Your energy supplier must refund credit on your account within 10 working days. The average UK household is owed around £150.' },
                  { amount: '30s', label: 'AI complaint letter', desc: 'Generate a formal complaint citing the exact UK law that applies in under 30 seconds. Companies respond when you know your rights.' },
                ].map((item, i) => (
                  <div key={i} className="group glass rounded-2xl p-6 text-center hover:border-amber-300 transition-all duration-300 shadow-sm">
                    <div className="text-4xl font-bold text-gradient-gold mb-2">{item.amount}</div>
                    <p className="text-slate-900 font-medium mb-2">{item.label}</p>
                    <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ============ WAITLIST / SIGNUP FORM ============ */}
          <section id="waitlist" className="py-24 md:py-32 px-6 scroll-mt-24">
            <div className="max-w-lg mx-auto">
              <div className="glass rounded-2xl p-8 md:p-10 relative overflow-hidden">
                {/* Subtle glow */}
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-100/50 rounded-full blur-[60px] animate-glow-pulse" />

                <div className="relative">
                  {WAITLIST_MODE && (
                    <div className="flex items-center justify-center gap-2 mb-6 text-sm text-slate-500">
                      <Users className="h-4 w-4 text-amber-500" />
                      {waitlistCount && waitlistCount > 0 ? (
                        <span>Join <span className="text-slate-900 font-semibold">{waitlistCount.toLocaleString()}</span> {waitlistCount === 1 ? 'other' : 'others'} on the waitlist</span>
                      ) : (
                        <span>Be the first on the waitlist</span>
                      )}
                    </div>
                  )}

                  {success ? (
                    <div className="text-center py-8">
                      <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="h-8 w-8 text-green-500" />
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 mb-2">You're on the list!</h3>
                      <p className="text-slate-600">We'll email you when we launch. Get ready to get your money back.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {WAITLIST_MODE && (
                        <div className="text-center mb-4">
                          <h3 className="text-xl font-bold text-slate-900 mb-1">Get early access</h3>
                          <p className="text-slate-500 text-sm">Be first in line when we launch. No spam, ever.</p>
                        </div>
                      )}

                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-600 mb-2">Full name</label>
                        <input type="text" id="name" required value={name} onChange={(e) => setName(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all"
                          placeholder="Enter your name" />
                      </div>

                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-600 mb-2">Email address</label>
                        <input type="email" id="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all"
                          placeholder="you@example.com" />
                      </div>

                      {error && <p className="text-red-400 text-sm">{error}</p>}

                      <button type="submit" disabled={loading}
                        className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold py-4 rounded-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/25">
                        {loading ? 'Joining...' : 'Join the waitlist'}
                      </button>

                      <p className="text-center text-xs text-slate-600 mt-4">Free to join. No credit card required.</p>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

          {/* ============ DATA SECURITY ============ */}
          <section className="py-24 md:py-32 px-6">
            <div className="max-w-3xl mx-auto">
              <div className="text-center mb-10">
                <Shield className="h-8 w-8 text-green-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Your data is safe with us</h3>
                <p className="text-slate-500 text-sm">Bank-level security and full GDPR compliance</p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  'Your data is stored in the UK/EU and is GDPR compliant. We are the data controller.',
                  'Our AI providers are contractually prohibited from using your data for training or any other purpose.',
                  'Bank connections use TrueLayer (FCA regulated). We never see or store your banking credentials.',
                  'All data is encrypted at rest and in transit. You can delete your account and all data at any time.',
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-3 glass rounded-xl p-4">
                    <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                    <span className="text-slate-500 text-sm leading-relaxed">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        {/* ============ FOOTER ============ */}
        <footer className="border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <Image src="/logo.png" alt="Paybacker" width={24} height={24} />
                <span className="text-sm font-semibold text-slate-900">Pay<span className="text-amber-500">backer</span></span>
              </div>
              <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-600">
                <Link href="/about" className="hover:text-slate-900 transition-all">About</Link>
                <Link href="/blog" className="hover:text-slate-900 transition-all">Blog</Link>
                <Link href="/privacy-policy" className="hover:text-slate-900 transition-all">Privacy Policy</Link>
                <Link href="/legal/terms" className="hover:text-slate-900 transition-all">Terms of Service</Link>
                <Link href="/pricing" className="hover:text-slate-900 transition-all">Pricing</Link>
                <a href="mailto:hello@paybacker.co.uk" className="hover:text-slate-900 transition-all">Contact</a>
              </div>
            </div>
            <div className="mt-8 pt-8 border-t border-slate-200 text-center text-xs text-slate-400 space-y-2">
              <p>Need help? Email <a href="mailto:support@paybacker.co.uk" className="text-amber-500 hover:text-amber-600 transition-all">support@paybacker.co.uk</a></p>
              <p>&copy; 2026 Paybacker LTD. UK consumer law. Automated.</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
