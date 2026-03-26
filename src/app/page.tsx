'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, Sparkles, TrendingUp, Shield, Mail, ScanSearch, ThumbsUp, Scale, Users, CreditCard, Bell, Gift, Banknote, FileText, Zap, BarChart3, Building2, Check, X, ArrowRight, Star, ChevronRight } from 'lucide-react';
import { WAITLIST_MODE } from '@/lib/config';
import { capture } from '@/lib/posthog';
import { motion } from 'framer-motion';
import PublicNavbar from '@/components/PublicNavbar';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [waitlistCount, setWaitlistCount] = useState<number | null>(null);
  const [foundingSpots, setFoundingSpots] = useState<number | null>(null);
  const [stats, setStats] = useState<{ lettersGenerated: number; subscriptionsTracked: number; usersJoined: number; dealClicks: number } | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setIsLoggedIn(true);
    });

    // Capture referral code from URL and persist
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('pb_ref', ref);
    }

    // Fetch founding member spots remaining
    fetch('/api/founding-member')
      .then(r => r.json())
      .then(d => { if (d.active) setFoundingSpots(d.remaining); })
      .catch(() => {});

    // Fetch live stats
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {});

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
    <a href="#waitlist" className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-center text-lg">
      Join the Waitlist — Get Early Access
    </a>
  ) : (
    <Link href="/auth/signup" className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-center text-lg">
      {foundingSpots !== null ? `Claim Your Free Pro Account` : 'Create Free Account'}
    </Link>
  );

  const foundingBanner = foundingSpots !== null && foundingSpots > 0 ? (
    <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-2xl px-6 py-4 mb-6 text-center">
      <p className="text-green-400 font-bold text-lg mb-1">
        Limited Offer: Get Pro FREE for 30 days
      </p>
      <p className="text-slate-400 text-sm">
        Only 25 free spaces available. Unlimited letters, bank scanning, spending intelligence, and more. No card required.
      </p>
    </div>
  ) : null;

  const staggerContainer = {
    hidden: {},
    show: { transition: { staggerChildren: 0.1 } },
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <PublicNavbar />

      {/* Spacer for fixed navbar */}
      <div className="h-16" />

      <main>
        {/* Founding member banner */}
        {foundingBanner && (
          <div className="container mx-auto px-4 md:px-6 pt-4">
            <div className="max-w-4xl mx-auto">
              {foundingBanner}
            </div>
          </div>
        )}

        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-mint-400/5 via-transparent to-transparent" />
          <div className="container mx-auto px-4 md:px-6 pt-16 md:pt-28 pb-20">
            <div className="max-w-4xl mx-auto text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="inline-flex items-center gap-2 rounded-full bg-mint-400/10 px-4 py-2 text-sm text-mint-400 border border-mint-400/20 mb-8"
              >
                <CheckCircle className="h-4 w-4" />
                <span>{foundingSpots !== null ? 'Limited spaces: Pro plan FREE for 30 days' : '100% free to try - no credit card needed'}</span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="font-[family-name:var(--font-heading)] text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight"
              >
                Take Back{' '}
                <span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">
                  Control
                </span>{' '}
                of Your Money
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-slate-300 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10"
              >
                AI-powered complaint letters citing exact UK law. Track every subscription. Find cheaper deals. All in one platform, built for UK consumers.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
              >
                {WAITLIST_MODE ? (
                  <a href="#waitlist" className="w-full sm:w-auto bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] text-center text-lg inline-flex items-center justify-center gap-2">
                    Get Started Free <ArrowRight className="h-5 w-5" />
                  </a>
                ) : (
                  <Link href={isLoggedIn ? '/dashboard' : '/auth/signup'} className="w-full sm:w-auto bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] text-center text-lg inline-flex items-center justify-center gap-2">
                    {isLoggedIn ? 'Go to Dashboard' : (foundingSpots !== null ? 'Claim Your Free Pro Account' : 'Get Started Free')} <ArrowRight className="h-5 w-5" />
                  </Link>
                )}
                <a href="#how-it-works" className="border border-navy-700 hover:border-mint-400/50 text-slate-300 hover:text-white px-8 py-4 rounded-xl transition-all duration-200 text-center text-lg">
                  See How It Works
                </a>
              </motion.div>

              {/* Live stats row */}
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto"
              >
                {[
                  { value: stats ? stats.lettersGenerated.toString() : '--', label: 'Letters generated' },
                  { value: stats ? stats.subscriptionsTracked.toString() : '--', label: 'Subscriptions tracked' },
                  { value: '30 sec', label: 'To generate a letter' },
                  { value: stats ? stats.dealClicks.toString() : '56', label: 'Cheaper deals' },
                ].map((stat) => (
                  <motion.div key={stat.label} variants={fadeUp} className="text-center">
                    <p className="text-2xl font-bold text-mint-400">{stat.value}</p>
                    <p className="text-slate-500 text-xs mt-1">{stat.label}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* Trust Signals Bar */}
        <section className="border-y border-navy-700/50 bg-navy-900/50">
          <div className="container mx-auto px-4 md:px-6 py-8">
            <p className="text-center text-slate-500 text-sm mb-6">Regulated, secure, and built for UK consumers</p>
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-12">
              {[
                { name: 'ICO Registered', sub: 'Data Protection', icon: '🛡️' },
                { name: 'FCA Regulated', sub: 'Via TrueLayer', icon: '✅' },
                { name: 'TrueLayer', sub: 'Open Banking', icon: '🏦' },
                { name: 'Stripe', sub: 'Secure Payments', icon: '🔒' },
                { name: 'GDPR Compliant', sub: 'UK Data Laws', icon: '📋' },
                { name: 'UK Company', sub: 'Paybacker LTD', icon: '🇬🇧' },
              ].map((badge) => (
                <div key={badge.name} className="flex items-center gap-2">
                  <span className="text-lg">{badge.icon}</span>
                  <div>
                    <p className="text-slate-400 font-semibold text-xs">{badge.name}</p>
                    <p className="text-slate-600 text-[10px]">{badge.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Section 1: AI Complaint Letters */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto"
            >
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-mint-400/10 px-3 py-1.5 text-xs text-mint-400 border border-mint-400/20 mb-6">
                  <Scale className="h-3.5 w-3.5" />
                  <span>AI-Powered</span>
                </div>
                <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                  AI Complaint Letters
                </h2>
                <p className="text-slate-400 text-lg leading-relaxed mb-6">
                  Generate formal complaint letters citing exact UK consumer law in 30 seconds. Our AI knows the legislation that applies to your case.
                </p>
                <ul className="space-y-3 mb-8">
                  {[
                    'Cites Consumer Rights Act 2015, EU261/UK261, and more',
                    'Covers energy, broadband, parking, flights, debt, HMRC',
                    '3 free letters per month, unlimited on paid plans',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-mint-400 mt-0.5 shrink-0" />
                      <span className="text-slate-300 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
                {WAITLIST_MODE ? (
                  <a href="#waitlist" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] inline-flex items-center gap-2">
                    Generate Your Letter <ChevronRight className="h-4 w-4" />
                  </a>
                ) : (
                  <Link href="/auth/signup" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] inline-flex items-center gap-2">
                    Generate Your Letter <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
              <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card]">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-500/60" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
                  <div className="w-3 h-3 rounded-full bg-green-500/60" />
                </div>
                <div className="space-y-3">
                  <div className="bg-navy-800 rounded-lg p-3">
                    <p className="text-slate-500 text-xs mb-1">Category</p>
                    <p className="text-white text-sm">Energy Bill Dispute</p>
                  </div>
                  <div className="bg-navy-800 rounded-lg p-3">
                    <p className="text-slate-500 text-xs mb-1">Provider</p>
                    <p className="text-white text-sm">British Gas</p>
                  </div>
                  <div className="bg-navy-800 rounded-lg p-3">
                    <p className="text-slate-500 text-xs mb-1">AI-Generated Letter Preview</p>
                    <p className="text-slate-400 text-xs leading-relaxed">Dear Sir/Madam, I am writing to formally dispute my energy bill dated 15 March 2026. Under the Consumer Rights Act 2015, Section 49, services must be carried out with reasonable care...</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Energy', href: '/deals/energy' },
                      { label: 'Broadband', href: '/deals/broadband' },
                      { label: 'Parking', href: '/dashboard/forms' },
                      { label: 'Flights', href: '/dashboard/forms' },
                      { label: 'Debt', href: '/dashboard/forms' },
                      { label: 'HMRC', href: '/dashboard/forms' },
                    ].map(cat => (
                      <Link key={cat.label} href={cat.href} className="text-xs bg-mint-400/10 text-mint-400 px-2 py-1 rounded-full border border-mint-400/20 hover:bg-mint-400/20 transition-all">{cat.label}</Link>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Feature Section 2: Smart Subscription Tracking */}
        <section className="py-20 md:py-28 bg-navy-900/30">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto"
            >
              <div className="order-2 md:order-1 bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card]">
                <div className="space-y-3">
                  {[
                    { name: 'Netflix', cost: '£15.99/mo', status: 'Active', colour: 'text-red-400' },
                    { name: 'Spotify', cost: '£10.99/mo', status: 'Active', colour: 'text-green-400' },
                    { name: 'Sky Broadband', cost: '£32.00/mo', status: 'Renews in 14 days', colour: 'text-yellow-400' },
                    { name: 'Gym Membership', cost: '£45.00/mo', status: 'Cancel suggested', colour: 'text-red-400' },
                  ].map((sub) => (
                    <div key={sub.name} className="flex items-center justify-between bg-navy-800 rounded-lg p-3">
                      <div>
                        <p className="text-white text-sm font-medium">{sub.name}</p>
                        <p className={`text-xs ${sub.colour}`}>{sub.status}</p>
                      </div>
                      <p className="text-slate-300 text-sm font-mono">{sub.cost}</p>
                    </div>
                  ))}
                  <div className="bg-mint-400/10 border border-mint-400/20 rounded-lg p-3 text-center">
                    <p className="text-mint-400 text-sm font-semibold">Total: £103.98/mo</p>
                    <p className="text-slate-500 text-xs">£1,247.76/year</p>
                  </div>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-brand-400/10 px-3 py-1.5 text-xs text-brand-400 border border-brand-400/20 mb-6">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Auto-Detection</span>
                </div>
                <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                  Smart Subscription Tracking
                </h2>
                <p className="text-slate-400 text-lg leading-relaxed mb-6">
                  Connect your bank and we automatically detect every subscription, direct debit, and recurring payment. Get renewal alerts and AI cancellation emails.
                </p>
                <ul className="space-y-3 mb-8">
                  {[
                    'Auto-detect subscriptions from your bank transactions',
                    'Renewal alerts at 30, 14, and 7 days before contracts end',
                    'AI cancellation emails citing UK consumer law',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-brand-400 mt-0.5 shrink-0" />
                      <span className="text-slate-300 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
                {ctaButton}
              </div>
            </motion.div>
          </div>
        </section>

        {/* Feature Section 3: Find Better Deals */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto"
            >
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-mint-400/10 px-3 py-1.5 text-xs text-mint-400 border border-mint-400/20 mb-6">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Deal Comparison</span>
                </div>
                <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                  Find Better Deals
                </h2>
                <p className="text-slate-400 text-lg leading-relaxed mb-6">
                  We analyse your bills and show you cheaper alternatives from 50+ UK providers. Energy, broadband, mobile, insurance, and more.
                </p>
                <ul className="space-y-3 mb-8">
                  {[
                    '56 deals across 9 categories from top UK providers',
                    'Personalised recommendations based on your real spending',
                    'Alerts before contracts renew so you never overpay',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-mint-400 mt-0.5 shrink-0" />
                      <span className="text-slate-300 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/deals" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] inline-flex items-center gap-2">
                  Browse Deals Free <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card]">
                <div className="space-y-3">
                  {['Energy', 'Broadband', 'Mobile', 'Insurance', 'Mortgages', 'Loans', 'Credit Cards', 'Car Finance', 'Travel'].map(cat => (
                    <div key={cat} className="flex items-center justify-between bg-navy-800 rounded-lg px-4 py-2.5">
                      <span className="text-slate-300 text-sm">{cat}</span>
                      <span className="text-mint-400 text-xs font-medium">View deals &rarr;</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-20 md:py-28 bg-navy-900/30 scroll-mt-16">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">How it works</h2>
              <p className="text-slate-400 text-lg">Three simple steps to start saving money</p>
            </motion.div>

            <div className="max-w-4xl mx-auto">
              <div className="grid md:grid-cols-3 gap-8 relative">
                {/* Connecting line (desktop only) */}
                <div className="hidden md:block absolute top-12 left-[20%] right-[20%] h-0.5 bg-gradient-to-r from-mint-400/50 via-brand-400/50 to-mint-400/50" />

                {[
                  { num: '1', title: 'Describe your issue', desc: 'Tell us what happened. Energy overcharge, flight delay, unfair bill - any consumer dispute.', icon: FileText },
                  { num: '2', title: 'AI generates your letter', desc: 'Our AI writes a formal complaint letter citing the exact UK legislation that applies to your case.', icon: Sparkles },
                  { num: '3', title: 'Send and get your money back', desc: 'Copy your letter, send it to the company, and let the law do the heavy lifting.', icon: Banknote },
                ].map((step, i) => (
                  <motion.div
                    key={step.num}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: i * 0.15 }}
                    className="relative text-center"
                  >
                    <div className="bg-mint-400 text-navy-950 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-6 relative z-10 shadow-[--shadow-glow-mint]">
                      {step.num}
                    </div>
                    <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:shadow-[--shadow-card-hover] transition-all duration-200">
                      <step.icon className="h-8 w-8 text-mint-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                      <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">What our users say</h2>
              <p className="text-slate-400 text-lg">Real results from real UK consumers</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                { quote: 'I got £520 back from EasyJet for a flight delay I had forgotten about. The letter took 30 seconds to generate.', name: 'Sarah T.', location: 'Manchester', saved: '£520' },
                { quote: 'Found three subscriptions I had completely forgotten about. Cancelled them all using the AI emails. Saving over £40 a month now.', name: 'James M.', location: 'London', saved: '£480/yr' },
                { quote: 'Disputed my energy bill and got a £150 credit. The letter cited the exact Ofgem rules. The company responded within a week.', name: 'Rachel K.', location: 'Birmingham', saved: '£150' },
              ].map((testimonial, i) => (
                <motion.div
                  key={testimonial.name}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card] hover:shadow-[--shadow-card-hover] transition-all duration-200"
                >
                  <div className="flex gap-1 mb-4">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className="h-4 w-4 text-mint-400 fill-mint-400" />
                    ))}
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">&ldquo;{testimonial.quote}&rdquo;</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium">{testimonial.name}</p>
                      <p className="text-slate-500 text-xs">{testimonial.location}</p>
                    </div>
                    <div className="bg-mint-400/10 border border-mint-400/20 rounded-lg px-3 py-1">
                      <p className="text-mint-400 text-sm font-bold">Saved {testimonial.saved}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Waitlist Form */}
        <div id="waitlist" className="scroll-mt-24">
          <section className="py-20 md:py-28 bg-navy-900/30">
            <div className="container mx-auto px-4 md:px-6">
              <div className="max-w-xl mx-auto">
                <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-8 shadow-[--shadow-card]">
                  {WAITLIST_MODE && (
                    <div className="flex items-center justify-center gap-2 mb-6 text-sm text-slate-400">
                      <Users className="h-4 w-4 text-mint-400" />
                      {waitlistCount && waitlistCount > 0 ? (
                        <span>Join <span className="text-white font-semibold">{waitlistCount.toLocaleString()}</span> {waitlistCount === 1 ? 'other' : 'others'} on the waitlist</span>
                      ) : (
                        <span>Be the first on the waitlist</span>
                      )}
                    </div>
                  )}

                  {success ? (
                    <div className="text-center py-8">
                      <div className="bg-mint-400/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="h-8 w-8 text-mint-400" />
                      </div>
                      <h3 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-white mb-2">You&apos;re on the list!</h3>
                      <p className="text-slate-400">We&apos;ll email you when we launch. Get ready to get your money back.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {WAITLIST_MODE && (
                        <div className="text-center mb-2">
                          <h3 className="font-[family-name:var(--font-heading)] text-xl font-bold text-white mb-1">Get early access</h3>
                          <p className="text-slate-400 text-sm">Be first in line when we launch. No spam, ever.</p>
                        </div>
                      )}

                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">Full name</label>
                        <input type="text" id="name" required value={name} onChange={(e) => setName(e.target.value)}
                          className="w-full px-4 py-3 bg-navy-950 border border-navy-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400 transition-all"
                          placeholder="Enter your name" />
                      </div>

                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">Email address</label>
                        <input type="email" id="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 bg-navy-950 border border-navy-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400 transition-all"
                          placeholder="you@example.com" />
                      </div>

                      {error && <p className="text-red-400 text-sm">{error}</p>}

                      <button type="submit" disabled={loading}
                        className="w-full bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-4 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] disabled:opacity-50 disabled:cursor-not-allowed">
                        {loading ? 'Joining...' : WAITLIST_MODE ? 'Join the waitlist' : 'Create Free Account'}
                      </button>

                      <p className="text-center text-sm text-slate-500 mt-4">Free to join. No credit card required.</p>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* CTA Banner */}
        <section className="py-20 md:py-28 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-mint-400/5 via-brand-400/5 to-mint-400/5" />
          <div className="container mx-auto px-4 md:px-6 relative">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mx-auto text-center"
            >
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                Ready to get your money back?
              </h2>
              <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">
                Most UK households are being overcharged by over £1,000 a year. Paybacker finds it, disputes it, and cancels it in minutes.
              </p>
              {WAITLIST_MODE ? (
                <a href="#waitlist" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] text-lg inline-flex items-center gap-2">
                  Get Started Free <ArrowRight className="h-5 w-5" />
                </a>
              ) : (
                <Link href={isLoggedIn ? '/dashboard' : '/auth/signup'} className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] text-lg inline-flex items-center gap-2">
                  {isLoggedIn ? 'Go to Dashboard' : 'Get Started Free'} <ArrowRight className="h-5 w-5" />
                </Link>
              )}
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-navy-700/50 bg-navy-950">
        <div className="container mx-auto px-4 md:px-6 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/pricing" className="text-slate-500 hover:text-white transition-all">Pricing</Link></li>
                <li><Link href="/deals" className="text-slate-500 hover:text-white transition-all">Deals</Link></li>
                <li><Link href="/auth/signup" className="text-slate-500 hover:text-white transition-all">Get Started</Link></li>
                <li><Link href="/auth/login" className="text-slate-500 hover:text-white transition-all">Sign In</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/blog" className="text-slate-500 hover:text-white transition-all">Blog</Link></li>
                <li><Link href="/about" className="text-slate-500 hover:text-white transition-all">About</Link></li>
                <li><Link href="/deals" className="text-slate-500 hover:text-white transition-all">Deal Comparison</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy-policy" className="text-slate-500 hover:text-white transition-all">Privacy Policy</Link></li>
                <li><Link href="/legal/terms" className="text-slate-500 hover:text-white transition-all">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Contact</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="mailto:hello@paybacker.co.uk" className="text-slate-500 hover:text-white transition-all">hello@paybacker.co.uk</a></li>
                <li><a href="mailto:support@paybacker.co.uk" className="text-slate-500 hover:text-white transition-all">support@paybacker.co.uk</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-navy-700/50 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Image src="/logo.png" alt="Paybacker" width={24} height={24} className="rounded-lg" />
              <span className="text-slate-500 text-sm">&copy; 2026 Paybacker LTD. All rights reserved.</span>
            </div>
            <div className="flex items-center gap-4 text-slate-600 text-xs">
              <span>🇬🇧 Made in the UK</span>
              <span>🛡️ ICO Registered</span>
              <span>🔒 GDPR Compliant</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
