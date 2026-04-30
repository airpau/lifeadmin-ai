'use client';

/**
 * PricingCTA — client-side subscribe / upgrade button for /pricing.
 *
 * Three states based on the user's auth + subscription status:
 *
 *   Logged-out
 *     → Plain link to /auth/signup with plan query param. Checkout
 *       runs after they confirm their email.
 *
 *   Logged-in, free / no active sub
 *     → On click, POSTs /api/stripe/checkout. Server creates a fresh
 *       Stripe Checkout session and we redirect to Stripe to collect
 *       payment for the first time. Same as before.
 *
 *   Logged-in, has active paid sub on a DIFFERENT price (Essential→Pro,
 *   monthly→yearly, etc.)
 *     → On click, POSTs /api/stripe/checkout. Server detects the
 *       existing sub and updates it with `proration_behavior=always_invoice`
 *       — Stripe credits unused time on the old plan and immediately
 *       bills the prorated upcharge using the saved card. No Stripe
 *       Checkout redirect needed.
 *
 *     Before the click, we fetch /api/stripe/upgrade-preview so the
 *     button label shows the real prorated amount: "Upgrade — £4.83 today"
 *     instead of the headline £9.99 that would otherwise scare a user
 *     who paid for Essential earlier in the cycle.
 *
 *   Logged-in, has active sub on the SAME price (already on this plan)
 *     → Disabled state with "Current plan" label. No checkout call.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { PRICE_IDS } from '@/lib/stripe';
import { capture as posthogCapture } from '@/lib/posthog';

// Basic-but-sensible email regex — local@host.tld, no spaces, no
// double-@. Real validation is server-side; this just stops obvious
// typos so we don't push junk into consumer_leads.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Read UTM params from the current URL — best-effort, never throws. */
function readUtm(): { utm_source?: string; utm_medium?: string; utm_campaign?: string } {
  if (typeof window === 'undefined') return {};
  try {
    const sp = new URLSearchParams(window.location.search);
    const out: { utm_source?: string; utm_medium?: string; utm_campaign?: string } = {};
    const s = sp.get('utm_source');
    const m = sp.get('utm_medium');
    const c = sp.get('utm_campaign');
    if (s) out.utm_source = s;
    if (m) out.utm_medium = m;
    if (c) out.utm_campaign = c;
    return out;
  } catch {
    return {};
  }
}

type Plan = 'free' | 'essential' | 'pro';

interface Props {
  plan: Plan;
  className: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** billing cycle to charge. Defaults to monthly. */
  billingCycle?: 'monthly' | 'yearly';
}

interface PreviewState {
  hasExistingSub: boolean;
  prorated_amount_pennies: number;
  prorated_amount_display: string;
  current_price_id?: string;
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
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // Inline email gate for logged-out paid-plan clicks.
  const [showEmailGate, setShowEmailGate] = useState(false);
  const [gateEmail, setGateEmail] = useState('');
  const [gateError, setGateError] = useState<string | null>(null);
  const supabase = createClient();
  const priceId = priceIdFor(plan, billingCycle);

