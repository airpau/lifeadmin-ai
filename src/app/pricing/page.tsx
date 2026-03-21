'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { PRICE_IDS } from '@/lib/stripe';
import Image from 'next/image';
import { Check, Sparkles, TrendingUp, Zap, Users } from 'lucide-react';
import { WAITLIST_MODE } from '@/lib/config';

const plans = [
  {
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    description: 'Perfect for trying out Paybacker',
    features: [
      '3 AI complaint letters per month',
      'Basic bill scanner',
      'Subscription tracker (up to 10)',
      'Email support',
    ],
    cta: 'Get started free',
    waitlistCta: 'Join Waitlist — Free',
    highlighted: false,
    trial: false,
    planKey: 'free' as const,
  },
  {
    name: 'Essential',
    price: { monthly: 9.99, yearly: 99 },
    description: 'For active money savers',
    features: [
      'Unlimited AI complaint letters',
      'Email inbox scanner',
      'Unlimited subscription tracking',
      'Auto-cancellation emails',
      'Priority email support',
      'AI complaint letters citing Consumer Rights Act 2015',
    ],
    cta: 'Start 7-day free trial',
    waitlistCta: 'Join Waitlist — Essential',
    highlighted: true,
    trial: true,
    planKey: 'essential' as const,
    priceIds: {
      monthly: PRICE_IDS.essential_monthly,
      yearly:  PRICE_IDS.essential_yearly,
    },
  },
  {
    name: 'Pro',
    price: { monthly: 19.99, yearly: 199 },
    description: 'For serious life admin automation',
    features: [
      'Everything in Essential',
      'Open banking integration',
      'Phone support',
      'Dedicated account manager',
      'Advanced analytics dashboard',
      'Solicitor-quality letter generation in seconds',
    ],
    cta: 'Start 7-day free trial',
    waitlistCta: 'Join Waitlist — Pro',
    highlighted: false,
    trial: true,
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
  const router = useRouter();
  const supabase = createClient();

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

      if (data.upgraded) {
        // Plan was upgraded in-place, redirect to dashboard
        window.location.href = data.url;
      } else if (data.url) {
        // New subscription, redirect to Stripe checkout
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
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="relative">
        {/* Header */}
        <header className="container mx-auto px-6 py-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Paybacker" width={32} height={32} />
            <span className="text-xl font-bold text-white">
              Pay<span className="text-amber-500">backer</span>
            </span>
          </Link>
        </header>

        {/* Waitlist Banner */}
        {WAITLIST_MODE && (
          <div className="bg-gradient-to-r from-amber-500/10 to-amber-600/10 border-y border-amber-500/20">
            <div className="container mx-auto px-6 py-3 text-center">
              <p className="text-amber-400 text-sm font-medium">
                Launching soon — join the waitlist for early access and 30% off your first month
              </p>
            </div>
          </div>
        )}

        {/* Hero */}
        <div className="container mx-auto px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 px-4 py-2 rounded-full text-amber-400 text-sm mb-6">
            <TrendingUp className="h-4 w-4" />
            AI-powered consumer rights for UK households
          </div>

          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto">
            Choose the plan that fits your needs. All plans include our AI agents working 24/7 to get your money back.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mb-16">
            <span className={`text-sm font-medium ${billingCycle === 'monthly' ? 'text-white' : 'text-slate-500'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-14 h-7 bg-slate-800 rounded-full transition-all"
            >
              <div
                className={`absolute top-1 left-1 w-5 h-5 bg-amber-500 rounded-full transition-transform ${
                  billingCycle === 'yearly' ? 'translate-x-7' : ''
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${billingCycle === 'yearly' ? 'text-white' : 'text-slate-500'}`}>
              Yearly
              <span className="ml-2 text-green-500 text-xs">(Save 17%)</span>
            </span>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {plans.map((plan) => {
              const price = billingCycle === 'monthly' ? plan.price.monthly : plan.price.yearly;
              const priceId = plan.priceIds?.[billingCycle];

              return (
                <div
                  key={plan.name}
                  className={`relative bg-slate-900/80 backdrop-blur-sm rounded-2xl p-8 transition-all ${
                    plan.highlighted
                      ? 'border-2 border-amber-500 scale-105'
                      : 'border border-slate-800'
                  }`}
                >
                  {plan.highlighted && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 px-4 py-1 rounded-full text-sm font-semibold">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-2xl font-bold text-white">{plan.name}</h3>
                      {plan.trial && !WAITLIST_MODE && (
                        <span className="bg-green-500/15 text-green-400 text-xs font-medium px-2 py-0.5 rounded-full border border-green-500/30">
                          7-day free trial
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-sm mb-4">{plan.description}</p>

                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-5xl font-bold text-white">£{price}</span>
                      {price > 0 && (
                        <span className="text-slate-400">
                          /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                        </span>
                      )}
                    </div>

                    {billingCycle === 'yearly' && price > 0 && (
                      <p className="text-sm text-slate-500">
                        £{(price / 12).toFixed(2)}/month billed annually
                      </p>
                    )}
                  </div>

                  {WAITLIST_MODE ? (
                    <button
                      onClick={() => handleWaitlistPlan(plan.planKey)}
                      className={`w-full py-3 rounded-lg font-semibold transition-all ${
                        plan.highlighted
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
                      }`}
                    >
                      {plan.waitlistCta}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(priceId, plan.name)}
                      disabled={loading === plan.name}
                      className={`w-full py-3 rounded-lg font-semibold transition-all ${
                        plan.highlighted
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950'
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
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
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-slate-300 text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Waitlist modal/form when a plan is selected */}
          {WAITLIST_MODE && waitlistPlan && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-md w-full shadow-2xl">
                {waitlistSuccess ? (
                  <div className="text-center py-4">
                    <div className="bg-green-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Check className="h-8 w-8 text-green-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">You're on the list!</h3>
                    <p className="text-slate-400 mb-2">We'll be in touch when we launch.</p>
                    <p className="text-amber-400 text-sm font-medium mb-6">You'll get 30% off your first month as an early supporter.</p>
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
                      <h3 className="text-xl font-bold text-white mb-1">
                        Join the waitlist — {waitlistPlan.charAt(0).toUpperCase() + waitlistPlan.slice(1)} plan
                      </h3>
                      <p className="text-slate-400 text-sm">Get early access and 30% off your first month.</p>
                    </div>

                    <div>
                      <input
                        type="text"
                        required
                        value={waitlistName}
                        onChange={(e) => setWaitlistName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        placeholder="Your name"
                      />
                    </div>

                    <div>
                      <input
                        type="email"
                        required
                        value={waitlistEmail}
                        onChange={(e) => setWaitlistEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        placeholder="you@example.com"
                      />
                    </div>

                    {waitlistError && (
                      <p className="text-red-400 text-sm">{waitlistError}</p>
                    )}

                    <button
                      type="submit"
                      disabled={loading === 'waitlist'}
                      className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="mt-16 pt-16 border-t border-slate-800">
            <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
              <div className="text-center">
                <Zap className="h-8 w-8 text-amber-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white mb-2">Instant Setup</h3>
                <p className="text-slate-400 text-sm">
                  Start saving money in minutes. No technical setup required.
                </p>
              </div>

              <div className="text-center">
                <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white mb-2">Legally Grounded</h3>
                <p className="text-slate-400 text-sm">
                  Every letter cites the exact UK consumer law that applies — Consumer Rights Act 2015, Ofcom, FCA rules.
                </p>
              </div>

              <div className="text-center">
                <Sparkles className="h-8 w-8 text-blue-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white mb-2">Cancel Anytime</h3>
                <p className="text-slate-400 text-sm">
                  No lock-in. Cancel your subscription whenever you want.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="container mx-auto px-6 py-8 mt-16 border-t border-slate-800">
          <div className="text-center text-slate-500 text-sm">
            <p>© 2026 Paybacker LTD. All prices exclude VAT.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
