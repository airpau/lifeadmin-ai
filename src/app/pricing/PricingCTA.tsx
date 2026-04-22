'use client';

/**
 * PricingCTA — client-side subscribe button for the /pricing marketing page.
 *
 * Behaviour:
 *   - Logged-out user: plain link to /auth/signup (with plan query param)
 *   - Logged-in user: POSTs to /api/stripe/checkout and redirects to Stripe
 *   - Already-on-plan: friendly alert, no redirect
 *
 * Drop-in replacement for the three <Link href="/auth/signup"> CTAs on the
 * redesigned /pricing page. Keeps the same classes/inline styles so the
 * visual design is unchanged.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PRICE_IDS } from '@/lib/stripe';

type Plan = 'free' | 'essential' | 'pro';

interface Props {
  plan: Plan;
  className: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** billing cycle to charge. Defaults to monthly. */
  billingCycle?: 'monthly' | 'yearly';
}

function priceIdFor(plan: Plan, cycle: 'monthly' | 'yearly'): string | undefined {
  if (plan === 'essential') {
    return cycle === 'yearly' ? PRICE_IDS.essential_yearly : PRICE_IDS.essential_monthly;
  }
  if (plan === 'pro') {
    return cycle === 'yearly' ? PRICE_IDS.pro_yearly : PRICE_IDS.pro_monthly;
  }
  return undefined;
}

export default function PricingCTA({ plan, className, children, style, billingCycle = 'monthly' }: Props) {
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setIsAuthed(!!data.user);
    }).catch(() => {
      if (!cancelled) setIsAuthed(false);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  // Free tier always routes to signup
  if (plan === 'free') {
    return (
      <Link className={className} href="/auth/signup" style={style}>
        {children}
      </Link>
    );
  }

  // While auth is loading, render a non-interactive placeholder that looks the same.
  if (isAuthed === null) {
    return (
      <Link className={className} href={`/auth/signup?plan=${plan}`} style={style} aria-busy="true">
        {children}
      </Link>
    );
  }

  // Logged-out users: preserve the existing redesign behaviour
  if (!isAuthed) {
    return (
      <Link className={className} href={`/auth/signup?plan=${plan}`} style={style}>
        {children}
      </Link>
    );
  }

  // Logged-in users: click calls /api/stripe/checkout and redirects to Stripe.
  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (loading) return;
    const priceId = priceIdFor(plan, billingCycle);
    if (!priceId) {
      window.location.href = '/dashboard';
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, billingCycle }),
      });

      const text = await res.text();
      let data: { url?: string; alreadySubscribed?: boolean; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Checkout returned ${res.status}: ${text.slice(0, 200)}`);
      }

      if (data.url) {
        try { sessionStorage.setItem('awin_checkout', JSON.stringify({ tier: plan })); } catch {}
        window.location.href = data.url;
        return;
      }
      if (data.alreadySubscribed) {
        alert('You are already on this plan.');
        setLoading(false);
        return;
      }
      throw new Error(data.error || `No checkout URL returned (status ${res.status})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout. Please try again.';
      console.error('PricingCTA checkout error:', err);
      alert(message);
      setLoading(false);
    }
  };

  return (
    <a
      className={className}
      href={`/auth/signup?plan=${plan}`}
      style={style}
      onClick={handleClick}
      aria-busy={loading}
    >
      {loading ? 'Starting checkout…' : children}
    </a>
  );
}