  // Resolve auth state
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setIsAuthed(!!data.user);
    }).catch(() => {
      if (!cancelled) setIsAuthed(false);
    });
    return () => { cancelled = true; };
  }, [supabase]);

  // For paid plans, once we know the user is authed, ask Stripe what
  // an upgrade would actually cost right now. This is what lets us
  // show "Upgrade — £4.83 today" instead of the headline £9.99 to a
  // user who already paid for Essential earlier in the cycle.
  useEffect(() => {
    if (!isAuthed || plan === 'free' || !priceId) return;
    let cancelled = false;
    fetch(`/api/stripe/upgrade-preview?priceId=${encodeURIComponent(priceId)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data) setPreview(data);
      })
      .catch(() => { /* preview is best-effort; fall back to headline price */ });
    return () => { cancelled = true; };
  }, [isAuthed, plan, priceId]);

  // Free tier always routes to signup
  if (plan === 'free') {
    return (
      <Link className={className} href="/auth/signup" style={style}>
        {children}
      </Link>
    );
  }

  // While auth is loading, render a non-interactive placeholder that
  // looks the same so the button doesn't pop in.
  if (isAuthed === null) {
    return (
      <Link className={className} href={`/auth/signup?plan=${plan}`} style={style} aria-busy="true">
        {children}
      </Link>
    );
  }

  // Logged-out, paid plan → inline email gate (Option A).
  // Capture email before bouncing to /auth/signup so we still have a
  // lead row even if the visitor bails at signup or Stripe.
  //
  // The flow is intentionally non-modal: the CTA button morphs into a
  // small inline email input + Continue / Cancel pair, sized to fit the
  // existing button slot so the pricing card layout doesn't reflow. On
  // submit we POST /api/leads/capture (best-effort — DB hiccups never
  // block the redirect to signup) and fire a `lead_captured` PostHog
  // event, then redirect to /auth/signup?plan=… so the existing signup
  // flow handles auth + Stripe checkout from there.
  if (!isAuthed) {
    if (!showEmailGate) {
      return (
        <a
          className={className}
          href={`/auth/signup?plan=${plan}`}
          style={style}
          onClick={(e) => {
            e.preventDefault();
            setGateEmail('');
            setGateError(null);
            setShowEmailGate(true);
          }}
        >
          {children}
        </a>
      );
    }

    const submitGate = async (e: React.FormEvent) => {
      e.preventDefault();
      const email = gateEmail.trim();
      if (!EMAIL_RE.test(email)) {
        setGateError('Please enter a valid email address.');
        return;
      }
      setGateError(null);
      setLoading(true);

      // Best-effort lead capture. We deliberately do NOT block the
      // redirect on this — if our DB hiccups, we still want the
      // visitor to reach the signup flow.
      const utm = readUtm();
      try {
        await fetch('/api/leads/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            // server enum is 'pricing_page_exit' — covers pricing-page
            // captures, including bounces before reaching Stripe.
            source: 'pricing_page_exit',
            intended_tier: plan,
            intended_billing_interval: billingCycle,
            ...utm,
          }),
        });
      } catch {
        // Swallow — capture is best-effort.
      }

      try {
        posthogCapture('lead_captured', {
          source: 'pricing_page',
          intended_tier: plan,
          intended_billing_interval: billingCycle,
          ...utm,
        });
      } catch {
        // Swallow — analytics is best-effort.
      }

      // Pass the email through to signup so the form is pre-filled.
      const params = new URLSearchParams({ plan, email });
      window.location.href = `/auth/signup?${params.toString()}`;
    };

    // Inline gate — sized to fit roughly inside the existing CTA slot.
    return (
      <form
        onSubmit={submitGate}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          width: '100%',
          ...style,
        }}
        aria-label="Enter your email to continue"
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoFocus
          required
          placeholder="you@example.com"
          value={gateEmail}
          onChange={(e) => setGateEmail(e.target.value)}
          aria-label="Email address"
          aria-invalid={gateError ? true : undefined}
          style={{
            padding: '12px 14px',
            fontSize: 15,
            borderRadius: 10,
            border: '1px solid var(--divider)',
            background: '#fff',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        {gateError && (
          <div role="alert" style={{ fontSize: 13, color: '#B91C1C' }}>{gateError}</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit"
            className={className}
            disabled={loading}
            style={{ flex: 1, cursor: loading ? 'wait' : 'pointer' }}
            aria-busy={loading}
          >
            {loading ? 'Continuing…' : 'Continue to checkout →'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowEmailGate(false);
              setGateError(null);
            }}
            disabled={loading}
            style={{
              padding: '0 14px',
              fontSize: 14,
              background: 'transparent',
              border: '1px solid var(--divider)',
              borderRadius: 10,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
            aria-label="Cancel"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // Already on this exact plan → disabled "Current plan" pill.
  const onThisPlan = preview?.current_price_id && preview.current_price_id === priceId;
  if (onThisPlan) {
    return (
      <span
        className={className}
        style={{ ...style, opacity: 0.6, cursor: 'default' }}
        aria-disabled="true"
      >
        Current plan
      </span>
    );
  }

  // Logged-in user, paid plan, not already on it → upgrade or fresh-sub.
  const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (loading || !priceId) return;

    // Always confirm before charging the user. Three states to handle:
    //
    //   A) preview hasn't loaded yet → block the click and tell them to
    //      wait a moment. Without this, a fast click can race ahead of
    //      the preview fetch and we'd end up charging them with no
    //      confirmation dialog at all (bug Paul hit 2026-04-27).
    //
    //   B) preview loaded, has existing sub, prorated > 0 → upgrade
    //      confirmation with the actual £ amount.
    //
    //   C) preview loaded, no existing sub → fresh subscribe; show a
    //      generic "you'll be charged £X.XX" confirmation. The Stripe
    //      Checkout page will also show the price, but we owe them an
    //      in-app confirm too — same standard as a downgrade or any
    //      other money-moving click.
    if (preview === null) {
      // Preview is still in flight. Bail out gracefully — they haven't
      // been charged anything, button just doesn't do anything until
      // the preview lands. The label flips to "Upgrade — £X.XX today"
      // (or stays as the headline) once preview resolves.
      return;
    }

    if (preview.hasExistingSub && preview.prorated_amount_pennies > 0) {
      // Upgrade flow — show prorated total.
      const confirmed = window.confirm(
        `Upgrading to ${plan === 'pro' ? 'Pro' : 'Essential'} will charge ${preview.prorated_amount_display} to your card on file today.\n\nThis is the prorated upgrade — you get a credit for the unused days on your current plan, and pay only the difference for the rest of this billing cycle.\n\nFrom your next billing date you'll be charged the full ${plan === 'pro' ? '£9.99' : '£4.99'}/month rate. Continue?`,
      );
      if (!confirmed) return;
    } else if (!preview.hasExistingSub) {
      // Fresh-subscribe flow — Stripe Checkout will collect the card,
      // but we still confirm the headline price first.
      const confirmed = window.confirm(
        `You'll be taken to a secure Stripe checkout page to start your ${plan === 'pro' ? 'Pro (£9.99/mo)' : 'Essential (£4.99/mo)'} plan. You can cancel anytime. Continue?`,
      );
      if (!confirmed) return;
    }
    // Else: existing sub but prorated_amount=0 (e.g. free trial overlap).
    // Charge is £0 today, so no dialog needed — let it through.

    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, billingCycle }),
      });

      const text = await res.text();
      let data: {
        url?: string;
        upgraded?: boolean;
        redirectUrl?: string;
        alreadySubscribed?: boolean;
        error?: string;
      };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Checkout returned ${res.status}: ${text.slice(0, 200)}`);
      }

      // Three response shapes:
      //   { url } → fresh Checkout session, redirect to Stripe
      //   { upgraded: true, redirectUrl } → already-charged via proration,
      //                                     bounce to dashboard with banner
      //   { alreadySubscribed } → friendly toast, no redirect
      if (data.url) {
        try { sessionStorage.setItem('awin_checkout', JSON.stringify({ tier: plan })); } catch { /* sessionStorage may be blocked */ }
        window.location.href = data.url;
        return;
      }
      if (data.upgraded && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      if (data.alreadySubscribed) {
        alert('You are already on this plan.');
        setLoading(false);
        return;
      }
      throw new Error(data.error || `Checkout failed (status ${res.status})`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start checkout. Please try again.';
      console.error('PricingCTA checkout error:', err);
      alert(message);
      setLoading(false);
    }
  };

  // Render label — for an authenticated upgrade we surface the real
  // prorated amount inline so the button doesn't lie. Falls back to
  // the original `children` label when we're still loading the
  // preview or when it's not an upgrade scenario.
  const showProratedLabel =
    preview?.hasExistingSub &&
    preview.prorated_amount_pennies > 0 &&
    !loading;

  return (
    <a
      className={className}
      href={`/auth/signup?plan=${plan}`}
      style={style}
      onClick={handleClick}
      aria-busy={loading}
    >
      {loading
        ? 'Starting checkout…'
        : showProratedLabel
          ? `Upgrade — ${preview!.prorated_amount_display} today`
          : children}
    </a>
  );
}
