'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Check, Sparkles, TrendingUp, Zap } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    price: { monthly: 0, yearly: 0 },
    description: 'Perfect for trying out PayBacker',
    features: [
      '3 AI complaint letters per month',
      'Basic bill scanner',
      'Subscription tracker (up to 10)',
      'Email support',
    ],
    cta: 'Get Started',
    highlighted: false,
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
    cta: 'Start Essential',
    highlighted: true,
    priceIds: {
      monthly: 'price_1TD5440Vgfu778nlLrs7RXrS',
      yearly:  'price_1TD5440Vgfu778nlCozaO1Oz',
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
    cta: 'Start Pro',
    highlighted: false,
    priceIds: {
      monthly: 'price_1TD5440Vgfu778nlP3GzMuQG',
      yearly:  'price_1TD5450Vgfu778nljBU1F1uN',
    },
  },
];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState<string | null>(null);
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
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, billingCycle }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'No checkout URL returned');
      }
    } catch (error: any) {
      console.error('Subscription error:', error);
      alert(error.message || 'Failed to start subscription. Please try again.');
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="relative">
        {/* Header */}
        <header className="container mx-auto px-6 py-6">
          <Link href="/" className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-amber-500" />
            <span className="text-xl font-bold text-white">
              Pay<span className="text-amber-500">Backer</span>
            </span>
          </Link>
        </header>

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
                    <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
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

                  <button
                    onClick={() => handleSubscribe(priceId, plan.name)}
                    disabled={loading === plan.name}
                    className={`w-full py-3 rounded-lg font-semibold transition-all mb-6 ${
                      plan.highlighted
                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loading === plan.name ? 'Loading...' : plan.cta}
                  </button>

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
            <p>© 2026 PayBacker. All prices exclude VAT.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
