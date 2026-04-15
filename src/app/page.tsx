'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CheckCircle, Sparkles, TrendingUp, Scale, CreditCard, Banknote, Check, X, ArrowRight, ChevronRight, MessageCircle, Zap, FileEdit, Bell, BadgeCheck, Shield, PieChart, Activity, LayoutDashboard } from 'lucide-react';
import { capture } from '@/lib/posthog';
import { motion } from 'framer-motion';
import PublicNavbar from '@/components/PublicNavbar';
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const [trialActive, setTrialActive] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [claimingFounder, setClaimingFounder] = useState(false);
  const [claimResult, setClaimResult] = useState<string | null>(null);
  const [publicStats, setPublicStats] = useState<{ lettersGenerated: number; subscriptionsTracked: number; usersJoined: number; foundingSpots: number } | null>(null);

  // Try-before-signup letter generator state
  const [previewCategory, setPreviewCategory] = useState('energy');
  const [previewDescription, setPreviewDescription] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

    // Check if free trial is available
    fetch('/api/founding-member')
      .then(r => r.json())
      .then(d => { if (d.active) setTrialActive(true); })
      .catch(() => {});

    // Fetch public stats for social proof and founding counter
    fetch('/api/stats/public')
      .then(r => r.json())
      .then(d => setPublicStats(d))
      .catch(() => {});

  }, []);

  const ctaButton = (
    <Link href="/auth/signup" className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold px-8 py-4 rounded-xl transition-all shadow-lg shadow-amber-500/25 text-center text-lg">
      {trialActive ? `Start Free 14-Day Pro Trial` : 'Create Free Account'}
    </Link>
  );

  const spotsRemaining = publicStats?.foundingSpots ?? null;
  const spotsColour = spotsRemaining !== null && spotsRemaining < 200 ? 'text-red-400' : spotsRemaining !== null && spotsRemaining < 500 ? 'text-amber-400' : 'text-mint-400';

  const foundingBanner = (
    <div className="space-y-3 mb-6">
      {trialActive && (
        <div className="bg-gradient-to-r from-mint-400/10 to-mint-500/10 border border-mint-400/30 rounded-2xl px-6 py-4 text-center">
          <p className="text-mint-400 font-bold text-lg mb-1">
            Try Pro FREE for 14 days
          </p>
          <p className="text-slate-400 text-sm">
            Unlimited complaint letters, bank scanning, spending intelligence, renewal alerts, and more. No card required.
          </p>
        </div>
      )}
      {spotsRemaining !== null && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-6 py-3 text-center">
          <p className="text-amber-400 text-sm font-semibold">
            <span className={`font-bold text-base ${spotsColour}`}>{spotsRemaining.toLocaleString()}</span> of 1,000 founding member spots remaining — price increases after first 1,000 members
          </p>
        </div>
      )}
    </div>
  );

  const handlePreviewGenerate = async () => {
    if (!previewCategory) return;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewResult(null);
    capture('preview_generate_click', { category: previewCategory });
    try {
      const res = await fetch('/api/complaints/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: previewCategory, description: previewDescription }),
      });
      if (res.status === 429) {
        setPreviewError('You have reached the preview limit. Sign up free to generate unlimited letters.');
        return;
      }
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      setPreviewResult(data.preview || '');
      // Store in session so it's waiting after signup
      try {
        sessionStorage.setItem('pb_preview_letter', JSON.stringify({ category: previewCategory, preview: data.preview }));
      } catch {}
    } catch {
      setPreviewError('Something went wrong. Try again or sign up to generate.');
    } finally {
      setPreviewLoading(false);
    }
  };

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
        <div className="container mx-auto px-4 md:px-6 pt-4">
          <div className="max-w-4xl mx-auto">
            {foundingBanner}
          </div>
        </div>

        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-mint-400/5 via-transparent to-transparent" />
          <div className="container mx-auto px-4 md:px-6 pt-16 md:pt-28 pb-20">
            <div className="max-w-4xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-mint-400/10 px-4 py-2 text-sm text-mint-400 border border-mint-400/20 mb-8">
                <CheckCircle className="h-4 w-4" />
                <span>{trialActive ? 'Free 14-day Pro trial. No card required.' : '100% free to try. No credit card needed.'}</span>
              </div>

              <h1 className="font-[family-name:var(--font-heading)] text-4xl md:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
                Find Hidden Overcharges.{' '}
                <span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">
                  Fight Unfair Bills.
                </span>{' '}
                Get Your Money Back.
              </h1>

              <p className="text-slate-300 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto mb-10">
                Paybacker scans your bank and email to spot overcharges, forgotten subscriptions, and unfair bills — then generates professional complaint letters citing UK law in 30 seconds.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                <Link href="/auth/signup" className="w-full sm:w-auto bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-8 py-4 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] text-center text-lg inline-flex items-center justify-center gap-2">
                  {trialActive ? 'Start Free 14-Day Pro Trial' : 'Find What You\'re Overpaying'} <ArrowRight className="h-5 w-5" />
                </Link>
                <a href="#how-it-works" className="border border-navy-700 hover:border-mint-400/50 text-slate-300 hover:text-white px-8 py-4 rounded-xl transition-all duration-200 text-center text-lg inline-flex items-center justify-center gap-2">
                  See How It Works
                </a>
              </div>

              {/* Core Features Overview */}
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="flex flex-wrap items-center justify-center gap-3"
              >
                {[
                  { icon: Scale, label: 'Disputes Centre', desc: 'AI letters citing UK law' },
                  { icon: Banknote, label: 'Overcharge Detection', desc: 'Bank + email scanning' },
                  { icon: CreditCard, label: 'Subscription Finder', desc: 'Track & cancel' },
                  { icon: TrendingUp, label: 'Better Deals', desc: 'Compare & switch to save' },
                ].map((item) => (
                  <motion.div
                    key={item.label}
                    variants={fadeUp}
                    className="flex items-center gap-2 bg-navy-900/60 border border-navy-700/40 rounded-full px-4 py-2 hover:border-mint-400/30 transition-all"
                  >
                    <item.icon className="h-3.5 w-3.5 text-mint-400 shrink-0" />
                    <span className="text-slate-300 text-xs font-medium">{item.label}</span>
                    <span className="text-slate-600 text-xs hidden sm:inline">&mdash; {item.desc}</span>
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
                { name: 'ICO Registered', sub: 'Data Protection', icon: '🛡️', link: undefined as string | undefined },
                { name: 'FCA-Authorised Provider', sub: 'Open Banking via Yapily', icon: '✅', link: 'https://register.fca.org.uk/' as string | undefined },
                { name: 'Stripe', sub: 'Secure Payments', icon: '🔒', link: undefined as string | undefined },
                { name: 'GDPR Compliant', sub: 'UK Data Laws', icon: '📋', link: undefined as string | undefined },
                { name: 'UK Company', sub: 'Paybacker LTD', icon: '🇬🇧', link: undefined as string | undefined },
              ].map((badge) => (
                <div key={badge.name} className="flex items-center gap-2">
                  <span className="text-lg">{badge.icon}</span>
                  <div>
                    {badge.link ? (
                      <a href={badge.link} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-mint-400 font-semibold text-xs transition-colors">{badge.name}</a>
                    ) : (
                      <p className="text-slate-400 font-semibold text-xs">{badge.name}</p>
                    )}
                    <p className="text-slate-600 text-[10px]">{badge.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mission Band */}
        <section className="py-20 border-b border-navy-700/50">
          <div className="container mx-auto px-4 md:px-6">
            <div className="max-w-3xl mx-auto text-center">
              <p className="text-mint-400 text-sm font-semibold uppercase tracking-widest mb-5">Why We Exist</p>
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-5xl font-extrabold text-white tracking-tight mb-6 leading-tight">
                Stop overpaying.{' '}
                <span className="bg-gradient-to-r from-mint-400 to-brand-400 bg-clip-text text-transparent">
                  Start fighting back.
                </span>
              </h2>
              <p className="text-slate-300 text-lg leading-relaxed mb-4">
                Every energy company, broadband provider, and subscription service in the UK runs the same playbook: bury the price rises, complicate the cancellation process, and bank on you being too busy to notice.
              </p>
              <p className="text-slate-300 text-lg leading-relaxed mb-8">
                The system is designed to wear you down. Paybacker was built to make sure it doesn&apos;t.
              </p>
              <p className="text-slate-400 text-base leading-relaxed mb-10">
                UK law is actually on your side. The Consumer Rights Act 2015, Ofgem&apos;s billing codes, UK261 for flight delays — the tools to fight back exist. Most people just don&apos;t have the time or knowledge to use them. We change that.
              </p>
              <p className="text-white font-semibold text-lg tracking-wide">
                Know your rights. Fight for your rights. Paybacker makes it simple.
              </p>
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
                  Disputes Centre
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
                <Link href="/auth/signup" className="bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold px-6 py-3 rounded-xl transition-all duration-200 shadow-[--shadow-glow-mint] inline-flex items-center gap-2">
                  Generate Your Letter <ChevronRight className="h-4 w-4" />
                </Link>
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
                    {(
                      [
                        { label: 'Energy', href: '/deals/energy' },
                        { label: 'Broadband', href: '/deals/broadband' },
                        { label: 'Parking', href: '/dashboard/complaints?type=parking_appeal&new=1', type: 'parking_appeal' },
                        { label: 'Flights', href: '/dashboard/complaints?type=flight_compensation&new=1', type: 'flight_compensation' },
                        { label: 'Debt', href: '/dashboard/complaints?type=debt_dispute&new=1', type: 'debt_dispute' },
                        { label: 'HMRC', href: '/dashboard/complaints?type=hmrc_tax_rebate&new=1', type: 'hmrc_tax_rebate' },
                      ] as { label: string; href: string; type?: string }[]
                    ).map(cat => (
                      <Link
                        key={cat.label}
                        href={cat.href}
                        onClick={() => {
                          if (cat.type) sessionStorage.setItem('pb_preview_letter', JSON.stringify({ type: cat.type }));
                        }}
                        className="text-xs bg-mint-400/10 text-mint-400 px-2 py-1 rounded-full border border-mint-400/20 hover:bg-mint-400/20 transition-all"
                      >{cat.label}</Link>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Try Before Signup: Letter Generator */}
        <section className="py-16 md:py-24 bg-navy-900/50 border-y border-navy-700/50">
          <div className="container mx-auto px-4 md:px-6">
            <div className="max-w-2xl mx-auto text-center mb-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-sm text-amber-400 border border-amber-500/20 mb-4">
                <Sparkles className="h-4 w-4" />
                <span>Try it free — no account needed</span>
              </div>
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white mb-3">
                Generate a complaint letter now
              </h2>
              <p className="text-slate-400">
                See the quality of our AI letters in 30 seconds. No sign up required.
              </p>
            </div>

            <div className="max-w-xl mx-auto">
              <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-xl">
                {!previewResult ? (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-slate-300 mb-2">What&apos;s the issue?</label>
                      <select
                        value={previewCategory}
                        onChange={e => setPreviewCategory(e.target.value)}
                        className="w-full bg-navy-800 border border-navy-700/50 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-mint-400/50"
                      >
                        <option value="energy">Energy bill too high</option>
                        <option value="broadband">Broadband / internet issues</option>
                        <option value="flight_delay">Flight delay compensation</option>
                        <option value="subscription">Subscription won&apos;t cancel</option>
                        <option value="refund">Refund request</option>
                        <option value="council_tax">Council tax band challenge</option>
                        <option value="mobile">Mobile contract dispute</option>
                        <option value="parking">Parking charge appeal</option>
                        <option value="insurance">Insurance claim dispute</option>
                      </select>
                    </div>
                    <div className="mb-5">
                      <label className="block text-sm font-medium text-slate-300 mb-2">Brief description <span className="text-slate-500">(optional — for a personalised letter)</span></label>
                      <textarea
                        value={previewDescription}
                        onChange={e => setPreviewDescription(e.target.value)}
                        placeholder="e.g. My energy bill went up 40% with no warning in January..."
                        rows={3}
                        className="w-full bg-navy-800 border border-navy-700/50 text-white rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-mint-400/50 placeholder-slate-600"
                      />
                    </div>
                    {previewError && (
                      <p className="text-red-400 text-sm mb-4 bg-red-400/10 rounded-lg px-3 py-2">{previewError}</p>
                    )}
                    <button
                      onClick={handlePreviewGenerate}
                      disabled={previewLoading}
                      className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                    >
                      {previewLoading ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Generating your letter...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          Generate free preview
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="h-5 w-5 text-green-400" />
                      <p className="text-white font-semibold text-sm">Your letter is ready</p>
                    </div>
                    <div className="bg-navy-800 rounded-xl p-4 mb-3 text-sm text-slate-300 leading-relaxed border border-navy-700/50">
                      {previewResult}
                    </div>
                    <div className="relative rounded-xl overflow-hidden mb-4">
                      <div className="bg-navy-800 p-4 text-sm text-slate-300 leading-relaxed border border-navy-700/50 select-none">
                        <p className="blur-sm">I therefore request that you investigate this matter and respond within 14 days with either a full refund of the overcharged amount, or a detailed written explanation of why the charges are justified under the terms of our agreement. I draw your attention to my statutory rights under the Consumer Rights Act 2015 and remind you that the Financial Ombudsman Service may be notified if this matter is not resolved satisfactorily.</p>
                        <p className="blur-sm mt-2">If I do not receive a satisfactory response within 14 days, I will escalate this matter to the relevant regulatory body, including Ofgem, Ofcom, the Financial Conduct Authority, or the appropriate ombudsman service as applicable. I retain the right to seek further remedies, including through the courts.</p>
                        <p className="blur-sm mt-2">Yours faithfully,<br />[Your Name]<br />[Your Address]<br />[Date]</p>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-navy-950/50 to-navy-950 flex items-end justify-center pb-4">
                        <Link
                          href="/auth/signup"
                          onClick={() => capture('preview_signup_cta_click', { category: previewCategory })}
                          className="inline-flex items-center gap-2 bg-mint-400 hover:bg-mint-500 text-navy-950 font-bold px-6 py-3 rounded-xl transition-all text-sm shadow-lg shadow-mint-400/20"
                        >
                          Sign up free to see the full letter
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                    <button
                      onClick={() => { setPreviewResult(null); setPreviewDescription(''); }}
                      className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                    >
                      Try a different issue
                    </button>
                  </div>
                )}
              </div>

              <p className="text-center text-slate-500 text-xs mt-4">
                Free users get 3 letters/month. Essential (£4.99/mo) gives unlimited letters.
              </p>
              <p className="text-center text-slate-600 text-xs mt-2">
                AI-generated letters are for guidance only and do not constitute legal advice. For complex disputes, always consult a qualified solicitor.
              </p>
            </div>
          </div>
        </section>

        {/* Meet Pocket Agent Showcase */}
        <section className="py-20 md:py-28 bg-navy-900/30 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/5 via-transparent to-transparent" />
          <div className="container mx-auto px-4 md:px-6 relative">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-14"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-sm text-amber-400 border border-amber-500/20 mb-6">
                <MessageCircle className="h-4 w-4" />
                <span>Available on all tiers</span>
              </div>
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                Meet{' '}
                <span className="bg-gradient-to-r from-amber-400 to-amber-500 bg-clip-text text-transparent">
                  Pocket Agent
                </span>
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
                Your AI financial agent lives in Telegram. Ask anything, fix everything — from your pocket.
              </p>
            </motion.div>

            <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
              {/* LEFT — Fake Telegram Chat Mockup */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
              >
                <div className="rounded-[2rem] border-2 border-slate-700/60 bg-slate-900 p-1.5 shadow-2xl max-w-md mx-auto lg:mx-0">
                  {/* Phone notch bar */}
                  <div className="flex items-center justify-center pt-2 pb-1">
                    <div className="w-24 h-5 bg-slate-800 rounded-full" />
                  </div>
                  {/* Telegram header */}
                  <div className="bg-[#1c2b3a] rounded-t-2xl px-4 py-3 flex items-center gap-3 border-b border-slate-700/40">
                    <div className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-navy-950 text-xs font-bold shrink-0">PA</div>
                    <div>
                      <p className="text-white text-sm font-semibold leading-tight">Pocket Agent</p>
                      <p className="text-slate-500 text-[11px]">online</p>
                    </div>
                  </div>
                  {/* Chat messages */}
                  <div className="bg-[#17212b] px-3 py-4 space-y-3 min-h-[420px] rounded-b-2xl">
                    {/* User message 1 */}
                    <div className="flex justify-end">
                      <div className="bg-[#2b5278] text-white text-[13px] leading-relaxed rounded-2xl rounded-br-md px-3.5 py-2 max-w-[80%] shadow-sm">
                        How much did I spend on eating out this month?
                      </div>
                    </div>
                    {/* Bot message 1 */}
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-navy-950 text-[10px] font-bold shrink-0 mt-0.5">PA</div>
                      <div className="bg-[#182533] border-l-2 border-amber-500 text-slate-200 text-[13px] leading-relaxed rounded-2xl rounded-bl-md px-3.5 py-2.5 max-w-[85%] shadow-sm">
                        <p>You spent <span className="text-amber-400 font-semibold">£247.30</span> on eating out in March — that&apos;s 18% more than February (£209.15).</p>
                        <p className="mt-2 text-slate-400">Your top 3 were:</p>
                        <ul className="mt-1 space-y-0.5 text-slate-300">
                          <li>• Deliveroo — £89.40 (6 orders)</li>
                          <li>• Nando&apos;s — £52.80</li>
                          <li>• Costa Coffee — £38.60</li>
                        </ul>
                        <p className="mt-2 text-slate-400">Want me to set a budget alert for this category?</p>
                      </div>
                    </div>
                    {/* User message 2 */}
                    <div className="flex justify-end">
                      <div className="bg-[#2b5278] text-white text-[13px] leading-relaxed rounded-2xl rounded-br-md px-3.5 py-2 max-w-[80%] shadow-sm">
                        Yes, set it to £200
                      </div>
                    </div>
                    {/* Bot message 2 */}
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-navy-950 text-[10px] font-bold shrink-0 mt-0.5">PA</div>
                      <div className="bg-[#182533] border-l-2 border-amber-500 text-slate-200 text-[13px] leading-relaxed rounded-2xl rounded-bl-md px-3.5 py-2.5 max-w-[85%] shadow-sm">
                        <p><span className="text-amber-400 font-semibold">Done.</span> I&apos;ll message you when you hit 80% of your £200 eating out budget.</p>
                        <p className="mt-2">I&apos;ve also spotted that your Deliveroo Plus subscription renewed yesterday at <span className="text-amber-400 font-semibold">£7.99</span> — want me to check if there&apos;s a better deal?</p>
                      </div>
                    </div>
                    {/* Typing indicator */}
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-navy-950 text-[10px] font-bold shrink-0 mt-0.5">PA</div>
                      <div className="bg-[#182533] border-l-2 border-amber-500/40 rounded-2xl rounded-bl-md px-4 py-3 max-w-[60px] shadow-sm">
                        <div className="flex gap-1 items-center">
                          <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                          <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-pulse" style={{ animationDelay: '600ms' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* RIGHT — Feature Highlights */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="space-y-5 lg:pt-4"
              >
                {[
                  {
                    icon: <Zap className="h-5 w-5 text-amber-400" />,
                    title: 'Instant Answers',
                    desc: 'Ask about spending, bills, subscriptions — get answers in seconds.',
                  },
                  {
                    icon: <FileEdit className="h-5 w-5 text-amber-400" />,
                    title: 'One-Tap Complaints',
                    desc: 'Draft and send dispute letters without leaving the chat.',
                  },
                  {
                    icon: <Bell className="h-5 w-5 text-amber-400" />,
                    title: 'Proactive Alerts',
                    desc: 'Get warned about price increases, expiring contracts, and unusual spending.',
                  },
                  {
                    icon: <BadgeCheck className="h-5 w-5 text-amber-400" />,
                    title: 'Verified Savings',
                    desc: 'Track exactly how much Paybacker has saved you, automatically verified.',
                  },
                  {
                    icon: <Shield className="h-5 w-5 text-amber-400" />,
                    title: 'Bank-Grade Security',
                    desc: 'Your data is encrypted and only shared with regulated providers needed to deliver the service. We never sell your data.',
                  },
                ].map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: 0.15 + i * 0.08 }}
                    className="flex items-start gap-4 bg-navy-900 border border-navy-700/50 hover:border-amber-500/30 rounded-2xl p-5 transition-all shadow-[--shadow-card]"
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                      {feature.icon}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm mb-1">{feature.title}</h3>
                      <p className="text-slate-400 text-xs leading-relaxed">{feature.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* CTA Bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="max-w-3xl mx-auto mt-14 text-center bg-navy-900 border border-navy-700/50 rounded-2xl px-6 py-8 shadow-[--shadow-card]"
            >
              <p className="text-white font-semibold text-lg mb-4">
                Pocket Agent is available on all{' '}
                <span className="text-amber-400">membership tiers</span>
              </p>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-navy-950 font-semibold px-8 py-3 rounded-xl transition-all text-sm shadow-lg shadow-amber-500/20"
              >
                Upgrade to Pro <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="text-slate-500 text-xs mt-4">
                Available on Telegram. WhatsApp coming soon.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Feature Section 2.5: Money Hub (The Connector) */}
        <section className="py-20 md:py-28 border-t border-navy-700/50 relative overflow-hidden bg-navy-950">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
          <div className="container mx-auto px-4 md:px-6 relative">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-14"
            >
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-4 py-2 text-sm text-blue-400 border border-blue-500/20 mb-6">
                <LayoutDashboard className="h-4 w-4" />
                <span>The Control Centre</span>
              </div>
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                The <span className="text-blue-400">Money Hub</span>
              </h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
                Your entire financial life in one place. The Money Hub connects all our tools — powering your disputes, uncovering forgotten subscriptions, and finding better deals automatically.
              </p>
            </motion.div>

            <div className="max-w-5xl mx-auto relative">
              {/* Central Hub UI */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="bg-navy-900 border border-navy-700/50 rounded-3xl p-6 md:p-10 shadow-[--shadow-card] relative z-10 mx-auto max-w-3xl"
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 text-center mb-10">
                  <div className="bg-navy-800 rounded-2xl p-4 border border-navy-700/50">
                    <p className="text-slate-400 text-xs mb-1">Monthly Income</p>
                    <p className="text-white font-bold text-xl">£3,450</p>
                  </div>
                  <div className="bg-navy-800 rounded-2xl p-4 border border-navy-700/50">
                    <p className="text-slate-400 text-xs mb-1">Total Outgoings</p>
                    <p className="text-white font-bold text-xl">£2,120</p>
                  </div>
                  <div className="bg-navy-800 rounded-2xl p-4 border border-navy-700/50">
                    <p className="text-slate-400 text-xs mb-1">Projected Savings</p>
                    <p className="text-mint-400 font-bold text-xl">£1,330</p>
                  </div>
                  <div className="bg-navy-800 rounded-2xl p-4 border border-navy-700/50">
                    <p className="text-slate-400 text-xs mb-1">Savings Rate</p>
                    <p className="text-brand-400 font-bold text-xl">38.5%</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-navy-800 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                        <Activity className="h-5 w-5 text-red-500" />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">Overcharge Detected</p>
                        <p className="text-slate-400 text-xs">Virgin Media bill increased by £12</p>
                      </div>
                    </div>
                    <button className="text-xs bg-navy-800 hover:bg-navy-700 text-white px-3 py-1.5 rounded-lg border border-navy-700 transition-colors">
                      Draft Dispute
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between border-b border-navy-800 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-yellow-500/10 flex items-center justify-center">
                        <Bell className="h-5 w-5 text-yellow-500" />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">Contract Ending Soon</p>
                        <p className="text-slate-400 text-xs">Energy plan ends in 14 days</p>
                      </div>
                    </div>
                    <button className="text-xs bg-mint-400/10 hover:bg-mint-400/20 text-mint-400 px-3 py-1.5 rounded-lg border border-mint-400/20 transition-colors">
                      Compare Deals
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <MessageCircle className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">Pocket Agent Insight</p>
                        <p className="text-slate-400 text-xs">You spent £150 on takeaways this month</p>
                      </div>
                    </div>
                    <button className="text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-lg border border-amber-500/20 transition-colors">
                      Chat Now
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Connecting Lines / Explanations for Desktop */}
              <div className="hidden md:block absolute -left-12 top-1/4 max-w-xs text-right">
                <div className="flex items-center justify-end gap-3 mb-2">
                  <h4 className="text-white font-semibold text-sm">Open Banking Sync</h4>
                  <div className="w-8 h-[1px] bg-navy-600" />
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Automatically pulling in everyday transactions to analyse where your money goes.
                </p>
              </div>

              <div className="hidden md:block absolute -right-12 top-1/4 max-w-xs text-left">
                <div className="flex items-center justify-start gap-3 mb-2">
                  <div className="w-8 h-[1px] bg-navy-600" />
                  <h4 className="text-white font-semibold text-sm">Disputes Engine</h4>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Identifies unusual price hikes to trigger automatic AI complaints.
                </p>
              </div>

              <div className="hidden md:block absolute -left-12 bottom-1/4 max-w-xs text-right">
                <div className="flex items-center justify-end gap-3 mb-2">
                  <h4 className="text-white font-semibold text-sm">Deals & Switching</h4>
                  <div className="w-8 h-[1px] bg-navy-600" />
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Monitors existing subscriptions and recommends verified savings automatically.
                </p>
              </div>

              <div className="hidden md:block absolute -right-12 bottom-1/4 max-w-xs text-left">
                <div className="flex items-center justify-start gap-3 mb-2">
                  <div className="w-8 h-[1px] bg-navy-600" />
                  <h4 className="text-white font-semibold text-sm">Pocket Agent</h4>
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Feeds real-time data to your Telegram assistant so you can ask about any expense.
                </p>
              </div>
            </div>
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

        {/* Feature Section 3: AI Financial Assistant */}
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
                <div className="inline-flex items-center gap-2 rounded-full bg-purple-400/10 px-3 py-1.5 text-xs text-purple-400 border border-purple-400/20 mb-6">
                  <MessageCircle className="h-3.5 w-3.5" />
                  <span>AI Financial Assistant</span>
                </div>
                <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                  Manage your finances through conversation
                </h2>
                <p className="text-slate-400 text-lg leading-relaxed mb-6">
                  The only platform where AI actively helps you organise, categorise, and fix your financial data. Just tell it what to do.
                </p>
                <ul className="space-y-3 mb-8">
                  {[
                    'Recategorise transactions by name: "OneStream should be broadband"',
                    'Find missing subscriptions: "Find my Virgin Media payments"',
                    'Get spending insights: "What\'s my biggest expense this month?"',
                    'Every action confirmed before it\'s made, no surprises',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle className="h-5 w-5 text-purple-400 mt-0.5 shrink-0" />
                      <span className="text-slate-300 text-sm">{item}</span>
                    </li>
                  ))}
                </ul>
                {ctaButton}
              </div>
              <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 shadow-[--shadow-card]">
                <div className="flex items-center gap-2 mb-4 pb-3 border-b border-navy-700/50">
                  <MessageCircle className="h-4 w-4 text-purple-400" />
                  <span className="text-white text-sm font-medium">AI Financial Assistant</span>
                  <span className="ml-auto w-2 h-2 bg-green-400 rounded-full" />
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-end">
                    <div className="bg-purple-500 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%]">
                      My OneStream direct debit keeps appearing as bills but it&apos;s broadband
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-navy-800 text-slate-200 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[80%] space-y-1">
                      <p>I found 2 OneStream payments: £19.99/month. They&apos;re currently categorised as &quot;bills&quot;. I&apos;ll move them to &quot;broadband&quot; so they show correctly in your Money Hub. Shall I go ahead?</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <div className="bg-purple-500 text-white rounded-2xl rounded-br-sm px-4 py-2.5">
                      Yes please
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-navy-800 text-slate-200 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[80%]">
                      Done. OneStream is now under broadband and your spending dashboard has been updated.
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Feature Section 4: Find Better Deals */}
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
                    '53 deals across 9 categories from top UK providers',
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

        {/* What Happens After Signup */}
        <section id="how-it-works" className="py-20 md:py-28 bg-navy-900/30 scroll-mt-16">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">You&apos;re up and running in minutes</h2>
              <p className="text-slate-400 text-lg">No forms, no phone calls, no waiting. Three steps and you&apos;re saving money.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                {
                  step: '1',
                  title: 'Generate your first letter — free, instant',
                  desc: 'Describe your dispute and our AI produces a formal letter citing the exact UK law that applies. Takes 30 seconds. No account needed to try it.',
                  cta: 'Try it now',
                  href: '/auth/signup',
                  colour: 'mint',
                },
                {
                  step: '2',
                  title: 'Connect your bank to find hidden costs',
                  desc: 'Link your bank account securely via Open Banking. We automatically detect every subscription, direct debit, and forgotten recurring charge.',
                  cta: 'Connect bank',
                  href: '/auth/signup',
                  colour: 'brand',
                },
                {
                  step: '3',
                  title: 'Get personalised savings recommendations',
                  desc: 'Your dashboard shows exactly where you\'re overpaying, which contracts are about to renew, and the cheapest alternatives available right now.',
                  cta: 'See your dashboard',
                  href: '/auth/signup',
                  colour: 'mint',
                },
              ].map((item, i) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                  className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 relative shadow-[--shadow-card]"
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-navy-950 mb-4 ${item.colour === 'mint' ? 'bg-mint-400' : 'bg-brand-400'}`}>
                    {item.step}
                  </div>
                  <h3 className="text-white font-semibold mb-3 leading-snug">{item.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed mb-5">{item.desc}</p>
                  <a href={item.href} className={`text-sm font-medium inline-flex items-center gap-1 ${item.colour === 'mint' ? 'text-mint-400 hover:text-mint-300' : 'text-brand-400 hover:text-brand-300'} transition-all`}>
                    {item.cta} <ChevronRight className="h-3.5 w-3.5" />
                  </a>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Plan Comparison Table */}
        <section id="pricing" className="py-20 md:py-28">
          <div className="container mx-auto px-4 md:px-6">
            <div className="text-center mb-12">
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">Choose your plan</h2>
              <p className="text-slate-400 text-lg max-w-2xl mx-auto">Start free. Upgrade when you want unlimited access, daily scanning, and full financial intelligence.</p>
            </div>

            <div className="max-w-5xl mx-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-navy-700/50">
                    <th className="text-left py-4 px-3 text-slate-500 font-normal text-xs uppercase tracking-wider">Feature</th>
                    <th className="text-center py-4 px-3 w-[140px] align-top">
                      <span className="text-white font-bold text-base block mb-0.5">Free</span>
                      <span className="text-slate-500 text-xs font-semibold block mb-2">£0/month</span>
                      <span className="text-slate-400 text-[10px] leading-tight font-normal">Try Paybacker with 3 complaint letters. See what we can do.</span>
                    </th>
                    <th className="text-center py-4 px-3 w-[140px] bg-mint-400/5 rounded-t-xl align-top">
                      <span className="inline-block bg-mint-400 text-navy-950 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1">MOST POPULAR</span>
                      <span className="text-mint-400 font-bold text-base block mb-0.5">Essential</span>
                      <span className="text-slate-400 text-xs font-semibold block mb-2">£4.99/month</span>
                      <span className="text-slate-300 text-[10px] leading-tight font-normal">Let Paybacker scan your inbox, find subscriptions, and cancel them automatically</span>
                    </th>
                    <th className="text-center py-4 px-3 w-[140px] align-top">
                      <span className="text-brand-400 font-bold text-base block mb-0.5">Pro</span>
                      <span className="text-slate-400 text-xs font-semibold block mb-2">£9.99/month</span>
                      <span className="text-slate-300 text-[10px] leading-tight font-normal">Full financial picture with Open Banking + spending insights</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'AI Complaint Letters', sub: 'Energy, broadband, flights, parking, debt, HMRC', free: '3/month', essential: 'Unlimited', pro: 'Unlimited' },
                    { label: 'Bank Accounts', sub: 'Auto-detect subscriptions and recurring charges', free: 'One-time scan', essential: '1 account, daily sync', pro: 'Unlimited accounts' },
                    { label: 'Email Scanning', sub: 'Gmail, Outlook, Yahoo — find hidden costs', free: 'One-time scan', essential: 'Daily re-scans', pro: 'Daily re-scans' },
                    { label: 'Money Hub & Budgets', sub: 'Spending intelligence, budget planner, goals', free: 'Top 5 categories', essential: 'Full dashboard', pro: 'Full + transactions' },
                    { label: 'Contract AI Analysis', sub: 'Renewal reminders, price increase alerts', free: false, essential: true, pro: true },
                    { label: 'Pocket Agent', sub: 'AI assistant in Telegram — spending, disputes, alerts', free: true, essential: true, pro: true, isNew: true },
                    { label: 'Priority Support', sub: 'Faster response times', free: false, essential: false, pro: true },
                  ].map((row, i) => (
                    <tr key={i} className="border-b border-navy-700/20 hover:bg-navy-900/30 transition-colors">
                      <td className="py-3 px-3">
                        <span className="text-white text-sm font-medium block">
                          {row.label}
                          {'isNew' in row && row.isNew && (
                            <span className="ml-2 inline-block bg-amber-500 text-navy-950 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle">NEW</span>
                          )}
                        </span>
                        <span className="text-slate-500 text-xs">{row.sub}</span>
                      </td>
                      {[row.free, row.essential, row.pro].map((val, j) => (
                        <td key={j} className={`py-3 px-3 text-center ${j === 1 ? 'bg-mint-400/5' : ''}`}>
                          {val === true ? (
                            <Check className="h-5 w-5 text-mint-400 mx-auto" />
                          ) : val === false ? (
                            <X className="h-4 w-4 text-slate-700 mx-auto" />
                          ) : (
                            <span className={`text-xs font-medium ${val === 'Unlimited' || val === 'Unlimited accounts' ? 'text-mint-400' : 'text-slate-300'}`}>{val}</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* CTA row below table */}
              <div className="grid grid-cols-4 gap-0 mt-4">
                <div />
                <div className="text-center px-3">
                  <Link href="/auth/signup" className="block w-full bg-navy-800 hover:bg-navy-700 text-white font-semibold py-3 rounded-xl transition-all text-sm border border-navy-700/50">
                    Start Free
                  </Link>
                </div>
                <div className="text-center px-3">
                  <Link href="/pricing" className="block w-full bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-xl transition-all text-sm">
                    Get Essential
                  </Link>
                </div>
                <div className="text-center px-3">
                  <Link href="/pricing" className="block w-full bg-brand-400 hover:bg-brand-500 text-navy-950 font-semibold py-3 rounded-xl transition-all text-sm">
                    Get Pro
                  </Link>
                </div>
              </div>
              <div className="text-center mt-4">
                <Link href="/pricing" className="text-slate-500 hover:text-slate-300 text-sm transition-all inline-flex items-center gap-1">
                  See full feature comparison <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Social Proof — Live Stats */}
        <section className="py-20 md:py-28">
          <div className="container mx-auto px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <h2 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">Real numbers, real savings</h2>
              <p className="text-slate-400 text-lg">We&apos;re just getting started — here&apos;s where we are right now</p>
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-12">
              {[
                { value: publicStats ? `${publicStats.lettersGenerated.toLocaleString()}` : '...', label: 'Letters generated', sub: 'and counting' },
                { value: publicStats ? `${publicStats.subscriptionsTracked.toLocaleString()}` : '...', label: 'Subscriptions tracked', sub: 'across all users' },
                { value: publicStats ? `${publicStats.usersJoined.toLocaleString()}` : '...', label: 'Members joined', sub: 'founding member pricing active' },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="bg-navy-900 border border-navy-700/50 rounded-2xl p-6 text-center shadow-[--shadow-card]"
                >
                  <p className="text-3xl font-bold text-mint-400 mb-1 font-[family-name:var(--font-heading)]">{stat.value}</p>
                  <p className="text-white text-sm font-medium mb-0.5">{stat.label}</p>
                  <p className="text-slate-500 text-xs">{stat.sub}</p>
                </motion.div>
              ))}
            </div>

            {/* Trustpilot — hidden until reviews are collected */}
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
                <li><Link href="/terms-of-service" className="text-slate-500 hover:text-white transition-all">Terms of Service</Link></li>
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
