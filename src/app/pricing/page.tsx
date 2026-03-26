'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PRICE_IDS } from '@/lib/stripe';
import Image from 'next/image';
import { Check, Sparkles, TrendingUp, Zap, Users, Gift } from 'lucide-react';
import { WAITLIST_MODE } from '@/lib/config';
import PublicNavbar from '@/components/PublicNavbar';
import { capture } from '@/lib/posthog';
import { motion } from 'framer-motion';

const plans = [
  {
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    description: 'See what Paybacker can do for you',
    features: [
      '3 AI complaint/form letters per month',
      'Unlimited subscription tracking (manual add)',
      'One-time bank scan to detect subscriptions',
      'One-time email inbox scan',
      'One-time opportunity scan',
      'Basic spending overview (top 5 categories)',
      'AI support chatbot',
    ],
    cta: 'Get started free',
    waitlistCta: 'Join Waitlist - Free',
    highlighted: false,
    trial: false,
    planKey: 'free' as const,
  },
  {
    name: 'Essential',
    price: { monthly: 4.99, yearly: 44.99 },
    description: 'Keep your finances on track automatically',
    features: [
      'Unlimited AI complaint and form letters',
      '1 bank account with daily auto-sync',
      'Monthly email inbox re-scans',
      'Monthly opportunity re-scans',
      'Full spending intelligence dashboard',
      'Cancellation emails citing UK consumer law',
      'Renewal reminders (30, 14, 7 days before)',
      'Contract end date tracking',
    ],
    cta: 'Subscribe to Essential',
    waitlistCta: 'Join Waitlist - Essential',
    highlighted: true,
    trial: false,
    planKey: 'essential' as const,
    priceIds: {
      monthly: PRICE_IDS.essential_monthly,
      yearly:  PRICE_IDS.essential_yearly,
    },
  },
  {
    name: 'Pro',
    price: { monthly: 9.99, yearly: 94.99 },
    description: 'Complete financial control',
    features: [
      'Everything in Essential',
      'Unlimited bank accounts',
      'Unlimited email and opportunity scans',
      'Full transaction-level analysis',
      'Automated cancellations (coming soon)',
      'Priority support with faster response',
    ],
    cta: 'Subscribe to Pro',
    waitlistCta: 'Join Waitlist - Pro',
    highlighted: false,
    trial: false,
    planKey: 'pro' as const,
    priceIds: {
      monthly: PRICE_IDS.pro_monthly,
      yearly:  PRICE_IDS.pro_yearly,
    },
  },
];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistPlan, setWaitlistPlan] = useState<string | null>(null);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [waitlistError, setWaitlistError] = useState('');
  const [foundingSpots, setFoundingSpots] = useState<number | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    fetch('/api/founding-member')
      .then(r => r.json())
      .then(d => { if (d.active) setFoundingSpots(d.remaining); })
      .catch(() => {});
  }, []);

  const handleSubscribe = async (priceId: string | undefined, planName: string) => {
    if (!priceId) {
      router.push('/auth/signup');
      return;
    }

    // Verify user is logged in before calling checkout
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/auth/login?redirect=/pricing`);
      return;
    }

    setLoading(planName);

    try {
      capture('checkout_started', { priceId, billingCycle, planName });
      console.log('Stripe checkout: sending request', { priceId, billingCycle });
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, billingCycle }),
      });

      console.log('Stripe checkout: response status', res.status);
      const text = await res.text();
      console.log('Stripe checkout: response body', text);

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server returned invalid response (status ${res.status}): ${text.substring(0, 200)}`);
      }

      if (data.url) {
        // Store transaction data before Stripe redirect (for Awin tracking on return)
        // Note: orderRef will be overridden by subscription ID from sync response
        const tier = planName.toLowerCase();
        sessionStorage.setItem('awin_checkout', JSON.stringify({ tier }));
        window.location.href = data.url;
      } else if (data.alreadySubscribed) {
        alert('You are already on this plan.');
        setLoading(null);
      } else {
        throw new Error(data.error || `No checkout URL returned (status ${res.status})`);
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      alert(error.message || 'Failed to start subscription. Please try again.');
      setLoading(null);
    }
  };

  const handleWaitlistPlan = (planKey: string) => {
    setWaitlistPlan(planKey);
    setWaitlistSuccess(false);
    setWaitlistError('');
  };

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading('waitlist');
    setWaitlistError('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: waitlistName,
          email: waitlistEmail,
          plan_preference: waitlistPlan,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join waitlist');
      }

      setWaitlistSuccess(true);
      setWaitlistEmail('');
      setWaitlistName('');
    } catch (err: any) {
      setWaitlistError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <PublicNavbar />

      {/* Spacer for fixed navbar */}
      <div className="h-16" />

      {/* Waitlist Banner */}
      {WAITLIST_MODE && (
        <div className="bg-mint-400/5 border-b border-mint-400/20">
          <div className="container mx-auto px-4 md:px-6 py-3 text-center">
            <p className="text-mint-400 text-sm font-medium">
              Launching soon - join the waitlist for early access and 30% off your first month
            </p>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="container mx-auto px-4 md:px-6 py-8 md:py-12 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-mint-400/10 px-4 py-2 text-sm text-mint-400 border border-mint-400/20 mb-8">
            <TrendingUp className="h-4 w-4" />
            AI-powered consumer rights for UK households
          </div>

          <h1 className="font-[family-name:var(--font-heading)] text-3xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
            Simple, transparent pricing
          </h1>

          {/* Founding Member Banner */}
          {foundingSpots !== null && foundingSpots > 0 ? (
            <div className="bg-mint-400/10 border border-mint-400/30 rounded-2xl px-6 py-4 max-w-2xl mx-auto mb-8">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Gift className="h-5 w-5 text-mint-400" />
                <p className="text-mint-400 font-bold text-lg">Get Pro FREE for 30 days</p>
              </div>
              <p className="text-slate-400 text-sm">Only 25 free spaces available. No card required. Full Pro access for 30 days.</p>
            </div>
          ) : (
            <div className="bg-brand-400/10 border border-brand-400/30 rounded-2xl px-6 py-4 max-w-2xl mx-auto mb-8">
              <p className="text-brand-400 font-semibold text-lg">Founding member pricing</p>
              <p className="text-slate-400 text-sm mt-1">Price increases after our first 1,000 members</p>
            </div>
          )}

          <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include our AI agents working 24/7 to get your money back.
          </p>
        </motion.div>

        {/* Billing Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex items-center justify-center gap-4 mb-8"
        >
          <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-white' : 'text-slate-500'}`}>
            Monthly
          </span>
          <button
            onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
            className="relative w-14 h-7 bg-navy-800 border border-navy-700/50 rounded-full transition-all"
          >
            <div
              className={`absolute top-1 left-1 w-5 h-5 bg-mint-400 rounded-full transition-transform ${
                billingCycle === 'yearly' ? 'translate-x-7' : ''
              }`}
            />
          </button>
          <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-white' : 'text-slate-500'}`}>
            Yearly
            <span className="ml-2 text-mint-400 text-xs">(Save 17%)</span>
          </span>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
          {plans.map((plan, index) => {
            const price = billingCycle === 'monthly' ? plan.price.monthly : plan.price.yearly;
            const priceId = plan.priceIds?.[billingCycle];

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className={`relative bg-navy-900 border rounded-2xl p-8 transition-all ${
                  plan.highlighted
                    ? 'border-mint-400/50 ring-2 ring-mint-400/50 scale-100 md:scale-105'
                    : 'border-navy-700/50'
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-mint-400 text-navy-950 px-4 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </div>
                )}

                {plan.planKey !== 'free' && (
                  <div className="mb-4">
                    <span className="inline-block bg-mint-400/10 text-mint-400 text-xs font-semibold px-3 py-1 rounded-full border border-mint-400/20">
                      Founding Member Pricing
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-white">{plan.name}</h3>
                    {plan.trial && !WAITLIST_MODE && (
                      <span className="bg-mint-400/10 text-mint-400 text-xs font-medium px-2 py-0.5 rounded-full border border-mint-400/20">
                        7-day free trial
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 text-sm mb-4">{plan.description}</p>

                  <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-3xl md:text-5xl font-bold text-white">&pound;{price}</span>
                    {price > 0 && (
                      <span className="text-slate-400">
                        /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                      </span>
                    )}
                  </div>

                  {billingCycle === 'yearly' && price > 0 && (
                    <p className="text-sm text-slate-400">
                      &pound;{(price / 12).toFixed(2)}/month billed annually
                      <span className="ml-2 inline-block bg-mint-400/10 text-mint-400 text-xs font-semibold px-2 py-0.5 rounded-full border border-mint-400/20">Best Value</span>
                    </p>
                  )}
                </div>

                {WAITLIST_MODE ? (
                  <button
                    onClick={() => handleWaitlistPlan(plan.planKey)}
                    className={`w-full py-3 rounded-xl font-semibold transition-all ${
                      plan.highlighted
                        ? 'bg-mint-400 hover:bg-mint-500 text-navy-950'
                        : 'bg-navy-800 hover:bg-navy-700 text-white border border-navy-700/50'
                    }`}
                  >
                    {plan.waitlistCta}
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubscribe(priceId, plan.name)}
                    disabled={loading === plan.name}
                    className={`w-full py-3 rounded-xl font-semibold transition-all ${
                      plan.highlighted
                        ? 'bg-mint-400 hover:bg-mint-500 text-navy-950'
                        : 'bg-navy-800 hover:bg-navy-700 text-white border border-navy-700/50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loading === plan.name ? 'Loading...' : plan.cta}
                  </button>
                )}
                {plan.trial && !WAITLIST_MODE && (
                  <p className="text-xs text-slate-500 text-center mt-2 mb-4">
                    No card required during trial. Cancel anytime.
                  </p>
                )}
                {(!plan.trial || WAITLIST_MODE) && <div className="mb-6" />}

                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-mint-400 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        {/* Waitlist modal/form when a plan is selected */}
        {WAITLIST_MODE && waitlistPlan && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
            <div className="bg-navy-900 border border-navy-700/50 rounded-2xl p-8 max-w-md w-full shadow-2xl">
              {waitlistSuccess ? (
                <div className="text-center py-4">
                  <div className="bg-mint-400/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="h-8 w-8 text-mint-400" />
                  </div>
                  <h3 className="font-[family-name:var(--font-heading)] text-2xl font-bold text-white mb-2">You&apos;re on the list!</h3>
                  <p className="text-slate-400 mb-2">We&apos;ll be in touch when we launch.</p>
                  <p className="text-mint-400 text-sm font-medium mb-6">You&apos;ll get 30% off your first month as an early supporter.</p>
                  <button
                    onClick={() => setWaitlistPlan(null)}
                    className="text-slate-400 hover:text-white text-sm"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                  <div className="text-center mb-2">
                    <h3 className="font-[family-name:var(--font-heading)] text-xl font-bold text-white mb-1">
                      Join the waitlist - {waitlistPlan.charAt(0).toUpperCase() + waitlistPlan.slice(1)} plan
                    </h3>
                    <p className="text-slate-400 text-sm">Get early access and 30% off your first month.</p>
                  </div>

                  <div>
                    <input
                      type="text"
                      required
                      value={waitlistName}
                      onChange={(e) => setWaitlistName(e.target.value)}
                      className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                      placeholder="Your name"
                    />
                  </div>

                  <div>
                    <input
                      type="email"
                      required
                      value={waitlistEmail}
                      onChange={(e) => setWaitlistEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-navy-950 border border-navy-700/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-mint-400 focus:ring-1 focus:ring-mint-400"
                      placeholder="you@example.com"
                    />
                  </div>

                  {waitlistError && (
                    <p className="text-red-400 text-sm">{waitlistError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading === 'waitlist'}
                    className="w-full bg-mint-400 hover:bg-mint-500 text-navy-950 font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading === 'waitlist' ? 'Joining...' : 'Join Waitlist'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setWaitlistPlan(null)}
                    className="w-full text-slate-400 hover:text-white text-sm py-2"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Trust Section */}
        <div className="mt-16 pt-16 border-t border-navy-700/50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="text-center"
            >
              <Zap className="h-8 w-8 text-mint-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-2">Instant Setup</h3>
              <p className="text-slate-400 text-sm">
                Start saving money in minutes. No technical setup required.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="text-center"
            >
              <TrendingUp className="h-8 w-8 text-mint-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-2">Legally Grounded</h3>
              <p className="text-slate-400 text-sm">
                Every letter cites the exact UK consumer law that applies - Consumer Rights Act 2015, Ofcom, FCA rules.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
              className="text-center"
            >
              <Sparkles className="h-8 w-8 text-mint-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-2">Cancel Anytime</h3>
              <p className="text-slate-400 text-sm">
                No lock-in. Cancel your subscription whenever you want.
              </p>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer matching landing page */}
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
            <div className="flex items-center gap-2 text-slate-600 text-xs">
              <span className="inline-block w-4 h-3 bg-gradient-to-b from-blue-600 via-white to-red-600 rounded-sm" />
              Made in the UK
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
