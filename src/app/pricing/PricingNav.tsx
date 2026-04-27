'use client';

/**
 * PricingNav — auth-aware nav rendered at the top of /pricing.
 *
 * Replaces the previous server-only MarkNav inline component which
 * always rendered "Sign in / Start Free" CTAs regardless of auth
 * state. Logged-in users hitting /pricing from the in-app
 * "Upgrade to Pro" buttons saw those CTAs and felt logged out —
 * the page looked like the public marketing site, not part of
 * their dashboard.
 *
 * Logged-in: replaces the right-hand CTAs with a "Dashboard" link
 * (white pill) and a tier badge so the user knows where they stand.
 * The actual upgrade buttons on the pricing cards (PricingCTA)
 * already handle the upgrade flow correctly via /api/stripe/checkout.
 *
 * Logged-out: renders the original Sign in / Start Free CTAs.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type ActiveLink = 'About' | 'Pricing' | 'Blog' | 'Careers';
type Tier = 'free' | 'essential' | 'pro';

const NAV_LINKS: ReadonlyArray<readonly [ActiveLink, string]> = [
  ['About', '/about'],
  ['Pricing', '/pricing'],
  ['Blog', '/blog'],
  ['Careers', '/careers'],
];

interface AuthSnapshot {
  loggedIn: boolean;
  tier: Tier | null;
}

export default function PricingNav({ active }: { active: ActiveLink }) {
  const [auth, setAuth] = useState<AuthSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        if (!cancelled) setAuth({ loggedIn: false, tier: null });
        return;
      }
      // Get the user's tier so we can show "Current: Essential" /
      // disable the matching CTA on the pricing card.
      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', data.user.id)
        .maybeSingle();
      const tier = (profile?.subscription_tier as Tier | null) ?? 'free';
      if (!cancelled) setAuth({ loggedIn: true, tier });
    })().catch(() => {
      if (!cancelled) setAuth({ loggedIn: false, tier: null });
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="nav-shell">
      <nav className="nav-pill" aria-label="Primary">
        <Link className="nav-logo" href={auth?.loggedIn ? '/dashboard' : '/'}>
          <span className="pay">Pay</span>
          <span className="backer">backer</span>
        </Link>

        <div className="nav-links">
          {NAV_LINKS.map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className={active === label ? 'is-active' : undefined}
              aria-current={active === label ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="nav-cta-row">
          {/*
            Three render states:
              auth=null     → still loading; render space-occupying
                              placeholders so the row width stays stable.
              loggedIn=true → "Dashboard" link + tier badge.
              loggedIn=false → original Sign in / Start Free CTAs.
          */}
          {auth === null ? (
            <>
              <span className="nav-signin" style={{ visibility: 'hidden' }}>—</span>
              <span className="nav-start" style={{ visibility: 'hidden' }}>—</span>
            </>
          ) : auth.loggedIn ? (
            <>
              {auth.tier && (
                <span
                  className="nav-signin"
                  style={{ pointerEvents: 'none', textTransform: 'capitalize' }}
                  aria-label={`Current plan: ${auth.tier}`}
                >
                  {auth.tier === 'free' ? 'Free plan' : `${auth.tier} plan`}
                </span>
              )}
              <Link className="nav-start" href="/dashboard">
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link className="nav-signin" href="/auth/login">Sign in</Link>
              <Link className="nav-start" href="/auth/signup">Start Free</Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );
}
